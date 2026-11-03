// The Russian door (src/lib/door.ts, loaded straight into Node, which strips the types).

import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseUrl, doorFileLink, onDoor } from '../src/lib/door.ts';
import { buildWelcomeEmail } from '../fulfilment.js';

const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const DOOR = 'https://sb.annaromeovastu.com';
const FILE = '/storage/v1/object/public/course-content/week-1/urok.pdf';

test('only our own subdomains count as the door', () => {
    assert.equal(onDoor('lk.annaromeovastu.com'), true);
    assert.equal(onDoor('vastu-portal-app.onrender.com'), false);
    assert.equal(onDoor('localhost'), false);
    assert.equal(onDoor('annaromeovastu.com.evil.example'), false);
});

test('the database goes through the door only for visitors on the door', () => {
    assert.equal(databaseUrl(SUPABASE, 'lk.annaromeovastu.com'), DOOR);
    assert.equal(databaseUrl(SUPABASE, 'vastu-portal-app.onrender.com'), SUPABASE);
});

test('a stored file link becomes the one this visitor can reach, whichever way it was saved', () => {
    assert.equal(doorFileLink(SUPABASE + FILE, SUPABASE, 'lk.annaromeovastu.com'), DOOR + FILE);
    assert.equal(doorFileLink(DOOR + FILE, SUPABASE, 'vastu-portal-app.onrender.com'), SUPABASE + FILE);
    assert.equal(doorFileLink(SUPABASE + FILE, SUPABASE, 'vastu-portal-app.onrender.com'), SUPABASE + FILE);
    assert.equal(doorFileLink(DOOR + FILE, SUPABASE, 'lk.annaromeovastu.com'), DOOR + FILE);
});

test('anything that is not one of our file links is left alone', () => {
    const other = 'https://disk.yandex.ru/d/abc';
    assert.equal(doorFileLink(other, SUPABASE, 'lk.annaromeovastu.com'), other);
    assert.equal(doorFileLink(`${SUPABASE}.evil.example/x`, SUPABASE, 'lk.annaromeovastu.com'), `${SUPABASE}.evil.example/x`);
    assert.equal(doorFileLink('', SUPABASE, 'lk.annaromeovastu.com'), '');
});

test('the welcome email carries the spare link only when there is one', () => {
    const base = { email: 'a@example.com', courses: [], accessUrl: 'https://lk.annaromeovastu.com/access?t=x', loginUrl: 'https://lk.annaromeovastu.com/login', returning: false };
    const spare = 'https://vastu-portal-app.onrender.com/access?t=x';
    const withSpare = buildWelcomeEmail({ ...base, spareUrl: spare });
    assert.ok(withSpare.html.includes(spare));
    assert.ok(withSpare.text.includes(spare));
    const without = buildWelcomeEmail(base);
    assert.ok(!without.html.includes('Запасная ссылка'));
    assert.ok(!without.text.includes('Запасная ссылка'));
});
