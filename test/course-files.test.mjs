// src/lib/courseFiles.ts against the fake Supabase with course-content
// private: what a student, a teacher, a lapsed student and a visitor get
// when the lesson pages ask for file links. Imports the TypeScript module
// directly (Node ≥ 23.6 strips the types). Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createFakeServices } from './fake-services.mjs';
import { courseFileKey, signCourseFile, signCourseFiles } from '../src/lib/courseFiles.ts';

const jwt = (role) => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.');
const id = {
    course: crypto.randomUUID(), other: crypto.randomUUID(),
    week: crypto.randomUUID(), otherWeek: crypto.randomUUID(), day: crypto.randomUUID(),
};
const key = {
    lesson: `days/${id.day}/konspekt-uroka-1-0123456789.pdf`,
    week: `weeks/${id.week}/rabochaya-tetrad-0123456789.pdf`,
    other: `weeks/${id.otherWeek}/chuzhoy-fayl-0123456789.pdf`,
};
const DRIVE = 'https://drive.google.com/file/d/abc/view';
let fake, base;
const fileUrl = (k) => `${base}/storage/v1/object/public/course-content/${k}`;

test.before(async () => {
    fake = createFakeServices();
    base = `http://127.0.0.1:${await fake.listen()}`;
    fake.seed('courses', [
        { id: id.course, slug: 'vastu-design-2026', title: 'Васту-дизайн' },
        { id: id.other, slug: 'other-course', title: 'Другой курс' },
    ]);
    fake.seed('weeks', [
        { id: id.week, course_id: id.course, title: 'Модуль 1', order_index: 1 },
        { id: id.otherWeek, course_id: id.other, title: 'Чужой модуль', order_index: 1 },
    ]);
    fake.seed('days', [{ id: id.day, week_id: id.week, title: 'Урок 1', order_index: 1 }]);
    const bucket = fake.buckets.get('course-content');
    bucket.public = false;
    for (const k of Object.values(key)) bucket.objects.set(k, { id: k, bytes: Buffer.from(`%PDF ${k}`), contentType: 'application/pdf' });

    const student = fake.createUser('student@example.com', { password: 'student-pass' });
    const lapsed = fake.createUser('lapsed@example.com', { password: 'lapsed-pass' });
    const teacher = fake.createUser('teacher@example.com', { password: 'teacher-pass' });
    fake.db.profiles.find((p) => p.id === teacher.id).role = 'teacher';
    fake.seed('user_entitlements', [
        { user_id: student.id, course_id: id.course, expires_at: '2099-05-09T00:00:00Z' },
        { user_id: lapsed.id, course_id: id.course, expires_at: '2020-01-01T00:00:00Z' },
    ]);
});
test.after(() => fake.close());

async function clientAs(email, password) {
    const client = createClient(base, jwt('anon'), { auth: { persistSession: false, autoRefreshToken: false } });
    if (email) {
        const { error } = await client.auth.signInWithPassword({ email, password });
        assert.ifError(error);
    }
    return client;
}

test('courseFileKey finds the object key only in links to this project\'s course-content', () => {
    assert.equal(courseFileKey(fileUrl(key.lesson), base), key.lesson);
    assert.equal(courseFileKey(`${fileUrl(key.lesson)}?download=1`, base), key.lesson);
    assert.equal(courseFileKey(`${base}/storage/v1/object/public/course-content/days/x/%D0%BA.pdf`, base), 'days/x/к.pdf');
    assert.equal(courseFileKey(fileUrl(key.lesson), 'https://another-project.supabase.co'), null);
    assert.equal(courseFileKey(`${base}/storage/v1/object/public/library_files/a.pdf`, base), null);
    assert.equal(courseFileKey(DRIVE, base), null);
    assert.equal(courseFileKey('', base), null);
    assert.equal(courseFileKey(undefined, base), null);
});

test('a student gets working links for their course; other files, outside links and the bare URL behave', async () => {
    const student = await clientAs('student@example.com', 'student-pass');
    const links = await signCourseFiles(student, [fileUrl(key.lesson), fileUrl(key.week), fileUrl(key.other), DRIVE], base);

    for (const k of [key.lesson, key.week]) {
        const signed = links.get(fileUrl(k));
        assert.match(signed, /\/storage\/v1\/object\/sign\/course-content\/.+\?token=/);
        const got = await fetch(signed);
        assert.equal(got.status, 200);
        assert.equal(got.headers.get('content-type'), 'application/pdf');
        assert.equal(await got.text(), `%PDF ${k}`);
    }
    assert.equal(links.get(fileUrl(key.other)), null, "another course's file is refused");
    assert.equal(links.get(DRIVE), DRIVE, 'outside links pass through');
    assert.equal((await fetch(fileUrl(key.lesson))).status, 400, 'the public URL no longer opens');
});

test('a teacher can open every course file', async () => {
    const teacher = await clientAs('teacher@example.com', 'teacher-pass');
    const links = await signCourseFiles(teacher, [fileUrl(key.lesson), fileUrl(key.other)], base);
    assert.ok(links.get(fileUrl(key.lesson)));
    assert.ok(links.get(fileUrl(key.other)));
});

test('nobody else gets a link: a visitor, or a student whose access has ended', async () => {
    for (const client of [await clientAs(), await clientAs('lapsed@example.com', 'lapsed-pass')]) {
        const links = await signCourseFiles(client, [fileUrl(key.lesson), fileUrl(key.week)], base);
        assert.equal(links.get(fileUrl(key.lesson)), null);
        assert.equal(links.get(fileUrl(key.week)), null);
        assert.equal(await signCourseFile(client, fileUrl(key.lesson), base), null);
    }
});

test('the download button gets a fresh link, refused files give null, outside links pass through', async () => {
    const student = await clientAs('student@example.com', 'student-pass');
    const fresh = await signCourseFile(student, fileUrl(key.lesson), base);
    assert.equal((await fetch(fresh)).status, 200);
    assert.equal(await signCourseFile(student, fileUrl(key.other), base), null);
    assert.equal(await signCourseFile(student, DRIVE, base), DRIVE);
});

test('a signed link stops working when it expires', async () => {
    const student = await clientAs('student@example.com', 'student-pass');
    const links = await signCourseFiles(student, [fileUrl(key.lesson)], base, 1);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal((await fetch(links.get(fileUrl(key.lesson)))).status, 400);
});
