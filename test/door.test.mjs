// The Russian door (src/lib/door.ts, loaded straight into Node, which strips the types).

import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseUrl, doorFileLink, onDoor } from '../src/lib/door.ts';
import { buildWelcomeEmail } from '../fulfilment.js';

const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const DOOR = 'https://sb.annaromeovastu.com';
const FILE = '/storage/v1/object/public/course-content/week-1/urok.pdf';

test('only the Moscow addresses count as the door', () => {
    assert.equal(onDoor('lk-ru.annaromeovastu.com'), true);
    assert.equal(onDoor('lk.annaromeovastu.com'), false);
    assert.equal(onDoor('vastu-portal-app.onrender.com'), false);
    assert.equal(onDoor('localhost'), false);
    assert.equal(onDoor('annaromeovastu.com.evil.example'), false);
});

test('the database goes through the door only for visitors on the door', () => {
    assert.equal(databaseUrl(SUPABASE, 'lk-ru.annaromeovastu.com'), DOOR);
    assert.equal(databaseUrl(SUPABASE, 'lk.annaromeovastu.com'), SUPABASE);
    assert.equal(databaseUrl(SUPABASE, 'vastu-portal-app.onrender.com'), SUPABASE);
});

test('a lesson presentation goes through the door only for visitors on the door', () => {
    const LK = 'lk-ru.annaromeovastu.com';
    assert.equal(doorFileLink('https://urok4-1.lovable.app/', SUPABASE, LK), 'https://urok4-1-ru.annaromeovastu.com/');
    assert.equal(doorFileLink('https://sever.lovable.app', SUPABASE, LK), 'https://sever-ru.annaromeovastu.com');
    assert.equal(doorFileLink('https://urokdva.lovable.app/slide/3?x=1', SUPABASE, LK), 'https://urokdva-ru.annaromeovastu.com/slide/3?x=1');
    assert.equal(doorFileLink('https://urokdva.lovable.app/', SUPABASE, 'vastu-portal-app.onrender.com'), 'https://urokdva.lovable.app/');
    assert.equal(doorFileLink('https://urok4-1.lovable.app/', SUPABASE, 'lk.annaromeovastu.com'), 'https://urok4-1.annaromeovastu.com/');
    // Not ours, or no door for it yet: left alone rather than turned into a dead link.
    assert.equal(doorFileLink('https://someone-else.lovable.app/', SUPABASE, LK), 'https://someone-else.lovable.app/');
    assert.equal(doorFileLink('https://urokdva.lovable.app.evil.example/', SUPABASE, LK), 'https://urokdva.lovable.app.evil.example/');
    assert.equal(doorFileLink('https://nativastu.com/', SUPABASE, LK), 'https://nativastu.com/');
});

test('a stored file link becomes the one this visitor can reach, whichever way it was saved', () => {
    assert.equal(doorFileLink(SUPABASE + FILE, SUPABASE, 'lk-ru.annaromeovastu.com'), DOOR + FILE);
    assert.equal(doorFileLink(DOOR + FILE, SUPABASE, 'lk.annaromeovastu.com'), SUPABASE + FILE);
    assert.equal(doorFileLink(DOOR + FILE, SUPABASE, 'vastu-portal-app.onrender.com'), SUPABASE + FILE);
    assert.equal(doorFileLink(SUPABASE + FILE, SUPABASE, 'vastu-portal-app.onrender.com'), SUPABASE + FILE);
    assert.equal(doorFileLink(DOOR + FILE, SUPABASE, 'lk-ru.annaromeovastu.com'), DOOR + FILE);
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


import { doorHtmlLinks } from '../src/lib/door.ts';

test("Anna's Render sites become their public addresses on annaromeovastu.com for every visitor", () => {
    for (const host of ['lk-ru.annaromeovastu.com', 'lk.annaromeovastu.com', 'vastu-portal-app.onrender.com', 'localhost']) {
        assert.equal(
            doorFileLink('https://annaromeo-vastu-karta.onrender.com/', SUPABASE, host),
            'https://karta.annaromeovastu.com/',
        );
        assert.equal(
            doorFileLink('https://annaromeo-vastu-karta.onrender.com', SUPABASE, host),
            'https://karta.annaromeovastu.com',
        );
        assert.equal(
            doorFileLink('https://annaromeo-vastu-karta.onrender.com/map/2?north=15&grid=9#zones', SUPABASE, host),
            'https://karta.annaromeovastu.com/map/2?north=15&grid=9#zones',
        );
        assert.equal(
            doorFileLink('https://annaromeo-vastu-karta.onrender.com?x=1#top', SUPABASE, host),
            'https://karta.annaromeovastu.com?x=1#top',
        );
        assert.equal(
            doorFileLink('https://annaromeo-vastu-course.onrender.com/mk/?utm=1#buy', SUPABASE, host),
            'https://kurs.annaromeovastu.com/mk/?utm=1#buy',
        );
        assert.equal(
            doorFileLink('https://annaromeo-venus.onrender.com/', SUPABASE, host),
            'https://venus.annaromeovastu.com/',
        );
        assert.equal(
            doorFileLink('https://annaromeo-vastu-color-test.onrender.com/result?c=gold', SUPABASE, host),
            'https://test.annaromeovastu.com/result?c=gold',
        );
        assert.equal(
            doorFileLink('https://vastu-business-landing.onrender.com/#tariffs', SUPABASE, host),
            'https://biz.annaromeovastu.com/#tariffs',
        );
        assert.equal(
            doorFileLink('https://annaromeo-vastu.onrender.com/about', SUPABASE, host),
            'https://annaromeovastu.com/about',
        );
        // The platform's own Render address is never rewritten.
        assert.equal(
            doorFileLink('https://vastu-portal-app.onrender.com/', SUPABASE, host),
            'https://vastu-portal-app.onrender.com/',
        );
        assert.equal(
            doorFileLink('https://vastu-portal-app.onrender.com/access?t=abc#1', SUPABASE, host),
            'https://vastu-portal-app.onrender.com/access?t=abc#1',
        );
        // Foreign or spoofed addresses are left alone.
        assert.equal(
            doorFileLink('https://someone-else.onrender.com/', SUPABASE, host),
            'https://someone-else.onrender.com/',
        );
        assert.equal(
            doorFileLink('https://annaromeo-vastu-karta.onrender.com.evil.example/', SUPABASE, host),
            'https://annaromeo-vastu-karta.onrender.com.evil.example/',
        );
    }
    // Works even when no database URL is configured, while lovable and storage behave as before.
    assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com/', '', 'localhost'), 'https://karta.annaromeovastu.com/');
    assert.equal(doorFileLink('https://urok4-1.lovable.app/', SUPABASE, 'lk-ru.annaromeovastu.com'), 'https://urok4-1-ru.annaromeovastu.com/');
    assert.equal(doorFileLink('https://urok4-1.lovable.app/', SUPABASE, 'vastu-portal-app.onrender.com'), 'https://urok4-1.lovable.app/');
    assert.equal(doorFileLink(SUPABASE + FILE, SUPABASE, 'lk-ru.annaromeovastu.com'), DOOR + FILE);
    assert.equal(doorFileLink(DOOR + FILE, SUPABASE, 'lk.annaromeovastu.com'), SUPABASE + FILE);
});

test('links in lesson and homework HTML descriptions go through doorFileLink too', () => {
    const html = [
        '<p>Откройте <a href="https://annaromeo-vastu-karta.onrender.com/plan?a=1&amp;b=2#grid" rel="noopener noreferrer" target="_blank">Конструктор Васту-карт</a>.</p>',
        '<p>Прямая ссылка: <a href="https://annaromeo-vastu-karta.onrender.com/">https://annaromeo-vastu-karta.onrender.com/</a></p>',
        `<p>Презентация: <a href='https://urokdva.lovable.app/slide/2'>слайд</a> и файл <a href="${SUPABASE}${FILE}">PDF</a></p>`,
        '<p>Платформа <a href="https://vastu-portal-app.onrender.com/login">вход</a> и <a href="https://t.me/tymuron">Telegram</a>.</p>',
    ].join('\n');

    const onMoscow = doorHtmlLinks(html, SUPABASE, 'lk-ru.annaromeovastu.com');
    assert.ok(onMoscow.includes('href="https://karta.annaromeovastu.com/plan?a=1&amp;b=2#grid"'));
    assert.ok(onMoscow.includes('<a href="https://karta.annaromeovastu.com/">https://karta.annaromeovastu.com/</a>'));
    assert.ok(onMoscow.includes("href='https://urokdva-ru.annaromeovastu.com/slide/2'"));
    assert.ok(onMoscow.includes(`href="${DOOR}${FILE}"`));
    assert.ok(onMoscow.includes('href="https://vastu-portal-app.onrender.com/login"'));
    assert.ok(onMoscow.includes('href="https://t.me/tymuron"'));

    const onRender = doorHtmlLinks(html, SUPABASE, 'vastu-portal-app.onrender.com');
    assert.ok(onRender.includes('href="https://karta.annaromeovastu.com/plan?a=1&amp;b=2#grid"'));
    assert.ok(onRender.includes("href='https://urokdva.lovable.app/slide/2'"));
    assert.ok(onRender.includes(`href="${SUPABASE}${FILE}"`));
    assert.equal(doorHtmlLinks('', SUPABASE, 'lk-ru.annaromeovastu.com'), '');
});
