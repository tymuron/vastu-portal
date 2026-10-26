// scripts/import-lesson.mjs end to end: the real CLI, run as a child process,
// against the local fake Supabase (test/fake-services.mjs). Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeServices } from './fake-services.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const jwt = (role) => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.');
const COURSE = { id: crypto.randomUUID(), slug: 'vastu-design-2026', title: 'Васту-дизайн', order_index: 10 };
const PRO = { id: crypto.randomUUID(), slug: 'vastu-design-2026-pro', title: 'Васту-дизайн · Наставничество', order_index: 11 };

let fake, fakeUrl, tmp;

test.before(async () => {
    fake = createFakeServices();
    fakeUrl = `http://127.0.0.1:${await fake.listen()}`;
    fake.seed('courses', [COURSE, PRO]);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'import-lesson-'));
});
test.after(async () => {
    await fake.close();
    fs.rmSync(tmp, { recursive: true, force: true });
});
test.beforeEach(() => {
    for (const t of ['weeks', 'days', 'materials']) fake.db[t].length = 0;
    const bucket = fake.buckets.get('course-content');
    bucket.objects.clear();
    bucket.file_size_limit = null;
    bucket.public = true;
});

function pdf(name, text) {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, `%PDF-1.4\n${text}\n%%EOF\n`);
    return file;
}

function run(args, key = jwt('service_role')) {
    return new Promise((resolve) => {
        const p = spawn(process.execPath, ['scripts/import-lesson.mjs', ...args], {
            cwd: root,
            env: { ...process.env, SUPABASE_URL: fakeUrl, SUPABASE_SERVICE_ROLE_KEY: key },
        });
        let out = '';
        p.stdout.on('data', (c) => (out += c));
        p.stderr.on('data', (c) => (out += c));
        p.on('close', (code) => resolve({ code, out }));
    });
}

const objects = () => [...fake.buckets.get('course-content').objects.keys()];
const lesson = (...extra) => ['--course', COURSE.slug, '--week', '1', '--day', '2', '--title', 'Конспект урока', ...extra];
const newWeekAndDay = ['--week-title', 'Модуль 1. Увидеть', '--week-opens', '2026-11-09', '--day-title', 'Урок 2. Стороны света'];

test('first run creates the week and lesson, uploads the file and adds one material', async () => {
    const file = pdf('lesson.pdf', 'version 1');
    const r = await run([...lesson('--file', file), ...newWeekAndDay]);
    assert.equal(r.code, 0, r.out);

    assert.equal(fake.db.weeks.length, 1);
    const [week] = fake.db.weeks;
    assert.deepEqual(
        { course: week.course_id, n: week.order_index, title: week.title, opens: week.available_from },
        { course: COURSE.id, n: 1, title: 'Модуль 1. Увидеть', opens: '2026-11-09T00:00:00.000Z' }
    );
    const [day] = fake.db.days;
    assert.deepEqual({ week: day.week_id, n: day.order_index, title: day.title }, { week: week.id, n: 2, title: 'Урок 2. Стороны света' });

    assert.equal(fake.db.materials.length, 1);
    const [m] = fake.db.materials;
    assert.deepEqual(
        { day: m.day_id, week: m.week_id, title: m.title, type: m.type, homework: m.is_homework },
        { day: day.id, week: null, title: 'Конспект урока', type: 'pdf', homework: false }
    );
    // Same folder layout as the editor; Cyrillic transliterated (Storage rejects it).
    assert.match(objects()[0], new RegExp(`^days/${day.id}/konspekt-uroka-[0-9a-f]{10}\\.pdf$`));
    const got = await fetch(m.url);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'application/pdf');
    assert.equal(await got.text(), fs.readFileSync(file, 'utf8'));
});

test('with a private bucket the upload is checked through a signed link; the stored URL is portal-only', async () => {
    fake.buckets.get('course-content').public = false;
    const r = await run([...lesson('--file', pdf('lesson.pdf', 'private')), ...newWeekAndDay]);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /doesn't open/);
    assert.doesNotMatch(r.out, /public bucket/);
    assert.match(r.out, /private bucket: opens only through the portal/);
    assert.equal((await fetch(fake.db.materials[0].url)).status, 400);
});

test('--dry-run shows the plan and writes nothing', async () => {
    const r = await run([...lesson('--file', pdf('lesson.pdf', 'v1'), '--dry-run'), ...newWeekAndDay]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /NEW «Модуль 1\. Увидеть» \(opens 2026-11-09\)/);
    assert.match(r.out, /add «Конспект урока»/);
    assert.match(r.out, /dry run — nothing written/);
    assert.equal(fake.db.weeks.length + fake.db.days.length + fake.db.materials.length + objects().length, 0);
});

test('re-running the same command changes nothing; a new file replaces the old one in place', async () => {
    const v1 = pdf('lesson.pdf', 'version 1');
    assert.equal((await run([...lesson('--file', v1), ...newWeekAndDay])).code, 0);
    const [first] = fake.db.materials;
    const firstUrl = first.url;

    const again = await run(lesson('--file', v1));
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /already this file — nothing to do/);
    assert.equal(fake.db.materials.length, 1);
    assert.equal(fake.db.materials[0].url, firstUrl);
    assert.equal(objects().length, 1);

    const v2 = pdf('lesson-v2.pdf', 'version 2');
    const replaced = await run(lesson('--file', v2));
    assert.equal(replaced.code, 0, replaced.out);
    assert.equal(fake.db.materials.length, 1, 'still one material');
    assert.equal(fake.db.materials[0].id, first.id, 'same row');
    assert.notEqual(fake.db.materials[0].url, firstUrl, 'new URL, so no stale cached copy');
    assert.equal(objects().length, 1, 'old file deleted');
    assert.equal(await (await fetch(fake.db.materials[0].url)).text(), fs.readFileSync(v2, 'utf8'));
    assert.equal((await fetch(firstUrl)).ok, false);
});

test('a file uploaded in the editor under the same title is replaced, and its old file removed', async () => {
    const week = { id: crypto.randomUUID(), course_id: COURSE.id, title: 'Модуль 1', order_index: 1 };
    const day = { id: crypto.randomUUID(), week_id: week.id, title: 'Урок 2', order_index: 2 };
    fake.seed('weeks', [week]);
    fake.seed('days', [day]);
    const oldKey = `days/${day.id}/k3j2h1_1730000000000.pdf`; // FileUploader's random name
    fake.buckets.get('course-content').objects.set(oldKey, { id: 'x', bytes: Buffer.from('%PDF old'), contentType: 'application/pdf' });
    fake.seed('materials', [{ day_id: day.id, title: 'Конспект урока', type: 'pdf', url: `${fakeUrl}/storage/v1/object/public/course-content/${oldKey}` }]);

    const r = await run(lesson('--file', pdf('new.pdf', 'from the CLI')));
    assert.equal(r.code, 0, r.out);
    assert.equal(fake.db.materials.length, 1);
    assert.ok(!objects().includes(oldKey));
    assert.equal(objects().length, 1);
});

test('a file another material still points at is kept', async () => {
    const v1 = pdf('lesson.pdf', 'shared');
    assert.equal((await run([...lesson('--file', v1), ...newWeekAndDay])).code, 0);
    const [m] = fake.db.materials;
    fake.seed('materials', [{ day_id: m.day_id, title: 'Копия', type: 'pdf', url: m.url }]);

    const r = await run(lesson('--file', pdf('lesson-v2.pdf', 'other')));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /kept .* another material still uses it/);
    assert.equal(objects().length, 2);
});

test('without --day the file becomes a week material', async () => {
    const r = await run(['--course', COURSE.slug, '--week', '1', '--week-title', 'Модуль 1', '--title', 'Рабочая тетрадь', '--file', pdf('book.pdf', 'w')]);
    assert.equal(r.code, 0, r.out);
    const [m] = fake.db.materials;
    assert.equal(m.week_id, fake.db.weeks[0].id);
    assert.equal(m.day_id, null);
    assert.match(objects()[0], new RegExp(`^weeks/${fake.db.weeks[0].id}/rabochaya-tetrad-`));
});

test('--homework lists the file under the lesson homework', async () => {
    const r = await run([...lesson('--file', pdf('hw.pdf', 'hw'), '--homework'), ...newWeekAndDay]);
    assert.equal(r.code, 0, r.out);
    assert.equal(fake.db.materials[0].is_homework, true);
});

test('a missing week or lesson is never invented without a title', async () => {
    const noWeek = await run(lesson('--file', pdf('a.pdf', 'a')));
    assert.equal(noWeek.code, 1);
    assert.match(noWeek.out, /has no week 1 \(weeks: none yet\)\. To create it, add --week-title/);

    fake.seed('weeks', [{ course_id: COURSE.id, title: 'Модуль 1', order_index: 1 }]);
    const noDay = await run(lesson('--file', pdf('a.pdf', 'a')));
    assert.equal(noDay.code, 1);
    assert.match(noDay.out, /Week 1 has no lesson 2 \(lessons: none yet\)\. To create it, add --day-title/);
    assert.equal(fake.db.days.length + fake.db.materials.length + objects().length, 0);
});

test('unknown course, ambiguous numbers and duplicate titles stop before writing', async () => {
    const course = await run(['--course', 'vastu-desing-2026', '--week', '1', '--title', 'x', '--file', pdf('a.pdf', 'a')]);
    assert.equal(course.code, 1);
    assert.match(course.out, /No course "vastu-desing-2026"\. Courses: .*vastu-design-2026/);

    fake.seed('weeks', [
        { course_id: COURSE.id, title: 'A', order_index: 1 },
        { course_id: COURSE.id, title: 'B', order_index: 1 },
    ]);
    const twoWeeks = await run(['--course', COURSE.slug, '--week', '1', '--title', 'x', '--file', pdf('a.pdf', 'a')]);
    assert.equal(twoWeeks.code, 1);
    assert.match(twoWeeks.out, /Week 1 is ambiguous/);

    fake.db.weeks.length = 0;
    const week = { id: crypto.randomUUID(), course_id: COURSE.id, title: 'A', order_index: 1 };
    fake.seed('weeks', [week]);
    fake.seed('materials', [
        { week_id: week.id, title: 'x', type: 'pdf', url: 'https://example.com/1.pdf' },
        { week_id: week.id, title: 'x', type: 'pdf', url: 'https://example.com/2.pdf' },
    ]);
    const twoTitles = await run(['--course', COURSE.slug, '--week', '1', '--title', 'x', '--file', pdf('a.pdf', 'a')]);
    assert.equal(twoTitles.code, 1);
    assert.match(twoTitles.out, /2 materials titled «x» already sit on week 1/);
    assert.equal(objects().length, 0);
});

test('a file over the bucket limit is refused before anything is created', async () => {
    fake.buckets.get('course-content').file_size_limit = 10;
    const r = await run([...lesson('--file', pdf('big.pdf', 'more than ten bytes')), ...newWeekAndDay]);
    assert.equal(r.code, 1);
    assert.match(r.out, /takes at most/);
    assert.equal(fake.db.weeks.length + objects().length, 0);
});

test('--remove deletes the material and its file; a second --remove is a no-op', async () => {
    assert.equal((await run([...lesson('--file', pdf('lesson.pdf', 'x')), ...newWeekAndDay])).code, 0);
    const removed = await run(lesson('--remove'));
    assert.equal(removed.code, 0, removed.out);
    assert.equal(fake.db.materials.length, 0);
    assert.equal(objects().length, 0);
    assert.equal(fake.db.days.length, 1, 'the lesson itself stays');

    const again = await run(lesson('--remove'));
    assert.equal(again.code, 0);
    assert.match(again.out, /nothing to remove/);
});

test('refuses the public anon key and bad arguments', async () => {
    const anon = await run(lesson('--file', pdf('a.pdf', 'a')), jwt('anon'));
    assert.equal(anon.code, 2);
    assert.match(anon.out, /not a service-role key/);

    const bad = await run(['--course', COURSE.slug, '--week', 'one', '--title', 'x', '--file', 'a.pdf']);
    assert.equal(bad.code, 2);
    assert.match(bad.out, /--week must be a whole number/);
    assert.equal(fake.db.weeks.length + objects().length, 0);
});
