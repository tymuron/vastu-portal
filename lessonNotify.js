// ---------------------------------------------------------------------------
// New-lesson notifications. When a lesson opens on the platform, every
// student who has the course gets one email, and the course's Telegram
// channel gets one post.
//
// Anna, 10 Nov 2026: «можно сделать, так, чтобы им на почту приходило
// уведомление о новом уроке? И в телеграм курса?»
//
// A lesson is announced when ALL of these hold:
//   - its week is open: not is_locked, available_from passed — the same rule
//     as the student's course page (useWeeks);
//   - it opened at or after LESSON_NOTIFY_SINCE. A lesson added to an open
//     week opens when it is created, a lesson in a closed week when the week
//     opens. Anything older is never announced, so switching this on doesn't
//     announce the course so far (lesson 1 of «Васту-дизайн» included);
//   - it has something in it: a video, a description, homework or a file.
//     The editor creates a lesson with its title only and fills it in after;
//   - it has stayed unchanged for LESSON_NOTIFY_SETTLE_MIN minutes, so the
//     email isn't sent halfway through filling it in, and carries the final
//     title and description;
//   - it's daytime in Moscow (LESSON_NOTIFY_HOURS). available_from is
//     midnight UTC, so a week opens at 03:00 MSK; it's announced at 9:00.
// Lessons that come due in the same run go out as ONE email per student
// (a week opening with a lesson and a practice is one email, not two).
//
// Each lesson is announced once. lesson_announcements remembers it
// (settling → sending → sent), lesson_notifications holds one row per lesson
// per student, so later edits never send again and a crash halfway resumes
// where it stopped. Resend's Idempotency-Key covers the gap between a send
// and its row being marked.
//
// LESSON_NOTIFY = off (default) | dry-run (only logs who would get what) |
// live. Telegram posts need TELEGRAM_BOT_TOKEN and LESSON_NOTIFY_TELEGRAM.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { EMAIL_LIGHT_ONLY_HEAD, EMAIL_RE, normEmail } from './fulfilment.js';
import * as coverRenderers from './lessonCover.js';

export const LESSON_NOTIFY_DEFAULT_COURSES = ['vastu-design-2026', 'vastu-design-2026-pro'];

const MINUTE = 60 * 1000;
const QUARTER_HOUR = 15 * MINUTE;
const MAX_EMAIL_ATTEMPTS = 8;
const MAX_TG_ATTEMPTS = 5;
// A row left 'sending' this long was cut off mid-run (a deploy, a crash).
const STALE_MS = 10 * MINUTE;
// How long emails wait after Resend answers 429.
const RESEND_PAUSE_MS = 30 * MINUTE;
// PostgREST puts `in` lists in the URL; keep each under a few kilobytes.
const IN_CHUNK = 100;

// States a lesson can be in. The ones in WILL_ANNOUNCE end in an email.
export const STATES = {
    locked: 'its week has not opened yet',
    'before-since': 'opened before LESSON_NOTIFY_SINCE: never announced',
    'no-since': 'LESSON_NOTIFY_SINCE is not set: nothing is announced',
    empty: 'open, but nothing in it yet (title only)',
    new: 'open and filled in: starts its quiet period now',
    changed: 'edited during its quiet period: the period starts again',
    settling: 'waiting until it has stayed unchanged long enough',
    'waiting-hours': 'ready, waiting for the daytime window',
    due: 'announced in this run',
    sending: 'announced; some emails still to send',
    sent: 'announced',
    skipped: 'marked by hand as not to announce',
};
const WILL_ANNOUNCE = new Set(['new', 'changed', 'settling', 'waiting-hours', 'due']);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function listOf(raw) {
    return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function numberOf(raw, fallback, min) {
    if (raw == null || String(raw).trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min ? n : fallback;
}

export function readLessonNotifyConfig(env = process.env) {
    const problems = [];

    const rawMode = String(env.LESSON_NOTIFY ?? '').trim().toLowerCase().replace('_', '-');
    let mode = 'off';
    if (['dry-run', 'dryrun'].includes(rawMode)) mode = 'dry-run';
    else if (rawMode === 'live') mode = 'live';
    else if (rawMode && rawMode !== 'off') {
        problems.push(`LESSON_NOTIFY=«${env.LESSON_NOTIFY}» не понят (нужно off, dry-run или live) — уведомления выключены`);
    }

    let since = null;
    const sinceRaw = String(env.LESSON_NOTIFY_SINCE || '').trim();
    if (sinceRaw) {
        const t = Date.parse(sinceRaw);
        if (Number.isNaN(t)) problems.push(`LESSON_NOTIFY_SINCE=«${sinceRaw}» — не дата`);
        else since = t;
    }
    if (mode === 'live' && since == null) {
        problems.push('LESSON_NOTIFY_SINCE не задан — в режиме live ничего не отправляется');
    }

    const courses = listOf(env.LESSON_NOTIFY_COURSES);

    let hours = { from: 9, to: 21 };
    const rawHours = String(env.LESSON_NOTIFY_HOURS || '').trim();
    if (rawHours) {
        const m = rawHours.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
        const from = m ? Number(m[1]) : NaN;
        const to = m ? Number(m[2]) : NaN;
        if (m && from >= 0 && to <= 24 && from < to) hours = { from, to };
        else problems.push(`LESSON_NOTIFY_HOURS=«${rawHours}» — нужно «9-21»; взято 9-21`);
    }

    let tz = String(env.LESSON_NOTIFY_TZ || '').trim() || 'Europe/Moscow';
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    } catch {
        problems.push(`LESSON_NOTIFY_TZ=«${tz}» — нет такого часового пояса; взят Europe/Moscow`);
        tz = 'Europe/Moscow';
    }

    // vastu-design-2026=-1001234567890,other-course=@public_channel
    // A course posts to several chats when its slug repeats, and «id/42» posts
    // into topic 42 of a forum group (the last number of the topic's link):
    // vastu-design-2026=-1001234567890,vastu-design-2026=-1009876543210/2
    // chats[slug] lists them comma-separated, in the order given.
    const chats = {};
    for (const pair of listOf(env.LESSON_NOTIFY_TELEGRAM)) {
        const eq = pair.indexOf('=');
        const slug = eq > 0 ? pair.slice(0, eq).trim() : '';
        const chat = eq > 0 ? pair.slice(eq + 1).trim() : '';
        if (slug && /^(-?\d+|@[A-Za-z0-9_]{4,})(\/\d+)?$/.test(chat)) {
            const list = chats[slug] ? chats[slug].split(',') : [];
            if (!list.includes(chat)) list.push(chat);
            chats[slug] = list.join(',');
        } else {
            problems.push(`LESSON_NOTIFY_TELEGRAM: «${pair}» — нужно «slug курса=id канала» или «slug курса=id группы/номер темы»`);
        }
    }
    const token = String(env.TELEGRAM_BOT_TOKEN || '').trim() || null;
    if (Object.keys(chats).length && !token) {
        problems.push('LESSON_NOTIFY_TELEGRAM задан, а TELEGRAM_BOT_TOKEN нет — посты в Telegram не отправляются');
    }

    return {
        mode,
        since,
        courses: courses.length ? courses : [...LESSON_NOTIFY_DEFAULT_COURSES],
        settleMs: numberOf(env.LESSON_NOTIFY_SETTLE_MIN, 30, 0) * MINUTE,
        hours,
        tz,
        intervalMs: numberOf(env.LESSON_NOTIFY_INTERVAL_MIN, 5, 1) * MINUTE,
        telegram: { token, chats },
        problems,
    };
}

// ---------------------------------------------------------------------------
// Time window
// ---------------------------------------------------------------------------

export function localHour(ms, tz) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    return Number(parts.find((p) => p.type === 'hour')?.value);
}

export function inSendHours(ms, cfg) {
    const h = localHour(ms, cfg.tz);
    return h >= cfg.hours.from && h < cfg.hours.to;
}

// The first moment at or after `ms` inside the window.
export function nextSendTime(ms, cfg) {
    if (inSendHours(ms, cfg)) return ms;
    let t = Math.ceil(ms / QUARTER_HOUR) * QUARTER_HOUR;
    for (let i = 0; i < 4 * 48; i += 1, t += QUARTER_HOUR) {
        if (inSendHours(t, cfg)) return t;
    }
    return ms;
}

// ---------------------------------------------------------------------------
// Lesson text: the description is Quill HTML
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', shy: '' };

export function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
            const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
        }
        return ENTITIES[e.toLowerCase()] ?? m;
    });
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'tr', 'table', 'section', 'article', 'header', 'footer']);
const SKIP_TAGS = new Set(['script', 'style']);
const MARKER_ONLY = /^(•|\d+\.)$/;

// HTML -> what a reader sees, in blocks: each paragraph (its lines split at
// <br>) and each list (its items as «• …», numbered «1. …» in an <ol>) is one
// block. Entities decoded, empty paragraphs dropped.
export function htmlToBlocks(html) {
    const blocks = [];
    let out = [];
    const lists = [];
    let line = '';
    let skipping = null;
    const flush = () => {
        const t = line.replace(/\s+/g, ' ').trim();
        if (t && !MARKER_ONLY.test(t)) out.push(t);
        line = '';
    };
    const endBlock = () => {
        flush();
        if (out.length) blocks.push(out);
        out = [];
    };
    const re = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)|</gi;
    const src = String(html ?? '');
    let m;
    while ((m = re.exec(src))) {
        if (m[4] != null || m[0] === '<') {
            if (!skipping) line += decodeEntities(m[4] ?? '<');
            continue;
        }
        const closing = m[1] === '/';
        const tag = m[2].toLowerCase();
        if (SKIP_TAGS.has(tag)) {
            skipping = closing ? null : tag;
            continue;
        }
        if (skipping) continue;
        if (tag === 'br') {
            flush();
        } else if (tag === 'ol' || tag === 'ul') {
            endBlock();
            if (closing) lists.pop();
            else lists.push({ ordered: tag === 'ol', n: 0 });
        } else if (tag === 'li') {
            flush();
            if (!closing) {
                const list = lists[lists.length - 1];
                // Quill 2 writes every list as <ol> and says which on the item.
                const kind = /data-list\s*=\s*["']?(bullet|ordered)/i.exec(m[3] || '')?.[1]?.toLowerCase();
                const ordered = kind ? kind === 'ordered' : !!list?.ordered;
                if (list) list.n += 1;
                line = ordered ? `${list ? list.n : 1}. ` : '• ';
            }
        } else if (BLOCK_TAGS.has(tag)) {
            // A paragraph inside a list item stays part of the list, and keeps
            // the item's bullet when it opens right after it.
            if (!lists.length) endBlock();
            else if (!MARKER_ONLY.test(line.trim())) flush();
        }
    }
    endBlock();
    return blocks;
}

// The same, as plain lines.
export function htmlToLines(html) {
    return htmlToBlocks(html).flat();
}

function clip(text, max) {
    if (text.length <= max) return text;
    let s = text.slice(0, Math.max(1, max - 1));
    const space = s.lastIndexOf(' ');
    if (space > max * 0.6) s = s.slice(0, space);
    return `${s.replace(/[\s,.;:—–-]+$/, '')}…`;
}

// The start of a description, for an email or a post: whole paragraphs and
// list items while they fit. Only a first paragraph that alone is too long is
// clipped, at a word. «…» marks a cut, unless the last line ends a sentence.
export function shortLines(html, { maxLines = 6, maxChars = 320 } = {}) {
    const all = htmlToLines(html);
    const lines = [];
    let used = 0;
    for (const l of all) {
        if (lines.length >= maxLines) break;
        if (l.length > maxChars - used) {
            if (!lines.length) lines.push(clip(l, maxChars));
            break;
        }
        lines.push(l);
        used += l.length;
    }
    const cut = lines.length < all.length || lines.some((l, i) => l !== all[i]);
    const last = lines[lines.length - 1];
    if (cut && last && !/[.!?…]$/.test(last)) lines[lines.length - 1] = `${last} …`;
    return { lines, cut };
}

// ---------------------------------------------------------------------------
// When a lesson counts as open and filled in
// ---------------------------------------------------------------------------

function timeOf(v) {
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? null : t;
}

// Same rule as the course page: locked, or available_from still ahead.
export function weekIsOpen(week, now) {
    if (!week || week.is_locked) return false;
    const opens = timeOf(week.available_from);
    return opens == null || opens <= now;
}

// When students could first see it: created in an open week, or when its
// week opened. -Infinity when neither is known, so it's never announced.
export function lessonOpenedAt(week, day) {
    const created = timeOf(day?.created_at);
    const opens = timeOf(week?.available_from);
    return Math.max(created ?? -Infinity, opens ?? -Infinity);
}

export function lessonHasContent(day, materialIds = []) {
    if (!String(day?.title || '').trim()) return false;
    return !!(
        String(day.video_url || '').trim() ||
        String(day.rutube_url || '').trim() ||
        htmlToLines(day.description).length ||
        htmlToLines(day.homework_description).length ||
        materialIds.length
    );
}

export function lessonFingerprint(day, materialIds = []) {
    const parts = [day.title, day.description, day.video_url, day.rutube_url, day.homework_description, day.week_id].map((v) => v ?? '');
    return crypto.createHash('sha256').update(JSON.stringify([...parts, [...materialIds].sort()])).digest('hex').slice(0, 32);
}

// `files`: the lesson's own materials ({ id, title, type, url, created_at }),
// for its cover picture.
export function toLesson({ course, week, day, materialIds, files = [] }) {
    materialIds ??= files.map((f) => f.id);
    return {
        files: [...files].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
        dayId: day.id,
        weekId: week.id,
        courseId: course.id,
        courseSlug: course.slug,
        courseTitle: course.title,
        courseOrder: course.order_index ?? 0,
        weekTitle: week.title || '',
        weekOrder: week.order_index ?? 0,
        dayOrder: day.order_index ?? 0,
        title: String(day.title || '').trim(),
        descriptionHtml: day.description || '',
        openedAt: lessonOpenedAt(week, day),
        hasContent: lessonHasContent(day, materialIds),
        fingerprint: lessonFingerprint(day, materialIds),
    };
}

function byCourseOrder(a, b) {
    return a.courseOrder - b.courseOrder || a.weekOrder - b.weekOrder || a.dayOrder - b.dayOrder;
}

function classify(lesson, week, ann, now, cfg) {
    if (ann?.status === 'sent') return { state: 'sent' };
    if (ann?.status === 'skipped') return { state: 'skipped' };
    if (ann?.status === 'sending') return { state: 'sending' };
    if (!weekIsOpen(week, now)) return { state: 'locked', opensAt: week.is_locked ? null : timeOf(week.available_from) };
    if (cfg.since == null) return { state: 'no-since' };
    if (lesson.openedAt < cfg.since) return { state: 'before-since' };
    if (!lesson.hasContent) return { state: 'empty' };
    if (!ann) return { state: 'new', dueAt: nextSendTime(now + cfg.settleMs, cfg) };
    if (ann.fingerprint !== lesson.fingerprint) return { state: 'changed', dueAt: nextSendTime(now + cfg.settleMs, cfg) };
    const settled = (timeOf(ann.ready_at) ?? now) + cfg.settleMs;
    if (now < settled) return { state: 'settling', dueAt: nextSendTime(settled, cfg) };
    if (!inSendHours(now, cfg)) return { state: 'waiting-hours', dueAt: nextSendTime(now, cfg) };
    return { state: 'due' };
}

// Every lesson of the watched courses with what happens to it now.
export function planLessons({ courses, weeks, days, materials = [], announcements = [], now, cfg }) {
    const courseBy = new Map(courses.map((c) => [c.id, c]));
    const weekBy = new Map(weeks.map((w) => [w.id, w]));
    const annBy = new Map(announcements.map((a) => [a.day_id, a]));
    const matsBy = new Map();
    for (const m of materials) {
        if (!m.day_id) continue;
        if (!matsBy.has(m.day_id)) matsBy.set(m.day_id, []);
        matsBy.get(m.day_id).push(m);
    }
    const plan = [];
    for (const day of days) {
        const week = weekBy.get(day.week_id);
        const course = week && courseBy.get(week.course_id);
        if (!course) continue;
        const lesson = toLesson({ course, week, day, files: matsBy.get(day.id) || [] });
        const ann = annBy.get(day.id) || null;
        plan.push({ lesson, ann, ...classify(lesson, week, ann, now, cfg) });
    }
    return plan.sort((a, b) => byCourseOrder(a.lesson, b.lesson));
}

// ---------------------------------------------------------------------------
// The email (same look as the welcome email in fulfilment.js)
// ---------------------------------------------------------------------------

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The lesson page. ?course= makes the app open the lesson's course, so a
// student with two courses doesn't get the picker or «Урок не найден».
export function lessonUrl(base, lesson) {
    return `${base}/student/week/${encodeURIComponent(lesson.weekId)}/day/${encodeURIComponent(lesson.dayId)}?course=${encodeURIComponent(lesson.courseId)}`;
}

function onCourses(titles) {
    const q = titles.map((t) => `«${t}»`);
    return q.length === 1 ? `на курсе ${q[0]}` : `на курсах ${q.slice(0, -1).join(', ')} и ${q[q.length - 1]}`;
}

export function buildLessonEmail({ lessons, appBase, spareBase = null }) {
    lessons = [...lessons].sort(byCourseOrder);
    const many = lessons.length > 1;
    const titles = [...new Set(lessons.map((l) => l.courseTitle))];
    const oneCourse = titles.length === 1 ? titles[0] : null;

    const subject = many
        ? oneCourse ? `Новые уроки на курсе «${oneCourse}»` : 'Новые уроки в личном кабинете'
        : `Новый урок: ${lessons[0].title}`;
    const intro = many
        ? oneCourse ? `На курсе «${oneCourse}» открылись новые уроки.` : 'В личном кабинете открылись новые уроки.'
        : `На курсе «${lessons[0].courseTitle}» открылся новый урок.`;
    const items = lessons.map((l) => ({
        ...l,
        url: lessonUrl(appBase, l),
        spare: spareBase ? lessonUrl(spareBase, l) : null,
        lines: shortLines(l.descriptionHtml, many ? { maxLines: 4, maxChars: 220 } : {}).lines,
    }));
    const preheader = many ? items.map((l) => l.title).join(' · ') : items[0].lines.join(' ') || 'Урок уже в личном кабинете.';

    const btn = (href, label) =>
        `<a href="${esc(href)}" style="display:inline-block;background-color:#422326;color:#F2EDE2;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;padding:13px 24px;border:1px solid #422326;">${esc(label)}</a>`;

    const cards = items.map((l) => `
          <tr>
            <td style="padding:8px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF8F1;border:1px solid #d9c9a8;">
                <tr>
                  <td style="padding:22px 22px 4px 22px;">
                    ${l.weekTitle ? `<div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8a6a3b;">${esc(l.weekTitle)}</div>` : ''}
                    <div style="margin-top:8px;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:24px;line-height:1.3;color:#422326;">${esc(l.title)}</div>
                  </td>
                </tr>
                ${l.lines.length ? `<tr><td style="padding:8px 22px 0 22px;font-size:15px;line-height:1.7;color:#422326;">${l.lines.map(esc).join('<br />')}</td></tr>` : ''}
                <tr>
                  <td align="center" style="padding:18px 22px 20px 22px;">
                    ${btn(l.url, 'Открыть урок')}
                    ${l.spare ? `<div style="margin-top:10px;font-size:13px;color:#7a5a3a;">Страница не открывается? <a href="${esc(l.spare)}" style="color:#8a6a3b;">Запасная ссылка</a></div>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
${EMAIL_LIGHT_ONLY_HEAD}
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F2EDE2;font-family:Georgia,'Times New Roman',serif;color:#422326;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F2EDE2;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2EDE2;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#F2EDE2;">
          <tr>
            <td align="center" style="padding:24px 24px 8px 24px;">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:34px;color:#422326;letter-spacing:0.5px;">Anna Romeo</div>
              <div style="margin-top:10px;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#8a6a3b;font-variant:small-caps;">Васту &amp; дизайн портал</div>
            </td>
          </tr>
          <tr><td style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" /></td></tr>
          <tr>
            <td align="center" style="padding:8px 24px;">
              <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;font-size:30px;color:#422326;margin:0 0 16px 0;">Здравствуйте 🤍</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px 24px;font-size:16px;line-height:1.75;color:#422326;">
              <p style="margin:0;">${esc(intro)}</p>
            </td>
          </tr>
          ${cards}
          <tr>
            <td style="padding:16px 24px;font-size:15px;line-height:1.7;color:#422326;">
              <p style="margin:0;">Если кнопка не открывается или что-то пошло не так — напишите <a href="https://t.me/tymuron" style="color:#8a6a3b;">@tymuron</a> в Telegram, поможем.</p>
            </td>
          </tr>
          <tr><td style="padding:24px 24px 8px 24px;"><hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" /></td></tr>
          <tr>
            <td align="center" style="padding:0 24px 32px 24px;font-size:13px;line-height:1.6;color:#7a5a3a;">
              <p style="margin:0 0 10px 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:18px;">Anna Romeo</p>
              <p style="margin:0;">Вы получили это письмо, потому что учитесь ${esc(onCourses(titles))}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Plain-text twin: mail.ru / yandex score HTML-only mail as spam-like.
    const text = [
        'Здравствуйте!',
        '',
        intro,
        ...items.flatMap((l) => [
            '',
            ...(l.weekTitle ? [l.weekTitle] : []),
            l.title,
            ...l.lines,
            `Открыть урок: ${l.url}`,
            ...(l.spare ? [`Запасная ссылка: ${l.spare}`] : []),
        ]),
        '',
        'Если что-то не открывается — напишите @tymuron в Telegram (https://t.me/tymuron).',
        '',
        'Anna Romeo',
        `Вы получили это письмо, потому что учитесь ${onCourses(titles)}.`,
    ].join('\n');

    return { subject, html, text };
}

// ---------------------------------------------------------------------------
// The Telegram post (HTML parse mode)
// ---------------------------------------------------------------------------

function tgEsc(s) {
    return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Telegram counts these after the HTML is parsed: tags don't count, and an
// escaped «&amp;» counts as one character.
export const TG_CAPTION_LIMIT = 1024; // a photo's caption
export const TG_TEXT_LIMIT = 4096; // a text message

export function tgVisibleLength(html) {
    return decodeEntities(String(html).replace(/<[^>]*>/g, '')).length;
}

// Text cut to at most `max` characters: at its last line break, else its last
// sentence end, else its last whole word with «…». Never mid-word.
export function cutText(text, max) {
    if (text.length <= max) return text;
    const head = text.slice(0, max);
    const nl = head.lastIndexOf('\n');
    if (nl >= max * 0.4) return head.slice(0, nl).trimEnd();
    let end = -1;
    for (const m of head.matchAll(/[.!?…](?=\s)/g)) end = m.index + 1;
    if (/[.!?…]$/.test(head) && /\s/.test(text[max] ?? '')) end = max;
    if (end >= max * 0.4) return head.slice(0, end);
    const words = text.slice(0, max - 1);
    const space = words.lastIndexOf(' ');
    return `${(space > 0 ? words.slice(0, space) : words).replace(/[\s,.;:—–-]+$/, '')}…`;
}

// The description's paragraphs that fit in `room` characters with a blank
// line between them: whole ones while they fit, then the next one cut at a
// sentence (when a useful part of it fits), and nothing after.
export function fitParagraphs(blocks, room) {
    const out = [];
    let used = 0;
    for (const b of blocks) {
        const text = b.join('\n');
        const sep = out.length ? 2 : 0;
        if (used + sep + text.length <= room) {
            out.push(text);
            used += sep + text.length;
            continue;
        }
        const left = room - used - sep;
        if (left >= 80) out.push(cutText(text, left));
        break;
    }
    return out;
}

// The post: a heading, then per lesson its title (bold), week (italics) and
// description in its own paragraphs, then «Урок уже в личном кабинете.».
// `limit`: TG_CAPTION_LIMIT under a photo, TG_TEXT_LIMIT as a text message.
export function buildTelegramPost({ lessons, appBase, limit = TG_TEXT_LIMIT }) {
    lessons = [...lessons].sort(byCourseOrder);
    const many = lessons.length > 1;
    const head = `🤍 <b>${many ? 'Новые уроки на платформе' : 'Новый урок на платформе'}</b>`;
    const foot = many ? 'Уроки уже в личном кабинете.' : 'Урок уже в личном кабинете.';
    const heads = lessons.map((l) => [`<b>${tgEsc(l.title)}</b>`, ...(l.weekTitle ? [`<i>${tgEsc(l.weekTitle)}</i>`] : [])].join('\n'));
    const descs = lessons.map((l) => htmlToBlocks(l.descriptionHtml));
    const compose = (room) => [
        head,
        ...heads.map((h, i) => [h, ...fitParagraphs(descs[i], room).map(tgEsc)].join('\n\n')),
        foot,
    ].join('\n\n');
    // What's left for the descriptions once everything else is in, shared out.
    const fixed = tgVisibleLength(compose(0));
    let room = Math.floor((limit - fixed) / lessons.length) - 2;
    if (many) room = Math.min(room, 400);
    let text = compose(Math.max(0, room));
    while (tgVisibleLength(text) > limit && room > 0) {
        room -= 40;
        text = compose(Math.max(0, room));
    }
    const reply_markup = {
        inline_keyboard: lessons.slice(0, 8).map((l) => [{ text: many ? clip(`Открыть: ${l.title}`, 60) : 'Открыть урок', url: lessonUrl(appBase, l) }]),
    };
    return { text, reply_markup };
}

// ---------------------------------------------------------------------------
// The picture: the cover of the first lesson's presentation (page 1 of its
// PDF), else a card in Anna's colours. null when neither can be made.
// ---------------------------------------------------------------------------

export const MATERIAL_COLUMNS = 'id, day_id, title, type, url, created_at';

// The lesson's presentation: a PDF called «…презентация…», else its first PDF.
export function pickCoverFile(files = []) {
    const pdfs = files.filter((f) => f.type === 'pdf' || /\.pdf(?:$|[?#])/i.test(f.url || '') || /\.pdf$/i.test(f.title || ''));
    return pdfs.find((f) => /презентац|presentation|слайд/i.test(f.title || '')) || pdfs[0] || null;
}

// A stored file link (…/storage/v1/object/public/<bucket>/<path>, through
// whichever address the teacher was on) -> { bucket, path }. The server then
// downloads it with its own key, so it never fetches an arbitrary address.
export function storageObjectOf(url) {
    const m = /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/?#]+)\/([^?#]+)/.exec(String(url || ''));
    if (!m) return null;
    try {
        return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
    } catch {
        return null;
    }
}

function withTimeout(promise, ms, what) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: no answer in ${ms / 1000} s`)), ms); }),
    ]).finally(() => clearTimeout(timer));
}

// -> async (lessons) => { jpeg, width, height, kind: 'cover'|'card', source? } | null
export function makeLessonPicture({ getSupabase, log = console, covers = coverRenderers }) {
    return async function picture(lessons) {
        const lesson = [...lessons].sort(byCourseOrder)[0];
        if (!lesson) return null;
        const file = pickCoverFile(lesson.files);
        if (file) {
            try {
                const where = storageObjectOf(file.url);
                if (!where) throw new Error('not a file in the platform storage');
                const { data, error } = await withTimeout(getSupabase().storage.from(where.bucket).download(where.path), 60000, 'download');
                if (error || !data) throw new Error(`download: ${error?.message || 'no data'}`);
                const bytes = Buffer.from(await data.arrayBuffer());
                const r = await withTimeout(covers.renderPdfCover(bytes), 60000, 'render');
                return { ...r, kind: 'cover', source: file.title || where.path };
            } catch (err) {
                log.error(`lesson-notify: no cover from «${file.title}»: ${err?.message || err}`);
            }
        }
        try {
            const r = await withTimeout(covers.renderBrandCard({ title: lesson.title, week: lesson.weekTitle, course: lesson.courseTitle }), 30000, 'card');
            return { ...r, kind: 'card' };
        } catch (err) {
            log.error(`lesson-notify: no brand card: ${err?.message || err}`);
            return null;
        }
    };
}

// ---------------------------------------------------------------------------
// Telegram Bot API. Errors never carry the token (it's in the URL); an error
// from an answer Telegram gave has its HTTP status in err.status.
// ---------------------------------------------------------------------------

// Where a post goes: «-1001234567890», «@channel», or «-1001234567890/2» for
// topic 2 of a forum group.
export function splitTelegramTarget(target) {
    const m = String(target).match(/^(.+)\/(\d+)$/);
    return m ? { chat: m[1], thread: Number(m[2]) } : { chat: String(target), thread: null };
}

// lesson_announcements.tg_chat: where the lesson's post goes, comma-separated.
// A target the post already reached carries «#message_id»
// («-1001234567890#25,-1009876543210/2»), so a retry after a partial failure
// posts only where it hasn't yet.
export function parseTelegramTargets(value) {
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
            const i = s.indexOf('#');
            return i < 0 ? { key: s, done: null } : { key: s.slice(0, i), done: Number(s.slice(i + 1)) || 0 };
        });
}

export function formatTelegramTargets(targets) {
    return targets.map((x) => (x.done != null ? `${x.key}#${x.done}` : x.key)).join(',');
}

export function makeTelegramClient({ token, base = 'https://api.telegram.org' }) {
    if (!token) return null;
    const url = (method) => `${base.replace(/\/$/, '')}/bot${token}/${method}`;
    async function answer(method, resp) {
        const body = await resp.json().catch(() => null);
        if (!resp.ok || !body?.ok) {
            const err = new Error(`Telegram ${method} ${resp.status}: ${body?.description || 'no answer'}`);
            err.status = resp.status;
            throw err;
        }
        return body.result;
    }
    async function call(method, payload) {
        const resp = await fetch(url(method), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
        return answer(method, resp);
    }
    // `thread`: a topic of a forum group; without it a post goes to General.
    return {
        async sendMessage(chatId, { text, reply_markup, thread }) {
            const r = await call('sendMessage', {
                chat_id: chatId,
                ...(thread ? { message_thread_id: thread } : {}),
                text,
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true },
                ...(reply_markup ? { reply_markup } : {}),
            });
            return r?.message_id ?? null;
        },
        async sendPhoto(chatId, { photo, caption, reply_markup, thread }) {
            const form = new FormData();
            form.append('chat_id', String(chatId));
            if (thread) form.append('message_thread_id', String(thread));
            form.append('caption', caption);
            form.append('parse_mode', 'HTML');
            if (reply_markup) form.append('reply_markup', JSON.stringify(reply_markup));
            form.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'lesson.jpg');
            const r = await answer('sendPhoto', await fetch(url('sendPhoto'), { method: 'POST', body: form }));
            return r?.message_id ?? null;
        },
        // Chats the bot was added to or written in, last 24 h: for finding a channel's id.
        async getUpdates() {
            return (await call('getUpdates', {})) || [];
        },
        async getMe() {
            return call('getMe', {});
        },
        async getWebhookInfo() {
            return call('getWebhookInfo', {});
        },
    };
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

function iso(ms) {
    return ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString();
}

function chunks(list, size = IN_CHUNK) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

function isMissingTable(error) {
    return error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|could not find the table/i.test(error?.message || '');
}

async function rows(query, what) {
    const { data, error } = await query;
    if (error) {
        const err = new Error(`${what}: ${error.message}`);
        err.missingTable = isMissingTable(error);
        throw err;
    }
    return data || [];
}

async function rowsIn(supabase, table, columns, column, values, what = table) {
    const out = [];
    for (const part of chunks([...new Set(values)])) {
        out.push(...(await rows(supabase.from(table).select(columns).in(column, part), what)));
    }
    return out;
}

export function createLessonNotifier({
    getSupabase,
    sendEmail,
    telegram = null,
    appUrl,
    spareAppUrl,
    config,
    alert = async () => {},
    log = console,
    now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    sendGapMs = 600, // Resend allows 2 requests a second
    picture = null, // async (lessons) => { jpeg, kind } | null; default: makeLessonPicture
}) {
    const appBase = (appUrl || 'https://vastu-portal-app.onrender.com').replace(/\/$/, '');
    const spare = spareAppUrl ? spareAppUrl.replace(/\/$/, '') : null;
    const spareBase = spare && spare !== appBase ? spare : null;
    const chatFor = (slug) => config.telegram.chats[slug] || null;
    const pictureFor = picture || makeLessonPicture({ getSupabase, log });

    // One post to one target («id» or «id/topic»): the picture with the text as
    // its caption, or, with no picture (or when Telegram turns the photo down),
    // the same text as a message.
    // `pictures` (a Map) keeps one run's pictures, so a post going to several
    // chats renders its cover once.
    // -> { messageId, picture: 'cover' | 'card' | null }
    async function deliverPost(target, lessons, pictures = null) {
        const { chat, thread } = splitTelegramTarget(target);
        const where = thread ? { thread } : {};
        let pic = null;
        try {
            const key = lessons.map((l) => l.dayId).join(',');
            if (!pictures?.has(key)) pictures?.set(key, pictureFor(lessons));
            pic = await (pictures ? pictures.get(key) : pictureFor(lessons));
        } catch (err) {
            log.error(`lesson-notify: picture failed: ${err?.message || err}`);
        }
        if (pic?.jpeg?.length && telegram.sendPhoto) {
            const caption = buildTelegramPost({ lessons, appBase, limit: TG_CAPTION_LIMIT });
            try {
                const messageId = await telegram.sendPhoto(chat, { photo: pic.jpeg, caption: caption.text, reply_markup: caption.reply_markup, ...where });
                return { messageId, picture: pic.kind };
            } catch (err) {
                // Only a clear «no» to this photo falls back to text. A network
                // error may hide a post that went out: that one is retried as is.
                if (!(err?.status >= 400 && err.status < 500 && err.status !== 429)) throw err;
                log.error(`lesson-notify: Telegram refused the photo (${err.message}); posting text`);
            }
        }
        const messageId = await telegram.sendMessage(chat, { ...buildTelegramPost({ lessons, appBase, limit: TG_TEXT_LIMIT }), ...where });
        return { messageId, picture: null };
    }

    let running = false;
    let lastRun = null;
    let emailPauseUntil = 0;
    const loggedDry = new Set();

    async function load(supabase, { allowMissingTables }) {
        const courses = await rows(supabase.from('courses').select('id, slug, title, order_index').in('slug', config.courses), 'courses');
        const weeks = courses.length
            ? await rowsIn(supabase, 'weeks', 'id, course_id, title, order_index, is_locked, available_from', 'course_id', courses.map((c) => c.id))
            : [];
        const days = weeks.length
            ? await rowsIn(supabase, 'days', 'id, week_id, title, description, video_url, rutube_url, homework_description, order_index, created_at', 'week_id', weeks.map((w) => w.id))
            : [];
        const dayIds = days.map((d) => d.id);
        const materials = dayIds.length ? await rowsIn(supabase, 'materials', MATERIAL_COLUMNS, 'day_id', dayIds) : [];
        let announcements = [];
        let missingTables = false;
        try {
            announcements = dayIds.length ? await rowsIn(supabase, 'lesson_announcements', '*', 'day_id', dayIds) : [];
        } catch (err) {
            if (!err.missingTable || !allowMissingTables) throw err;
            missingTables = true;
        }
        return { courses, weeks, days, materials, announcements, missingTables };
    }

    // Students who can open each course right now. Teachers are not students.
    async function audience(supabase, courseIds, at) {
        const byCourse = new Map(courseIds.map((id) => [id, []]));
        const skipped = [];
        if (!courseIds.length) return { byCourse, skipped };
        const ents = await rowsIn(supabase, 'user_entitlements', 'user_id, course_id, expires_at', 'course_id', courseIds);
        const active = ents.filter((e) => !e.expires_at || (timeOf(e.expires_at) ?? -Infinity) > at);
        const profiles = active.length ? await rowsIn(supabase, 'profiles', 'id, email, role', 'id', active.map((e) => e.user_id)) : [];
        const profileBy = new Map(profiles.map((p) => [p.id, p]));
        for (const e of active) {
            const p = profileBy.get(e.user_id);
            if (p?.role === 'teacher') continue;
            const email = normEmail(p?.email);
            if (!EMAIL_RE.test(email)) {
                skipped.push({ userId: e.user_id, reason: 'no email in profiles' });
                continue;
            }
            const list = byCourse.get(e.course_id);
            if (list && !list.some((r) => r.userId === e.user_id)) list.push({ userId: e.user_id, email });
        }
        for (const list of byCourse.values()) list.sort((a, b) => a.email.localeCompare(b.email));
        return { byCourse, skipped };
    }

    function describe(p, aud, dryRun) {
        const l = p.lesson;
        const willAnnounce = WILL_ANNOUNCE.has(p.state);
        const recipients = aud.byCourse.get(l.courseId) || [];
        return {
            dayId: l.dayId,
            course: l.courseTitle,
            week: l.weekTitle,
            title: l.title,
            state: p.state,
            note: STATES[p.state],
            openedAt: iso(l.openedAt),
            ...(p.opensAt != null ? { opensAt: iso(p.opensAt) } : {}),
            ...(p.dueAt != null ? { dueAt: iso(p.dueAt) } : {}),
            ...(willAnnounce
                ? {
                    students: recipients.length,
                    ...(dryRun ? { emails: recipients.map((r) => r.email) } : {}),
                    telegram: chatFor(l.courseSlug) ? (config.telegram.token ? chatFor(l.courseSlug) : `${chatFor(l.courseSlug)} (no TELEGRAM_BOT_TOKEN)`) : 'not configured for this course',
                }
                : {}),
        };
    }

    // Live: lessons that came due now -> 'sending', with their audience fixed.
    async function claimDue(supabase, plan, aud, t) {
        const claimed = [];
        for (const p of plan.filter((x) => x.state === 'due')) {
            const l = p.lesson;
            const chat = config.telegram.token ? chatFor(l.courseSlug) : null;
            const got = await rows(
                supabase
                    .from('lesson_announcements')
                    .update({ status: 'sending', announced_at: iso(t), tg_status: chat ? null : 'off', tg_chat: chat, updated_at: iso(t) })
                    .eq('day_id', l.dayId)
                    .eq('status', 'settling')
                    .eq('fingerprint', l.fingerprint)
                    .select('day_id'),
                'claim lesson'
            );
            if (!got.length) continue; // another run took it, or it changed
            const recipients = aud.byCourse.get(l.courseId) || [];
            for (const part of chunks(recipients)) {
                const { error } = await supabase
                    .from('lesson_notifications')
                    .upsert(part.map((r) => ({ day_id: l.dayId, user_id: r.userId, email: r.email, status: 'pending' })), { onConflict: 'day_id,user_id', ignoreDuplicates: true });
                if (error) throw new Error(`lesson_notifications insert: ${error.message}`);
            }
            await rows(supabase.from('lesson_announcements').update({ recipients: recipients.length }).eq('day_id', l.dayId).select('day_id'), 'announcement recipients');
            claimed.push(l);
            log.log(`lesson-notify: announcing «${l.title}» (${l.courseTitle}) to ${recipients.length} students${chat ? `, Telegram ${chat}` : ''}`);
        }
        return claimed;
    }

    async function postTelegram(supabase, lessonBy, t, report) {
        const anns = await rowsIn(supabase, 'lesson_announcements', 'day_id, status, tg_status, tg_chat, tg_attempts, updated_at', 'day_id', [...lessonBy.keys()]);
        // A post cut off mid-flight may already be in the chat: never repost it by itself.
        for (const a of anns.filter((x) => x.tg_status === 'posting' && (timeOf(x.updated_at) ?? 0) < t - STALE_MS)) {
            const open = parseTelegramTargets(a.tg_chat).filter((x) => x.done == null).map((x) => x.key).join(', ');
            await rows(supabase.from('lesson_announcements').update({ tg_status: 'failed', tg_attempts: MAX_TG_ATTEMPTS, tg_error: 'прервано во время публикации — проверьте канал', updated_at: iso(t) }).eq('day_id', a.day_id).eq('tg_status', 'posting').select('day_id'), 'tg stale');
            await alert('уведомления об уроках: пост в Telegram прерван', `«${lessonBy.get(a.day_id)?.title}»: проверьте ${open || a.tg_chat}, был ли пост.`);
        }
        const todo = anns.filter((a) => ['sending', 'sent'].includes(a.status) && a.tg_chat && (a.tg_status == null || (a.tg_status === 'failed' && (a.tg_attempts || 0) < MAX_TG_ATTEMPTS)));
        if (!todo.length) return;
        if (!telegram) {
            report.problems.push('посты в Telegram ждут, но TELEGRAM_BOT_TOKEN не задан');
            return;
        }
        // Claim each lesson for this run. Its targets say where it still has to go.
        const mine = [];
        for (const a of todo) {
            const q = supabase.from('lesson_announcements').update({ tg_status: 'posting', tg_attempts: (a.tg_attempts || 0) + 1, updated_at: iso(t) }).eq('day_id', a.day_id);
            const got = await rows((a.tg_status == null ? q.is('tg_status', null) : q.eq('tg_status', 'failed')).select('day_id'), 'claim post');
            if (got.length) mine.push({ dayId: a.day_id, targets: parseTelegramTargets(a.tg_chat), errors: [] });
        }
        // One post per target, with every lesson still owed there.
        const byTarget = new Map();
        for (const m of mine) {
            if (!lessonBy.get(m.dayId)) continue;
            for (const target of m.targets) {
                if (target.done != null) continue;
                if (!byTarget.has(target.key)) byTarget.set(target.key, []);
                byTarget.get(target.key).push(m);
            }
        }
        const pictures = new Map();
        for (const [chat, list] of byTarget) {
            const lessons = list.map((m) => lessonBy.get(m.dayId));
            try {
                const { messageId, picture: kind } = await deliverPost(chat, lessons, pictures);
                // Saved at once, so that a run stopped before the next target
                // never posts here a second time.
                for (const m of list) {
                    m.targets.find((x) => x.key === chat).done = messageId ?? 0;
                    await rows(supabase.from('lesson_announcements').update({ tg_chat: formatTelegramTargets(m.targets), updated_at: iso(now()) }).eq('day_id', m.dayId).select('day_id'), 'post progress');
                }
                report.telegram.push({ chat, lessons: lessons.map((l) => l.title), messageId, picture: kind });
            } catch (err) {
                const msg = String(err?.message || err);
                for (const m of list) m.errors.push(`${chat}: ${msg}`);
                report.telegram.push({ chat, lessons: lessons.map((l) => l.title), error: msg });
                await alert('уведомления об уроках: пост в Telegram не опубликован', `${lessons.map((l) => `«${l.title}»`).join(', ')} → ${chat}\n${msg}`);
            }
        }
        for (const m of mine) {
            const failed = m.errors.length > 0 || !lessonBy.get(m.dayId);
            const first = m.targets.find((x) => x.done != null);
            await rows(
                supabase
                    .from('lesson_announcements')
                    .update({
                        tg_status: failed ? 'failed' : 'posted',
                        tg_chat: formatTelegramTargets(m.targets),
                        ...(first ? { tg_message_id: first.done } : {}),
                        tg_error: failed ? (m.errors.join('\n') || 'урок не найден').slice(0, 500) : null,
                        updated_at: iso(now()),
                    })
                    .eq('day_id', m.dayId)
                    .select('day_id'),
                failed ? 'post failed' : 'post done'
            );
        }
    }

    async function sendEmails(supabase, lessonBy, sendingIds, t, report) {
        if (!sendingIds.length) return;
        // After Resend said 429 (too fast, or the day's quota is used up), wait
        // before asking again instead of knocking every few minutes.
        if (now() < emailPauseUntil) {
            report.emails.pausedUntil = iso(emailPauseUntil);
            return;
        }
        // Rows a cut-off run left mid-send go out again; the idempotency key
        // makes Resend skip any that did leave.
        for (const part of chunks(sendingIds)) {
            await rows(supabase.from('lesson_notifications').update({ status: 'pending', updated_at: iso(t) }).in('day_id', part).eq('status', 'sending').lt('updated_at', iso(t - STALE_MS)).select('id'), 'stale sends');
        }
        const open = [];
        for (const part of chunks(sendingIds)) {
            open.push(...(await rows(supabase.from('lesson_notifications').select('id, day_id, user_id, email, status, attempts').in('day_id', part).in('status', ['pending', 'failed']), 'pending sends')));
        }
        const byUser = new Map();
        for (const r of open.filter((x) => (x.attempts || 0) < MAX_EMAIL_ATTEMPTS)) {
            if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
            byUser.get(r.user_id).push(r);
        }
        let first = true;
        for (const [userId, list] of byUser) {
            const got = await rows(
                supabase.from('lesson_notifications').update({ status: 'sending', updated_at: iso(now()) }).in('id', list.map((r) => r.id)).in('status', ['pending', 'failed']).select('id, day_id, email, attempts'),
                'claim sends'
            );
            const mine = got.filter((r) => lessonBy.has(r.day_id));
            if (!mine.length) continue;
            if (!first) await sleep(sendGapMs);
            first = false;
            const lessons = mine.map((r) => lessonBy.get(r.day_id));
            const dayKey = crypto.createHash('sha256').update([...mine.map((r) => r.day_id)].sort().join(',')).digest('hex').slice(0, 24);
            const { subject, html, text } = buildLessonEmail({ lessons, appBase, spareBase });
            try {
                const id = await sendEmail({ to: mine[0].email, subject, html, text, idempotencyKey: `lesson-notify/${userId}/${dayKey}` });
                for (const r of mine) {
                    await rows(supabase.from('lesson_notifications').update({ status: 'sent', sent_at: iso(now()), email_id: id, attempts: (r.attempts || 0) + 1, error: null, updated_at: iso(now()) }).eq('id', r.id).select('id'), 'mark sent');
                }
                report.emails.sent += 1;
            } catch (err) {
                const msg = String(err?.message || err);
                // 429 = too fast, or the day's quota is used up. Not this email's
                // fault: back in the queue without spending an attempt, and the
                // rest wait with it.
                if (/\b429\b/.test(msg)) {
                    for (const r of mine) {
                        await rows(supabase.from('lesson_notifications').update({ status: 'pending', error: msg.slice(0, 500), updated_at: iso(now()) }).eq('id', r.id).select('id'), 'mark deferred');
                    }
                    emailPauseUntil = now() + RESEND_PAUSE_MS;
                    report.emails.pausedUntil = iso(emailPauseUntil);
                    await alert('уведомления об уроках: Resend просит подождать (429)', `Отправлено ${report.emails.sent}, остальные уйдут после ${iso(emailPauseUntil)}. Если так весь день — закончилась дневная квота тарифа Resend.\n${msg}`);
                    break;
                }
                for (const r of mine) {
                    await rows(supabase.from('lesson_notifications').update({ status: 'failed', attempts: (r.attempts || 0) + 1, error: msg.slice(0, 500), updated_at: iso(now()) }).eq('id', r.id).select('id'), 'mark failed');
                }
                report.emails.failed += 1;
                report.emails.errors.push({ to: mine[0].email, error: msg });
            }
        }
        if (report.emails.failed) {
            await alert('уведомления об уроках: письма не ушли', `${report.emails.failed} из ${report.emails.sent + report.emails.failed}. Повтор при следующей проверке.\n${report.emails.errors.slice(0, 5).map((e) => `${e.to}: ${e.error}`).join('\n')}`);
        }
    }

    async function finish(supabase, lessonBy, sendingIds, t, report) {
        for (const dayId of sendingIds) {
            const left = await rows(supabase.from('lesson_notifications').select('id, status, attempts').eq('day_id', dayId), 'left to send');
            const waiting = left.filter((r) => r.status === 'pending' || r.status === 'sending' || (r.status === 'failed' && (r.attempts || 0) < MAX_EMAIL_ATTEMPTS));
            if (waiting.length) continue;
            const gaveUp = left.filter((r) => r.status === 'failed').length;
            await rows(supabase.from('lesson_announcements').update({ status: 'sent', finished_at: iso(t), updated_at: iso(t) }).eq('day_id', dayId).eq('status', 'sending').select('day_id'), 'lesson sent');
            if (gaveUp) await alert('уведомления об уроках: часть писем так и не ушла', `«${lessonBy.get(dayId)?.title}»: ${gaveUp} студентов без письма после ${MAX_EMAIL_ATTEMPTS} попыток.`);
        }
    }

    // One pass. dryRun reads everything and writes and sends nothing.
    // `since` (dry runs only) overrides LESSON_NOTIFY_SINCE, to see "what if".
    async function run({ dryRun = false, since } = {}) {
        dryRun = dryRun || config.mode !== 'live';
        const cfg = since !== undefined && dryRun ? { ...config, since } : config;
        if (running) return { skipped: 'already running' };
        running = true;
        const t = now();
        const report = {
            at: iso(t),
            mode: dryRun ? 'dry-run' : 'live',
            since: iso(cfg.since),
            courses: [],
            lessons: [],
            emails: { sent: 0, failed: 0, errors: [] },
            telegram: [],
            problems: [...config.problems],
        };
        try {
            if (!dryRun && cfg.since == null) {
                report.skipped = 'LESSON_NOTIFY_SINCE not set';
                return report;
            }
            const supabase = getSupabase();
            const state = await load(supabase, { allowMissingTables: dryRun });
            if (state.missingTables) report.problems.push('таблиц lesson_announcements / lesson_notifications нет — нужна миграция 20261110_lesson_notifications.sql');
            const plan = planLessons({ ...state, now: t, cfg });
            const watched = [...new Set(plan.filter((p) => WILL_ANNOUNCE.has(p.state)).map((p) => p.lesson.courseId))];
            const aud = await audience(supabase, dryRun ? state.courses.map((c) => c.id) : watched, t);
            report.courses = state.courses.map((c) => ({ slug: c.slug, title: c.title, students: aud.byCourse.get(c.id)?.length ?? null }));
            report.lessons = plan.map((p) => describe(p, aud, dryRun));
            if (aud.skipped.length) report.problems.push(`${aud.skipped.length} студентов без почты в profiles — им не написать`);

            if (dryRun) {
                const due = plan.filter((p) => p.state === 'due');
                const users = new Set(due.flatMap((p) => (aud.byCourse.get(p.lesson.courseId) || []).map((r) => r.userId)));
                report.emails = { wouldSendNow: users.size };
                report.telegram = [...new Set(due.map((p) => chatFor(p.lesson.courseSlug)).filter(Boolean))].map((chat) => ({ chat, wouldPost: due.filter((p) => chatFor(p.lesson.courseSlug) === chat).map((p) => p.lesson.title) }));
                for (const entry of report.lessons.filter((e) => WILL_ANNOUNCE.has(e.state))) {
                    const key = `${entry.dayId}:${entry.state}:${plan.find((p) => p.lesson.dayId === entry.dayId)?.lesson.fingerprint}`;
                    if (loggedDry.has(key)) continue;
                    loggedDry.add(key);
                    log.log(`lesson-notify (dry run): «${entry.title}» (${entry.course}) — ${entry.state}${entry.dueAt ? `, due ${entry.dueAt}` : ''}: would email ${entry.students} students: ${(entry.emails || []).join(', ') || '—'}; Telegram: ${entry.telegram}`);
                }
                return report;
            }

            for (const p of plan) {
                const l = p.lesson;
                if (p.state === 'new') {
                    const { error } = await supabase.from('lesson_announcements').insert({ day_id: l.dayId, course_id: l.courseId, status: 'settling', fingerprint: l.fingerprint, ready_at: iso(t), updated_at: iso(t) });
                    if (error && error.code !== '23505') throw new Error(`lesson_announcements insert: ${error.message}`);
                } else if (p.state === 'changed') {
                    await rows(supabase.from('lesson_announcements').update({ fingerprint: l.fingerprint, ready_at: iso(t), updated_at: iso(t) }).eq('day_id', l.dayId).eq('status', 'settling').select('day_id'), 'restart quiet period');
                }
            }
            const claimed = await claimDue(supabase, plan, aud, t);
            const lessonBy = new Map(plan.map((p) => [p.lesson.dayId, p.lesson]));
            const sendingIds = [...new Set([...claimed.map((l) => l.dayId), ...plan.filter((p) => p.state === 'sending').map((p) => p.lesson.dayId)])];
            await postTelegram(supabase, lessonBy, t, report);
            await sendEmails(supabase, lessonBy, sendingIds, t, report);
            await finish(supabase, lessonBy, sendingIds, t, report);
            report.announced = claimed.map((l) => l.title);
            if (claimed.length || report.emails.sent || report.emails.failed || report.telegram.length) {
                log.log(`lesson-notify: ${claimed.length} lessons announced, ${report.emails.sent} emails sent, ${report.emails.failed} failed, ${report.telegram.length} Telegram posts`);
            }
            return report;
        } catch (err) {
            report.error = String(err?.message || err);
            log.error('lesson-notify failed:', report.error);
            if (!dryRun) await alert('уведомления об уроках: проверка упала', report.error);
            return report;
        } finally {
            running = false;
            if (!dryRun) lastRun = report;
        }
    }

    // One lesson's email to one address (and/or its post to one chat), exactly
    // as students would get it. Records nothing, so it never stands in for the
    // real announcement. With neither, only renders it.
    async function testSend({ dayId, email, telegramChat } = {}) {
        const supabase = getSupabase();
        const [day] = await rows(supabase.from('days').select('id, week_id, title, description, video_url, rutube_url, homework_description, order_index, created_at').eq('id', dayId), 'day');
        if (!day) throw new Error('lesson not found');
        const [week] = await rows(supabase.from('weeks').select('id, course_id, title, order_index, is_locked, available_from').eq('id', day.week_id), 'week');
        const [course] = week ? await rows(supabase.from('courses').select('id, slug, title, order_index').eq('id', week.course_id), 'course') : [];
        if (!course) throw new Error('course not found');
        const materials = await rows(supabase.from('materials').select(MATERIAL_COLUMNS).eq('day_id', day.id), 'materials');
        const lesson = toLesson({ course, week, day, files: materials });
        const message = buildLessonEmail({ lessons: [lesson], appBase, spareBase });
        const caption = buildTelegramPost({ lessons: [lesson], appBase, limit: TG_CAPTION_LIMIT });
        const out = {
            lesson: { title: lesson.title, course: lesson.courseTitle, url: lessonUrl(appBase, lesson), coverFile: pickCoverFile(lesson.files)?.title || null },
            subject: message.subject,
            text: message.text,
            telegramCaption: caption.text,
        };
        if (email) {
            const to = normEmail(email);
            if (!EMAIL_RE.test(to)) throw new Error('invalid email');
            out.emailId = await sendEmail({ to, subject: message.subject, html: message.html, text: message.text });
            out.sentTo = to;
        } else {
            out.html = message.html;
        }
        if (telegramChat) {
            if (!telegram) throw new Error('TELEGRAM_BOT_TOKEN not set');
            const r = await deliverPost(String(telegramChat), [lesson]);
            out.telegramMessageId = r.messageId;
            out.telegramPicture = r.picture;
        } else if (!email) {
            // A preview only: say whether a picture can be made, without posting.
            const pic = await pictureFor([lesson]).catch(() => null);
            out.telegramPicture = pic ? { kind: pic.kind, width: pic.width, height: pic.height, bytes: pic.jpeg.length, source: pic.source || null } : null;
        }
        return out;
    }

    // The chats in the bot's pending updates, with what Telegram says about the
    // bot itself: an empty list next to `pendingUpdates: 0` means the updates
    // were already taken (by another getUpdates caller) or are over 24 h old;
    // a webhook `url` means updates go there instead.
    async function telegramChats() {
        if (!telegram) throw new Error('TELEGRAM_BOT_TOKEN not set');
        const [me, hook] = await Promise.all([
            telegram.getMe ? telegram.getMe().catch((e) => ({ error: e.message })) : null,
            telegram.getWebhookInfo ? telegram.getWebhookInfo().catch((e) => ({ error: e.message })) : null,
        ]);
        let updates = [];
        let updatesError = null;
        try {
            updates = await telegram.getUpdates();
        } catch (err) {
            updatesError = String(err?.message || err);
        }
        const chats = new Map();
        for (const u of updates) {
            const m = u.my_chat_member || u.chat_member || u.message || u.edited_message || u.channel_post || u.edited_channel_post;
            const c = m?.chat;
            if (!c) continue;
            chats.set(c.id, {
                id: c.id,
                type: c.type,
                title: c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || null,
                botStatus: u.my_chat_member?.new_chat_member?.status || chats.get(c.id)?.botStatus || null,
            });
        }
        return {
            bot: me && !me.error ? { id: me.id, username: me.username } : me,
            webhook: hook && !hook.error ? { url: hook.url || '', pendingUpdates: hook.pending_update_count ?? null, lastError: hook.last_error_message || null } : hook,
            updates: updates.length,
            ...(updatesError ? { updatesError } : {}),
            chats: [...chats.values()],
        };
    }

    function status() {
        const r = lastRun;
        return {
            mode: config.mode,
            since: iso(config.since),
            courses: config.courses,
            settleMinutes: config.settleMs / MINUTE,
            hours: `${config.hours.from}-${config.hours.to} ${config.tz}`,
            intervalMinutes: config.intervalMs / MINUTE,
            telegram: { botToken: !!config.telegram.token, chats: config.telegram.chats },
            problems: config.problems,
            lastRun: r && {
                at: r.at,
                skipped: r.skipped || null,
                error: r.error || null,
                announced: r.announced || [],
                emailsSent: r.emails?.sent ?? 0,
                emailsFailed: r.emails?.failed ?? 0,
                telegram: r.telegram || [],
            },
        };
    }

    return { run, testSend, telegramChats, status };
}
