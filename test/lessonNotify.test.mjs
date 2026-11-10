// New-lesson notifications (lessonNotify.js): the real notifier and the real
// supabase-js queries, against the in-memory fake (test/fake-services.mjs,
// in-process, no port), with Resend and Telegram replaced by recorders.
// The courses and weeks mirror «Васту-дизайн» on 10 Nov 2026.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createFakeServices } from './fake-services.mjs';
import {
    buildLessonEmail,
    buildTelegramPost,
    createLessonNotifier,
    htmlToLines,
    inSendHours,
    lessonHasContent,
    lessonOpenedAt,
    nextSendTime,
    readLessonNotifyConfig,
    shortLines,
    weekIsOpen,
} from '../lessonNotify.js';

const MIN = 60 * 1000;
const SINCE = '2026-11-11T00:00:00Z';
const CHANNEL = '-1001234567890';
const at = (s) => Date.parse(s);

// ---------------------------------------------------------------- the world

function world({ env = {}, start = '2026-11-12T08:00:00Z' } = {}) {
    const fake = createFakeServices();
    const sb = createClient('http://fake.test', 'service-key', {
        global: { fetch: fake.fetch },
        auth: { persistSession: false, autoRefreshToken: false },
    });
    let now = at(start);
    const clock = { now: () => now, set: (s) => { now = at(s); }, advance: (ms) => { now += ms; } };

    const course = (slug, title, order) => ({ id: crypto.randomUUID(), slug, title, order_index: order, is_active: true });
    const c = {
        base: course('vastu-design-2026', 'Васту-дизайн', 10),
        pro: course('vastu-design-2026-pro', 'Васту-дизайн · Наставничество', 11),
        biz: course('vastu-2', 'Васту для бизнеса', 2),
    };
    fake.seed('courses', Object.values(c));
    const week = (courseId, title, order, availableFrom) => ({ id: crypto.randomUUID(), course_id: courseId, title, order_index: order, is_locked: false, available_from: availableFrom });
    const w = {
        w0: week(c.base.id, 'НЕДЕЛЯ 0. ВВОДНЫЙ ЭФИР', 0, '2026-11-08T00:00:00Z'),
        w1: week(c.base.id, 'НЕДЕЛЯ 1. ФУНДАМЕНТ И ДИАГНОСТИКА', 1, '2026-11-10T00:00:00Z'),
        w2: week(c.base.id, 'НЕДЕЛЯ 2. СТОРОНЫ СВЕТА', 2, '2026-11-17T00:00:00Z'),
        pro: week(c.pro.id, 'БИЗНЕС-БЛОК', 1, '2026-11-10T00:00:00Z'),
        biz: week(c.biz.id, 'Неделя 1', 1, null),
    };
    fake.seed('weeks', Object.values(w));

    const lesson = (weekId, fields) => {
        const row = { id: crypto.randomUUID(), week_id: weekId, order_index: 1, description: null, video_url: null, rutube_url: null, homework_description: null, created_at: new Date(now).toISOString(), ...fields };
        fake.seed('days', [row]);
        return fake.db.days.find((d) => d.id === row.id);
    };
    // What is on the platform today: the intro, lesson 1 and the practice.
    const existing = {
        intro: lesson(w.w0.id, { title: 'Вводный эфир', video_url: 'https://youtu.be/7FcKw1MdmWs', created_at: '2026-11-08T12:00:00Z' }),
        lesson1: lesson(w.w1.id, { title: 'Урок 1. Основы Васту и влияние дома на жизнь', video_url: 'https://youtu.be/wNYWUkHBlmE', description: '<ol><li>Законы природы</li></ol>', created_at: '2026-11-10T15:45:00Z' }),
        practice: lesson(w.w1.id, { title: 'ЗАДАНИЕ - ПРАКТИКА', order_index: 2, description: '<p>Практика соединения с домом</p>', created_at: '2026-11-10T15:50:00Z' }),
    };

    const student = (email, grants, role = 'student') => {
        const u = fake.createUser(email);
        if (role !== 'student') fake.db.profiles.find((p) => p.id === u.id).role = role;
        for (const [courseId, expires] of grants) fake.seed('user_entitlements', [{ user_id: u.id, course_id: courseId, expires_at: expires, source: 'lava.top' }]);
        return u;
    };
    const s = {
        base: student('a-base@example.com', [[c.base.id, '2027-05-09T00:00:00Z']]),
        pro: student('b-pro@example.com', [[c.base.id, '2027-11-09T00:00:00Z'], [c.pro.id, '2027-11-09T00:00:00Z']]),
        expired: student('c-expired@example.com', [[c.base.id, '2026-11-01T00:00:00Z']]),
        biz: student('d-biz@example.com', [[c.biz.id, null]]),
        teacher: student('teacher@example.com', [[c.base.id, null]], 'teacher'),
    };

    const emails = [];
    const keys = [];
    const failSends = [];
    const sendEmail = async (msg) => {
        keys.push({ to: msg.to, key: msg.idempotencyKey });
        if (failSends.length) throw new Error(failSends.shift());
        emails.push(msg);
        return `email-${emails.length}`;
    };
    const posts = [];
    const tg = { fail: 0, updates: [] };
    const telegram = {
        async sendMessage(chat, post) {
            if (tg.fail > 0) { tg.fail -= 1; throw new Error('Telegram sendMessage 400: Bad Request: chat not found'); }
            posts.push({ chat, ...post });
            return 1000 + posts.length;
        },
        async getUpdates() { return tg.updates; },
    };
    const alerts = [];
    const config = readLessonNotifyConfig({
        LESSON_NOTIFY: 'live',
        LESSON_NOTIFY_SINCE: SINCE,
        TELEGRAM_BOT_TOKEN: 'bot-token',
        LESSON_NOTIFY_TELEGRAM: `vastu-design-2026=${CHANNEL}`,
        ...env,
    });
    const notifier = createLessonNotifier({
        getSupabase: () => sb,
        sendEmail,
        telegram,
        appUrl: 'https://lk.annaromeovastu.com',
        spareAppUrl: 'https://lk-ru.annaromeovastu.com',
        config,
        alert: async (subject, details) => { alerts.push({ subject, details }); },
        log: { log() {}, error() {} },
        now: clock.now,
        sleep: async () => {},
        sendGapMs: 0,
    });
    const announcement = (dayId) => fake.db.lesson_announcements.find((a) => a.day_id === dayId);
    const rowsOf = (dayId) => fake.db.lesson_notifications.filter((r) => r.day_id === dayId);
    return { fake, clock, c, w, s, lesson, existing, emails, keys, failSends, posts, tg, alerts, notifier, announcement, rowsOf };
}

const recipients = (emails) => emails.map((e) => e.to).sort();

// ------------------------------------------------------------ text and time

test('Quill descriptions read as lines: lists numbered or bulleted, entities decoded, blanks dropped', () => {
    const html = '<p>В этом уроке:</p><ol><li>Законы&nbsp;природы</li><li>Дом — <strong>живой</strong> организм</li></ol>'
        + '<ul><li>Карта</li><li><br></li></ul><p><br></p><p>Итог &laquo;урока&raquo; &amp; задание</p>';
    assert.deepEqual(htmlToLines(html), ['В этом уроке:', '1. Законы природы', '2. Дом — живой организм', '• Карта', 'Итог «урока» & задание']);
    // Quill 2 writes bullets inside <ol> and marks the item.
    assert.deepEqual(htmlToLines('<ol><li data-list="bullet">Север</li><li data-list="bullet">Юг</li></ol>'), ['• Север', '• Юг']);
    assert.deepEqual(htmlToLines(null), []);
    assert.deepEqual(htmlToLines('Просто текст<br>и вторая строка'), ['Просто текст', 'и вторая строка']);
});

test('a long description is cut at a word, and says so', () => {
    const long = `<p>${'слово '.repeat(100)}</p>`;
    const { lines, cut } = shortLines(long, { maxChars: 50 });
    assert.equal(cut, true);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].length <= 52 && lines[0].endsWith('…'), lines[0]);
    const many = `<ol>${Array.from({ length: 9 }, (_, i) => `<li>Пункт ${i + 1}</li>`).join('')}</ol>`;
    const short = shortLines(many, { maxLines: 3 });
    assert.deepEqual(short.lines, ['1. Пункт 1', '2. Пункт 2', '3. Пункт 3 …']);
    assert.deepEqual(shortLines('<p>Коротко</p>'), { lines: ['Коротко'], cut: false });
    // Lesson 1's description: two paragraphs; the second doesn't fit, so it is
    // left out whole rather than broken off mid-word.
    const two = shortLines(`<p>Вводный урок, с которого начинается вся работа с домом.</p><p><br></p><p>${'Вы узнаете три закона природы. '.repeat(12)}</p>`, { maxChars: 120 });
    assert.deepEqual(two, { lines: ['Вводный урок, с которого начинается вся работа с домом.'], cut: true });
});

test('a week is open like on the course page; a lesson opens when created, or when its week opens', () => {
    const now = at('2026-11-12T08:00:00Z');
    assert.equal(weekIsOpen({ is_locked: false, available_from: '2026-11-10T00:00:00Z' }, now), true);
    assert.equal(weekIsOpen({ is_locked: false, available_from: '2026-11-17T00:00:00Z' }, now), false);
    assert.equal(weekIsOpen({ is_locked: true, available_from: null }, now), false);
    assert.equal(weekIsOpen({ is_locked: false, available_from: null }, now), true);
    const week = { available_from: '2026-11-17T00:00:00Z' };
    assert.equal(lessonOpenedAt(week, { created_at: '2026-11-12T10:00:00Z' }), at('2026-11-17T00:00:00Z'), 'made ahead: opens with its week');
    assert.equal(lessonOpenedAt({ available_from: '2026-11-10T00:00:00Z' }, { created_at: '2026-11-12T10:00:00Z' }), at('2026-11-12T10:00:00Z'), 'added to an open week');
    assert.equal(lessonOpenedAt({}, {}), -Infinity, 'unknown: never counts as new');
});

test('a lesson needs more than a title: a video, text, homework or a file', () => {
    assert.equal(lessonHasContent({ title: 'Урок 2' }), false);
    assert.equal(lessonHasContent({ title: 'Урок 2', description: '<p><br></p>' }), false);
    assert.equal(lessonHasContent({ title: 'Урок 2', video_url: 'https://youtu.be/x' }), true);
    assert.equal(lessonHasContent({ title: 'Урок 2', rutube_url: 'https://rutube.ru/video/x' }), true);
    assert.equal(lessonHasContent({ title: 'ЗАДАНИЕ - ПРАКТИКА', description: '<p>Сделайте…</p>' }), true);
    assert.equal(lessonHasContent({ title: 'ЗАДАНИЕ - ПРАКТИКА', homework_description: '<p>Сдать</p>' }), true);
    assert.equal(lessonHasContent({ title: 'ЗАДАНИЕ - ПРАКТИКА' }, ['material-1']), true);
    assert.equal(lessonHasContent({ title: '  ', video_url: 'https://youtu.be/x' }), false);
});

test('emails go out in Moscow daytime: a week opening at 03:00 waits until 9:00', () => {
    const cfg = readLessonNotifyConfig({});
    assert.equal(inSendHours(at('2026-11-17T00:00:00Z'), cfg), false, '03:00 MSK');
    assert.equal(nextSendTime(at('2026-11-17T00:05:00Z'), cfg), at('2026-11-17T06:00:00Z'), 'to 09:00 MSK');
    assert.equal(nextSendTime(at('2026-11-17T19:30:00Z'), cfg), at('2026-11-18T06:00:00Z'), '22:30 MSK -> next morning');
    assert.equal(nextSendTime(at('2026-11-17T08:10:00Z'), cfg), at('2026-11-17T08:10:00Z'), 'daytime: now');
});

test('settings: off unless asked, live needs a start moment, Telegram per course', () => {
    const off = readLessonNotifyConfig({});
    assert.equal(off.mode, 'off');
    assert.deepEqual(off.courses, ['vastu-design-2026', 'vastu-design-2026-pro']);
    assert.deepEqual(off.problems, []);
    const live = readLessonNotifyConfig({ LESSON_NOTIFY: 'live' });
    assert.equal(live.since, null);
    assert.match(live.problems.join(), /LESSON_NOTIFY_SINCE/);
    const typo = readLessonNotifyConfig({ LESSON_NOTIFY: 'yes' });
    assert.equal(typo.mode, 'off');
    assert.equal(typo.problems.length, 1);
    assert.equal(readLessonNotifyConfig({ LESSON_NOTIFY: 'dry_run' }).mode, 'dry-run');
    const tg = readLessonNotifyConfig({ LESSON_NOTIFY_TELEGRAM: `vastu-design-2026=${CHANNEL}, broken` });
    assert.deepEqual(tg.telegram.chats, { 'vastu-design-2026': CHANNEL });
    assert.equal(tg.problems.length, 2, 'the broken pair, and no bot token');
    assert.deepEqual(readLessonNotifyConfig({ LESSON_NOTIFY_HOURS: '8-22' }).hours, { from: 8, to: 22 });
});

// ------------------------------------------------------------ the messages

const L = (over = {}) => ({
    dayId: 'day-1', weekId: 'week-1', courseId: 'course-1', courseSlug: 'vastu-design-2026', courseTitle: 'Васту-дизайн',
    courseOrder: 10, weekTitle: 'НЕДЕЛЯ 2. СТОРОНЫ СВЕТА', weekOrder: 2, dayOrder: 1,
    title: 'Урок 2. Стороны света и карта', descriptionHtml: '<ol><li>Как найти север</li><li>Карта квартиры</li></ol>', ...over,
});

test('the email: lesson title, its short description and a link that opens the lesson in its course', () => {
    const { subject, html, text } = buildLessonEmail({ lessons: [L()], appBase: 'https://lk.annaromeovastu.com', spareBase: 'https://lk-ru.annaromeovastu.com' });
    const url = 'https://lk.annaromeovastu.com/student/week/week-1/day/day-1?course=course-1';
    assert.equal(subject, 'Новый урок: Урок 2. Стороны света и карта');
    assert.ok(html.includes(`href="${url}"`));
    assert.ok(html.includes('Запасная ссылка') && html.includes('https://lk-ru.annaromeovastu.com/student/week/week-1/day/day-1?course=course-1'));
    assert.ok(html.includes('На курсе «Васту-дизайн» открылся новый урок.'));
    assert.ok(html.includes('1. Как найти север<br />2. Карта квартиры'));
    assert.ok(html.includes('color-scheme" content="light only"'), 'keeps her design in Gmail dark mode');
    assert.ok(text.includes(`Открыть урок: ${url}`) && text.includes('2. Карта квартиры'));
    assert.ok(text.includes('потому что учитесь на курсе «Васту-дизайн»'));
    const evil = buildLessonEmail({ lessons: [L({ title: '<script>x</script>' })], appBase: 'https://a' });
    assert.ok(!evil.html.includes('<script>x') && evil.html.includes('&lt;script&gt;'));
});

test('several lessons at once are one email, in course order', () => {
    const two = buildLessonEmail({ lessons: [L({ dayId: 'd2', dayOrder: 2, title: 'ЗАДАНИЕ - ПРАКТИКА', descriptionHtml: '' }), L()], appBase: 'https://a' });
    assert.equal(two.subject, 'Новые уроки на курсе «Васту-дизайн»');
    assert.ok(two.text.indexOf('Урок 2.') < two.text.indexOf('ЗАДАНИЕ - ПРАКТИКА'));
    assert.equal((two.html.match(/Открыть урок/g) || []).length, 2);
    const mixed = buildLessonEmail({ lessons: [L(), L({ dayId: 'd3', courseId: 'c2', courseTitle: 'Васту-дизайн · Наставничество', courseOrder: 11 })], appBase: 'https://a' });
    assert.equal(mixed.subject, 'Новые уроки в личном кабинете');
    assert.ok(mixed.text.includes('на курсах «Васту-дизайн» и «Васту-дизайн · Наставничество»'));
});

test('the Telegram post: the lesson, its topics and a button to open it', () => {
    const post = buildTelegramPost({ lessons: [L({ title: 'Урок 2 <важное> & новое' })], appBase: 'https://lk.annaromeovastu.com' });
    assert.ok(post.text.startsWith('🤍 <b>Новый урок на платформе</b>'));
    assert.ok(post.text.includes('<b>Урок 2 &lt;важное&gt; &amp; новое</b>'));
    assert.ok(post.text.includes('1. Как найти север'));
    assert.deepEqual(post.reply_markup.inline_keyboard, [[{ text: 'Открыть урок', url: 'https://lk.annaromeovastu.com/student/week/week-1/day/day-1?course=course-1' }]]);
});

// ---------------------------------------------------------------- the runs

async function settleAndRun(wd, minutes = 31) {
    await wd.notifier.run();
    wd.clock.advance(minutes * MIN);
    return wd.notifier.run();
}

test('switching it on announces nothing so far: lesson 1 and the practice opened before LESSON_NOTIFY_SINCE', async () => {
    const wd = world();
    const r = await wd.notifier.run();
    wd.clock.advance(2 * 60 * MIN);
    await wd.notifier.run();
    assert.equal(r.error, undefined);
    assert.deepEqual(r.lessons.map((l) => [l.title, l.state]), [
        ['Вводный эфир', 'before-since'],
        ['Урок 1. Основы Васту и влияние дома на жизнь', 'before-since'],
        ['ЗАДАНИЕ - ПРАКТИКА', 'before-since'],
    ]);
    assert.equal(wd.emails.length, 0);
    assert.equal(wd.posts.length, 0);
    assert.equal(wd.fake.db.lesson_announcements.length, 0);
});

test('a lesson added to an open week: once unchanged for 30 minutes, every student with access gets one email, and the channel one post', async () => {
    const wd = world();
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 2. Стороны света и карта', order_index: 3, video_url: 'https://youtu.be/abc', description: '<ol><li>Север</li><li>Карта</li></ol>' });

    const first = await wd.notifier.run();
    assert.equal(first.lessons.find((l) => l.dayId === day.id).state, 'new');
    assert.equal(wd.emails.length, 0, 'not while it may still be being filled in');
    wd.clock.advance(10 * MIN);
    assert.equal((await wd.notifier.run()).lessons.find((l) => l.dayId === day.id).state, 'settling');
    assert.equal(wd.emails.length, 0);

    wd.clock.advance(21 * MIN);
    const due = await wd.notifier.run();
    assert.deepEqual(due.announced, ['Урок 2. Стороны света и карта']);
    // Not: the expired student, the «Васту для бизнеса» student, the teacher.
    assert.deepEqual(recipients(wd.emails), ['a-base@example.com', 'b-pro@example.com']);
    assert.equal(wd.emails[0].subject, 'Новый урок: Урок 2. Стороны света и карта');
    assert.ok(wd.emails[0].html.includes(`/student/week/${wd.w.w1.id}/day/${day.id}?course=${wd.c.base.id}`));
    assert.match(wd.emails[0].idempotencyKey, /^lesson-notify\/[0-9a-f-]+\/[0-9a-f]{24}$/);
    assert.equal(wd.posts.length, 1);
    assert.equal(wd.posts[0].chat, CHANNEL);
    assert.ok(wd.posts[0].text.includes('Урок 2. Стороны света и карта'));
    const ann = wd.announcement(day.id);
    assert.equal(ann.status, 'sent');
    assert.equal(ann.recipients, 2);
    assert.equal(ann.tg_status, 'posted');
    assert.equal(ann.tg_message_id, 1001);
    assert.deepEqual(wd.rowsOf(day.id).map((r) => r.status), ['sent', 'sent']);

    // Never again: not on the next run, not after an edit.
    wd.clock.advance(60 * MIN);
    await wd.notifier.run();
    day.title = 'Урок 2. Стороны света и карта (исправлено)';
    day.description = '<p>Новый текст</p>';
    wd.clock.advance(60 * MIN);
    await settleAndRun(wd);
    assert.equal(wd.emails.length, 2);
    assert.equal(wd.posts.length, 1);
    assert.deepEqual(wd.alerts, []);
});

test('a lesson with only a title waits until it is filled in', async () => {
    const wd = world();
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 3', order_index: 4 });
    await settleAndRun(wd, 120);
    assert.equal(wd.emails.length, 0);
    assert.equal(wd.announcement(day.id), undefined);
    day.rutube_url = 'https://rutube.ru/video/abc/';
    const r = await settleAndRun(wd);
    assert.deepEqual(r.announced, ['Урок 3']);
    assert.equal(wd.emails.length, 2);
});

test('an edit during the quiet period starts it again, and the email has the final text', async () => {
    const wd = world();
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 2', order_index: 3, video_url: 'https://youtu.be/abc', description: '<p>Черновик</p>' });
    await wd.notifier.run();
    wd.clock.advance(20 * MIN);
    day.description = '<p>Готовое описание</p>';
    assert.equal((await wd.notifier.run()).lessons.find((l) => l.dayId === day.id).state, 'changed');
    wd.clock.advance(15 * MIN);
    assert.equal((await wd.notifier.run()).lessons.find((l) => l.dayId === day.id).state, 'settling', '35 min after creation, but only 15 after the edit');
    assert.equal(wd.emails.length, 0);
    wd.clock.advance(16 * MIN);
    await wd.notifier.run();
    assert.equal(wd.emails.length, 2);
    assert.ok(wd.emails[0].text.includes('Готовое описание') && !wd.emails[0].text.includes('Черновик'));
});

test('a week that opens with two lessons: one email per student listing both, at 9:00 Moscow time', async () => {
    const wd = world({ start: '2026-11-13T10:00:00Z' });
    // Made ahead of time, in a week that opens on 17 Nov (03:00 MSK).
    const a = wd.lesson(wd.w.w2.id, { title: 'Урок 4. Стороны света', order_index: 1, video_url: 'https://youtu.be/a' });
    const b = wd.lesson(wd.w.w2.id, { title: 'ЗАДАНИЕ - ПРАКТИКА', order_index: 2, description: '<p>Нарисуйте план</p>' });
    const before = await wd.notifier.run();
    assert.deepEqual(before.lessons.filter((l) => [a.id, b.id].includes(l.dayId)).map((l) => l.state), ['locked', 'locked']);

    wd.clock.set('2026-11-17T00:05:00Z');
    await wd.notifier.run();
    wd.clock.set('2026-11-17T01:00:00Z');
    const night = await wd.notifier.run();
    assert.equal(night.lessons.find((l) => l.dayId === a.id).state, 'waiting-hours');
    assert.equal(night.lessons.find((l) => l.dayId === a.id).dueAt, '2026-11-17T06:00:00.000Z');
    assert.equal(wd.emails.length, 0);

    wd.clock.set('2026-11-17T06:00:00Z');
    await wd.notifier.run();
    assert.deepEqual(recipients(wd.emails), ['a-base@example.com', 'b-pro@example.com']);
    assert.equal(wd.emails[0].subject, 'Новые уроки на курсе «Васту-дизайн»');
    assert.ok(wd.emails[0].text.indexOf('Урок 4. Стороны света') < wd.emails[0].text.indexOf('ЗАДАНИЕ - ПРАКТИКА'));
    assert.equal(wd.posts.length, 1);
    assert.ok(wd.posts[0].text.includes('Новые уроки') && wd.posts[0].text.includes('Нарисуйте план'));
    assert.equal(wd.posts[0].reply_markup.inline_keyboard.length, 2);
});

test('a Наставничество lesson goes only to its students, and not to the channel both tariffs share', async () => {
    const wd = world();
    const day = wd.lesson(wd.w.pro.id, { title: 'Бизнес-блок. Урок 1', video_url: 'https://youtu.be/p' });
    await settleAndRun(wd);
    assert.deepEqual(recipients(wd.emails), ['b-pro@example.com']);
    assert.equal(wd.posts.length, 0);
    assert.equal(wd.announcement(day.id).tg_status, 'off');
    assert.equal(wd.announcement(day.id).status, 'sent');
});

test('a failed email is tried again on the next run with the same idempotency key, then the lesson is done', async () => {
    const wd = world();
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 2', order_index: 3, video_url: 'https://youtu.be/abc' });
    wd.failSends.push('Resend 500: fake outage');
    await settleAndRun(wd);
    assert.deepEqual(recipients(wd.emails), ['b-pro@example.com']);
    assert.equal(wd.announcement(day.id).status, 'sending');
    assert.match(wd.alerts.map((a) => a.subject).join(), /письма не ушли/);
    const failedRow = wd.rowsOf(day.id).find((r) => r.status === 'failed');
    assert.equal(failedRow.attempts, 1);

    wd.clock.advance(5 * MIN);
    await wd.notifier.run();
    assert.deepEqual(recipients(wd.emails), ['a-base@example.com', 'b-pro@example.com']);
    const tries = wd.keys.filter((k) => k.to === 'a-base@example.com');
    assert.equal(tries.length, 2);
    assert.equal(tries[0].key, tries[1].key, 'Resend drops a repeat that did leave the first time');
    assert.equal(wd.announcement(day.id).status, 'sent');
});

test("Resend's 429 (too fast, or the day's quota): everyone waits 30 minutes, and nobody loses an attempt", async () => {
    const wd = world();
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 2', order_index: 3, video_url: 'https://youtu.be/abc' });
    wd.failSends.push('Resend 429: daily_quota_exceeded');
    const r = await settleAndRun(wd);
    assert.ok(r.emails.pausedUntil);
    assert.equal(wd.keys.length, 1, 'nobody else tried in that run');
    assert.deepEqual(wd.rowsOf(day.id).map((x) => [x.status, x.attempts]), [['pending', 0], ['pending', 0]]);
    assert.match(wd.alerts.map((a) => a.subject).join(), /429/);
    wd.clock.advance(5 * MIN);
    await wd.notifier.run();
    assert.equal(wd.keys.length, 1, 'no knocking every five minutes');
    wd.clock.advance(26 * MIN);
    await wd.notifier.run();
    assert.deepEqual(recipients(wd.emails), ['a-base@example.com', 'b-pro@example.com']);
    assert.equal(wd.announcement(day.id).status, 'sent');
});

test('a run cut off halfway is finished by the next one', async () => {
    const wd = world();
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 2', order_index: 3, video_url: 'https://youtu.be/abc' });
    await settleAndRun(wd);
    assert.equal(wd.emails.length, 2);
    // As if a deploy had stopped it right after one send was claimed.
    const row = wd.rowsOf(day.id)[0];
    Object.assign(row, { status: 'sending', updated_at: new Date(wd.clock.now() - 20 * MIN).toISOString() });
    wd.announcement(day.id).status = 'sending';
    await wd.notifier.run();
    assert.equal(wd.emails.length, 3);
    assert.equal(wd.emails[2].to, row.email);
    assert.equal(wd.keys[2].key, wd.keys.find((k) => k.to === row.email).key);
    assert.equal(wd.announcement(day.id).status, 'sent');
});

test('a Telegram post that fails is tried again and Tymur hears about it', async () => {
    const wd = world();
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 2', order_index: 3, video_url: 'https://youtu.be/abc' });
    wd.tg.fail = 1;
    await settleAndRun(wd);
    assert.equal(wd.posts.length, 0);
    assert.equal(wd.announcement(day.id).tg_status, 'failed');
    assert.match(wd.alerts.map((a) => a.subject).join(), /Telegram/);
    assert.equal(wd.emails.length, 2, 'emails go out anyway');
    wd.clock.advance(5 * MIN);
    await wd.notifier.run();
    assert.equal(wd.posts.length, 1);
    assert.equal(wd.announcement(day.id).tg_status, 'posted');
});

test('the dry run writes and sends nothing, and says who would get what', async () => {
    const wd = world({ env: { LESSON_NOTIFY: 'dry-run' } });
    const day = wd.lesson(wd.w.w1.id, { title: 'Урок 2', order_index: 3, video_url: 'https://youtu.be/abc' });
    const r = await settleAndRun(wd);
    assert.equal(r.mode, 'dry-run');
    const entry = r.lessons.find((l) => l.dayId === day.id);
    assert.equal(entry.state, 'new', 'nothing is remembered between dry runs');
    assert.deepEqual(entry.emails, ['a-base@example.com', 'b-pro@example.com']);
    assert.equal(entry.students, 2);
    assert.equal(entry.telegram, CHANNEL);
    assert.deepEqual(r.courses.map((c) => [c.slug, c.students]), [['vastu-design-2026', 2], ['vastu-design-2026-pro', 1]]);
    assert.equal(wd.emails.length + wd.posts.length, 0);
    assert.equal(wd.fake.db.lesson_announcements.length + wd.fake.db.lesson_notifications.length, 0);

    // What if LESSON_NOTIFY_SINCE were the start of 10 Nov: lesson 1 and the practice would go out too.
    const whatIf = await wd.notifier.run({ dryRun: true, since: at('2026-11-10T00:00:00Z') });
    assert.deepEqual(whatIf.lessons.filter((l) => l.state === 'new').map((l) => l.title), ['Урок 1. Основы Васту и влияние дома на жизнь', 'ЗАДАНИЕ - ПРАКТИКА', 'Урок 2']);
    assert.equal(wd.emails.length, 0);
});

test('live without LESSON_NOTIFY_SINCE sends nothing, and a since override never reaches a live run', async () => {
    const wd = world({ env: { LESSON_NOTIFY_SINCE: '' } });
    wd.lesson(wd.w.w1.id, { title: 'Урок 2', order_index: 3, video_url: 'https://youtu.be/abc' });
    const r = await settleAndRun(wd);
    assert.equal(r.skipped, 'LESSON_NOTIFY_SINCE not set');
    assert.equal(wd.emails.length, 0);
    const forced = await wd.notifier.run({ since: at('2026-11-01T00:00:00Z') });
    assert.equal(forced.skipped, 'LESSON_NOTIFY_SINCE not set');
    assert.equal(wd.fake.db.lesson_announcements.length, 0);
});

test('the test send: one lesson exactly as students get it, to one address and one chat, recording nothing', async () => {
    const wd = world();
    const r = await wd.notifier.testSend({ dayId: wd.existing.lesson1.id, email: ' Test.Student@Example.com ', telegramChat: '555' });
    assert.equal(r.sentTo, 'test.student@example.com');
    assert.equal(r.subject, 'Новый урок: Урок 1. Основы Васту и влияние дома на жизнь');
    assert.equal(wd.emails.length, 1);
    assert.equal(wd.emails[0].idempotencyKey, undefined);
    assert.deepEqual(wd.posts.map((p) => p.chat), ['555']);
    assert.equal(wd.fake.db.lesson_announcements.length + wd.fake.db.lesson_notifications.length, 0);
    const preview = await wd.notifier.testSend({ dayId: wd.existing.practice.id });
    assert.ok(preview.html.includes('ЗАДАНИЕ - ПРАКТИКА'));
    assert.equal(wd.emails.length, 1, 'no address: only rendered');
    await assert.rejects(wd.notifier.testSend({ dayId: wd.existing.lesson1.id, email: 'not-an-email' }), /invalid email/);
});

test("the bot's chats, to find the course channel's id", async () => {
    const wd = world();
    wd.tg.updates = [
        { update_id: 1, my_chat_member: { chat: { id: -1001234567890, title: 'Канал курса ВАСТУ-ДИЗАЙН', type: 'channel' }, new_chat_member: { status: 'administrator' } } },
        { update_id: 2, message: { chat: { id: 42, first_name: 'Tymur', type: 'private' } } },
    ];
    assert.deepEqual(await wd.notifier.telegramChats(), [
        { id: -1001234567890, type: 'channel', title: 'Канал курса ВАСТУ-ДИЗАЙН', botStatus: 'administrator' },
        { id: 42, type: 'private', title: 'Tymur', botStatus: null },
    ]);
});
