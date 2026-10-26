#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Put one lesson file into a course: upload it to the course-content bucket
// and point a `materials` row at it — the same row the teacher editor writes
// when a file is dropped on a lesson.
//
//   node scripts/import-lesson.mjs --course vastu-design-2026 --week 1 --day 2 \
//        --title "Конспект урока" --file ~/Downloads/lesson-2.pdf --dry-run
//
// Weeks and lessons are addressed by number — order_index, 1-based, the way
// the editor numbers them. A missing week or lesson is created only when it
// is named (--week-title / --day-title), so a wrong number can't quietly
// invent a week that students then see.
//
// Idempotent. A material is keyed by (lesson or week, title):
//   - same command, same file -> nothing changes
//   - same command, new file  -> the same row points at the new file and the
//                                old file is deleted
// The storage key carries a hash of the bytes, so a replaced file gets a new
// URL and nobody is served a stale cached copy.
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env, or .env next to
// package.json — .env is gitignored). The service-role key bypasses RLS:
// keep it out of chats and git.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'course-content';

const USAGE = `Usage:
  node scripts/import-lesson.mjs --course <slug> --week <n> [--day <n>] --title <text> --file <path> [options]
  node scripts/import-lesson.mjs --course <slug> --week <n> [--day <n>] --title <text> --remove

  --course       course slug, e.g. vastu-design-2026 or vastu-design-2026-pro
  --week         week number (order_index in the editor, 1-based)
  --day          lesson number inside the week; leave out for a week material
  --title        what students see; re-running with the same title replaces the file
  --file         the file to upload (pdf, pptx, doc/docx, zip, mp4…)
  --type         pdf | pptx | doc | zip | video (default: from the file extension)
  --week-title   create the week with this title if it doesn't exist yet
  --week-opens   YYYY-MM-DD, only when creating the week: it shows as locked until then
  --day-title    create the lesson with this title if it doesn't exist yet
  --homework     list the file under the lesson's homework instead of its materials
  --remove       delete this material and its file instead of uploading
  --dry-run      show what would happen, write nothing`;

// materials.type is CHECK-constrained to these; FileUploader maps the same
// extensions the same way.
const TYPES = new Set(['pdf', 'pptx', 'doc', 'zip', 'video']);
const TYPE_BY_EXT = {
    pdf: 'pdf', ppt: 'pptx', pptx: 'pptx', doc: 'doc', docx: 'doc',
    zip: 'zip', rar: 'zip', '7z': 'zip', mp4: 'video', mov: 'video', avi: 'video', mkv: 'video',
};
const CONTENT_TYPE = {
    pdf: 'application/pdf',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
};

// A mistake the person running the command can fix — printed without a stack.
export class UserError extends Error {}

const TRANSLIT = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
    л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

// Storage rejects non-ASCII keys, so Cyrillic titles are transliterated.
export function slugify(title) {
    const s = [...String(title).toLowerCase()]
        .map((ch) => TRANSLIT[ch] ?? ch)
        .join('')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '');
    return s || 'material';
}

// Same folders as the teacher editor (days/<id>/…, weeks/<id>/…), so one
// storage policy can cover files from both.
export function objectKey({ dayId, weekId, title, hash, ext }) {
    return `${dayId ? `days/${dayId}` : `weeks/${weekId}`}/${slugify(title)}-${hash}.${ext}`;
}

export function parseCli(argv) {
    const { values: v } = parseArgs({
        args: argv,
        strict: true,
        options: {
            course: { type: 'string' },
            week: { type: 'string' },
            day: { type: 'string' },
            title: { type: 'string' },
            file: { type: 'string' },
            type: { type: 'string' },
            'week-title': { type: 'string' },
            'week-opens': { type: 'string' },
            'day-title': { type: 'string' },
            homework: { type: 'boolean' },
            remove: { type: 'boolean' },
            'dry-run': { type: 'boolean' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    if (v.help) return { help: true };

    const num = (name) => {
        if (v[name] === undefined) return null;
        if (!/^[1-9]\d*$/.test(v[name])) throw new UserError(`--${name} must be a whole number from 1 (got "${v[name]}")`);
        return Number(v[name]);
    };
    const opts = {
        course: (v.course || '').trim(),
        week: num('week'),
        day: num('day'),
        title: (v.title || '').trim(),
        file: v.file ? v.file.replace(/^~(?=\/)/, os.homedir()) : null,
        type: v.type ? v.type.toLowerCase() : null,
        weekTitle: v['week-title']?.trim() || null,
        weekOpens: v['week-opens'] || null,
        dayTitle: v['day-title']?.trim() || null,
        homework: !!v.homework,
        remove: !!v.remove,
        dryRun: !!v['dry-run'],
    };
    if (!opts.course) throw new UserError('--course is required');
    if (!opts.week) throw new UserError('--week is required');
    if (!opts.title) throw new UserError('--title is required');
    if (!opts.remove && !opts.file) throw new UserError('--file is required (or --remove)');
    if (opts.remove && opts.file) throw new UserError('--remove takes no --file');
    if (opts.type && !TYPES.has(opts.type)) throw new UserError(`--type must be one of: ${[...TYPES].join(', ')}`);
    if (opts.weekOpens && !/^\d{4}-\d{2}-\d{2}$/.test(opts.weekOpens)) throw new UserError('--week-opens must look like 2026-11-16');
    if (opts.dayTitle && !opts.day) throw new UserError('--day-title needs --day');
    return opts;
}

function readLessonFile(file, typeOverride) {
    let bytes;
    try {
        bytes = fs.readFileSync(file);
    } catch (err) {
        throw new UserError(`Can't read ${file}: ${err.code || err.message}`);
    }
    if (!bytes.length) throw new UserError(`${file} is empty`);
    const ext = path.extname(file).slice(1).toLowerCase();
    const type = typeOverride || TYPE_BY_EXT[ext];
    if (!type) throw new UserError(`Can't tell the type of .${ext || '(no extension)'} — pass --type (${[...TYPES].join(', ')})`);
    return {
        name: path.basename(file),
        bytes,
        ext: ext || type,
        type,
        contentType: CONTENT_TYPE[ext] || 'application/octet-stream',
        hash: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10),
    };
}

async function rows(query) {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
}

const mb = (n) => (n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const listOf = (items) => items.map((x) => `${x.order_index} «${x.title}»`).join(', ') || 'none yet';
const isDuplicate = (e) => String(e?.statusCode) === '409' || e?.status === 409 || /already exists|duplicate/i.test(e?.message || '');
const isTooLarge = (e) => String(e?.statusCode) === '413' || e?.status === 413 || /too large|maximum allowed size|exceeded/i.test(e?.message || '');

export async function importLesson(opts, { supabase, log = console.log }) {
    const store = supabase.storage.from(BUCKET);
    const urlOf = (key) => store.getPublicUrl(key).data.publicUrl;
    const publicPrefix = urlOf('');
    // Only files in our bucket are ever deleted; a material may also point
    // at an outside link.
    const keyOf = (url) =>
        url && url.startsWith(publicPrefix) ? decodeURIComponent(url.slice(publicPrefix.length).split('?')[0]) : null;
    const objectExists = async (key) => {
        const slash = key.lastIndexOf('/');
        const { data } = await store.list(key.slice(0, slash), { search: key.slice(slash + 1), limit: 5 });
        return (data || []).some((o) => o.name === key.slice(slash + 1));
    };
    const deleteIfUnused = async (oldUrl, objKey) => {
        if (!objKey) return;
        const users = await rows(supabase.from('materials').select('id').eq('url', oldUrl).limit(1));
        if (users.length) {
            log(`  kept ${BUCKET}/${objKey} — another material still uses it`);
            return;
        }
        const { error } = await store.remove([objKey]);
        if (error) log(`! could not delete ${BUCKET}/${objKey}: ${error.message}`);
        else log(`  deleted ${BUCKET}/${objKey}`);
    };

    const file = opts.remove ? null : readLessonFile(opts.file, opts.type);

    const courses = await rows(supabase.from('courses').select('id, slug, title').eq('slug', opts.course));
    const course = courses[0];
    if (!course) {
        const known = await rows(supabase.from('courses').select('slug').order('order_index'));
        throw new UserError(`No course "${opts.course}". Courses: ${known.map((c) => c.slug).join(', ')}`);
    }

    const weeks = await rows(
        supabase.from('weeks').select('id, title, order_index, available_from').eq('course_id', course.id).order('order_index')
    );
    const weekHits = weeks.filter((w) => w.order_index === opts.week);
    if (weekHits.length > 1) {
        throw new UserError(`Week ${opts.week} is ambiguous — ${weekHits.length} weeks share that number (${listOf(weekHits)}). Fix the order in the editor first.`);
    }
    let week = weekHits[0] || null;

    let days = [];
    if (week && opts.day) {
        days = await rows(supabase.from('days').select('id, title, order_index').eq('week_id', week.id).order('order_index'));
    }
    const dayHits = days.filter((d) => d.order_index === opts.day);
    if (dayHits.length > 1) {
        throw new UserError(`Lesson ${opts.day} of week ${opts.week} is ambiguous — ${dayHits.length} lessons share that number (${listOf(dayHits)}). Fix the order in the editor first.`);
    }
    let day = dayHits[0] || null;
    const where = opts.day ? `week ${opts.week}, lesson ${opts.day}` : `week ${opts.week}`;

    let matches = [];
    if (day) {
        matches = await rows(supabase.from('materials').select('id, title, type, url, is_homework').eq('day_id', day.id).eq('title', opts.title));
    } else if (week && !opts.day) {
        matches = await rows(
            supabase.from('materials').select('id, title, type, url, is_homework').eq('week_id', week.id).is('day_id', null).eq('title', opts.title)
        );
    }
    if (matches.length > 1) {
        throw new UserError(`${matches.length} materials titled «${opts.title}» already sit on ${where} — delete the extras in the editor, then re-run.`);
    }
    const current = matches[0] || null;

    log(`course   : «${course.title}» (${course.slug})`);

    // ------------------------------------------------------------ --remove
    if (opts.remove) {
        if (!current) {
            log(`nothing to remove: no material «${opts.title}» on ${where}`);
            return { action: 'none' };
        }
        const oldKey = keyOf(current.url);
        log(`material : remove «${current.title}» (${current.id})`);
        if (oldKey) log(`file     : delete ${BUCKET}/${oldKey} if nothing else uses it`);
        if (opts.dryRun) {
            log('dry run — nothing written');
            return { action: 'remove', dryRun: true };
        }
        await rows(supabase.from('materials').delete().eq('id', current.id).select('id'));
        await deleteIfUnused(current.url, oldKey);
        log(`✓ removed «${current.title}» from ${where}`);
        return { action: 'removed', materialId: current.id };
    }

    // ------------------------------------------------------------- upload
    if (!week && !opts.weekTitle) {
        throw new UserError(`«${course.title}» has no week ${opts.week} (weeks: ${listOf(weeks)}). To create it, add --week-title "…".`);
    }
    if (opts.day && !day && !opts.dayTitle) {
        throw new UserError(
            week
                ? `Week ${opts.week} has no lesson ${opts.day} (lessons: ${listOf(days)}). To create it, add --day-title "…".`
                : `Week ${opts.week} will be new, so lesson ${opts.day} needs --day-title "…" too.`
        );
    }

    const { data: bucket } = await supabase.storage.getBucket(BUCKET);
    if (bucket?.file_size_limit && file.bytes.length > bucket.file_size_limit) {
        throw new UserError(`${file.name} is ${mb(file.bytes.length)}; the ${BUCKET} bucket takes at most ${mb(bucket.file_size_limit)}.`);
    }

    if (week) {
        log(`week ${opts.week}   : «${week.title}»${week.available_from ? ` (opens ${week.available_from.slice(0, 10)})` : ''}`);
        if (opts.weekTitle && opts.weekTitle !== week.title) log('           (exists — --week-title ignored, rename it in the editor)');
        if (opts.weekOpens) log('           (exists — --week-opens ignored, change the date in the editor)');
    } else {
        log(`week ${opts.week}   : NEW «${opts.weekTitle}»${opts.weekOpens ? ` (opens ${opts.weekOpens})` : ''}`);
    }
    if (opts.day) {
        if (day) {
            log(`lesson ${opts.day} : «${day.title}»`);
            if (opts.dayTitle && opts.dayTitle !== day.title) log('           (exists — --day-title ignored, rename it in the editor)');
        } else {
            log(`lesson ${opts.day} : NEW «${opts.dayTitle}»`);
        }
    }
    log(`file     : ${file.name}, ${mb(file.bytes.length)}, ${file.type}, sha256 ${file.hash}…`);

    const plannedKey = objectKey({
        dayId: opts.day ? day?.id || '<new-lesson>' : null,
        weekId: week?.id || '<new-week>',
        title: opts.title,
        hash: file.hash,
        ext: file.ext,
    });
    const sameFile = current && keyOf(current.url) === plannedKey;
    if (sameFile && current.type === file.type && !!current.is_homework === opts.homework) {
        if (await objectExists(plannedKey)) {
            log(`material : «${opts.title}» is already this file — nothing to do`);
            return { action: 'unchanged', materialId: current.id, url: current.url };
        }
        log('           (its file is missing from storage — uploading it again)');
    }
    const oldKey = current && !sameFile ? keyOf(current.url) : null;
    log(`material : ${current ? `replace «${opts.title}» (${current.id})` : `add «${opts.title}»`}${opts.homework ? ' as homework' : ''}`);
    log(`storage  : ${BUCKET}/${plannedKey}${bucket?.public ? '  (public bucket: anyone with the link can download it)' : ''}`);
    if (oldKey) log(`old file : delete ${BUCKET}/${oldKey} if nothing else uses it`);

    if (opts.dryRun) {
        log('dry run — nothing written');
        return { action: current ? 'replace' : 'insert', dryRun: true, key: plannedKey };
    }

    if (!week) {
        [week] = await rows(
            supabase
                .from('weeks')
                .insert({
                    course_id: course.id,
                    title: opts.weekTitle,
                    order_index: opts.week,
                    // What the editor's date field stores: midnight UTC.
                    available_from: opts.weekOpens ? `${opts.weekOpens}T00:00:00.000Z` : null,
                })
                .select('id, title')
        );
    }
    if (opts.day && !day) {
        [day] = await rows(
            supabase.from('days').insert({ week_id: week.id, title: opts.dayTitle, order_index: opts.day }).select('id, title')
        );
    }

    const key = objectKey({ dayId: day?.id, weekId: week.id, title: opts.title, hash: file.hash, ext: file.ext });
    const { error: upErr } = await store.upload(key, file.bytes, { contentType: file.contentType, upsert: false });
    // Same key = same title and same bytes: a re-run after a half-finished one.
    if (upErr && !isDuplicate(upErr)) {
        if (isTooLarge(upErr)) {
            throw new UserError(`Supabase refused ${file.name} (${mb(file.bytes.length)}) as too large — the project's upload limit (Storage settings; 50 MB on the Free plan). Compress the file or raise the limit.`);
        }
        throw new Error(`upload failed: ${upErr.message}`);
    }
    const url = urlOf(key);

    const fields = { title: opts.title, type: file.type, url, is_homework: opts.homework };
    let materialId = current?.id;
    if (current) {
        await rows(supabase.from('materials').update(fields).eq('id', current.id).select('id'));
    } else {
        [{ id: materialId }] = await rows(
            supabase.from('materials').insert({ ...fields, ...(day ? { day_id: day.id } : { week_id: week.id }) }).select('id')
        );
    }
    if (oldKey) await deleteIfUnused(current.url, oldKey);

    // Students open materials by this URL directly, so it has to answer.
    const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (!head?.ok) log(`! the file's URL answered ${head ? head.status : 'nothing'} — students may not be able to open it`);

    log(`✓ ${current ? 'replaced' : 'added'} «${opts.title}» on ${where}`);
    log(`  ${url}`);
    return { action: current ? 'replaced' : 'inserted', materialId, url, key, weekId: week.id, dayId: day?.id || null };
}

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment, else from
// the gitignored .env next to package.json.
function loadEnv() {
    const env = { ...process.env };
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
    if (fs.existsSync(file)) {
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
            if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
        }
    }
    return env;
}

// The anon key would get past today's over-open policies for inserts but not
// for updates or deletes — refuse it rather than half-work.
function keyRole(key) {
    if (key.startsWith('sb_secret_')) return 'service_role';
    if (key.startsWith('sb_publishable_')) return 'anon';
    try {
        return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role || null;
    } catch {
        return null;
    }
}

export async function main(argv) {
    let opts;
    try {
        opts = parseCli(argv);
    } catch (err) {
        console.error(`✗ ${err.message}\n\n${USAGE}`);
        return 2;
    }
    if (opts.help) {
        console.log(USAGE);
        return 0;
    }
    const env = loadEnv();
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (environment, or vastu-portal/.env).');
        return 2;
    }
    if (keyRole(key) !== 'service_role') {
        console.error('✗ SUPABASE_SERVICE_ROLE_KEY is not a service-role key (Supabase → Project Settings → API keys).');
        return 2;
    }
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
        await importLesson(opts, { supabase });
        return 0;
    } catch (err) {
        console.error(err instanceof UserError ? `✗ ${err.message}` : `✗ ${err?.stack || err}`);
        return 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).then((code) => process.exit(code));
}
