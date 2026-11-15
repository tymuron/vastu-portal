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


import { doorHtmlLinks, doorSrcLink, doorTextLinks } from '../src/lib/door.ts';

test("Anna's sites get Moscow -ru addresses on the Moscow door and public addresses on lk and onrender", () => {
    const MOSCOW = 'lk-ru.annaromeovastu.com';
    const PUBLIC_HOSTS = ['lk.annaromeovastu.com', 'vastu-portal-app.onrender.com', 'localhost'];

    // 1. Visitor on the Moscow door (onDoor === true): all six Render sites -> -ru addresses.
    assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com/', SUPABASE, MOSCOW), 'https://karta-ru.annaromeovastu.com/');
    assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com', SUPABASE, MOSCOW), 'https://karta-ru.annaromeovastu.com');
    assert.equal(
        doorFileLink('https://annaromeo-vastu-karta.onrender.com/map/2?north=15&grid=9#zones', SUPABASE, MOSCOW),
        'https://karta-ru.annaromeovastu.com/map/2?north=15&grid=9#zones',
    );
    assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com?x=1#top', SUPABASE, MOSCOW), 'https://karta-ru.annaromeovastu.com?x=1#top');
    assert.equal(doorFileLink('https://annaromeo-vastu-course.onrender.com/mk/?utm=1#buy', SUPABASE, MOSCOW), 'https://kurs-ru.annaromeovastu.com/mk/?utm=1#buy');
    assert.equal(doorFileLink('https://annaromeo-venus.onrender.com/', SUPABASE, MOSCOW), 'https://venus-ru.annaromeovastu.com/');
    assert.equal(doorFileLink('https://annaromeo-vastu-color-test.onrender.com/result?c=gold', SUPABASE, MOSCOW), 'https://test-ru.annaromeovastu.com/result?c=gold');
    assert.equal(doorFileLink('https://vastu-business-landing.onrender.com/#tariffs', SUPABASE, MOSCOW), 'https://biz-ru.annaromeovastu.com/#tariffs');
    assert.equal(doorFileLink('https://annaromeo-vastu.onrender.com/about', SUPABASE, MOSCOW), 'https://www-ru.annaromeovastu.com/about');

    // Links already stored as public addresses also become -ru on the Moscow door.
    assert.equal(doorFileLink('https://karta.annaromeovastu.com/plan?a=1#z', SUPABASE, MOSCOW), 'https://karta-ru.annaromeovastu.com/plan?a=1#z');
    assert.equal(doorFileLink('https://kurs.annaromeovastu.com/mk/', SUPABASE, MOSCOW), 'https://kurs-ru.annaromeovastu.com/mk/');
    assert.equal(doorFileLink('https://venus.annaromeovastu.com/', SUPABASE, MOSCOW), 'https://venus-ru.annaromeovastu.com/');
    assert.equal(doorFileLink('https://test.annaromeovastu.com/result', SUPABASE, MOSCOW), 'https://test-ru.annaromeovastu.com/result');
    assert.equal(doorFileLink('https://biz.annaromeovastu.com/#tariffs', SUPABASE, MOSCOW), 'https://biz-ru.annaromeovastu.com/#tariffs');
    assert.equal(doorFileLink('https://annaromeovastu.com/about', SUPABASE, MOSCOW), 'https://www-ru.annaromeovastu.com/about');
    assert.equal(doorFileLink('https://www.annaromeovastu.com/about', SUPABASE, MOSCOW), 'https://www-ru.annaromeovastu.com/about');

    // 2. Visitors on lk.annaromeovastu.com and vastu-portal-app.onrender.com: public addresses.
    for (const host of PUBLIC_HOSTS) {
        assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com/', SUPABASE, host), 'https://karta.annaromeovastu.com/');
        assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com', SUPABASE, host), 'https://karta.annaromeovastu.com');
        assert.equal(
            doorFileLink('https://annaromeo-vastu-karta.onrender.com/map/2?north=15&grid=9#zones', SUPABASE, host),
            'https://karta.annaromeovastu.com/map/2?north=15&grid=9#zones',
        );
        assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com?x=1#top', SUPABASE, host), 'https://karta.annaromeovastu.com?x=1#top');
        assert.equal(doorFileLink('https://annaromeo-vastu-course.onrender.com/mk/?utm=1#buy', SUPABASE, host), 'https://kurs.annaromeovastu.com/mk/?utm=1#buy');
        assert.equal(doorFileLink('https://annaromeo-venus.onrender.com/', SUPABASE, host), 'https://venus.annaromeovastu.com/');
        assert.equal(doorFileLink('https://annaromeo-vastu-color-test.onrender.com/result?c=gold', SUPABASE, host), 'https://test.annaromeovastu.com/result?c=gold');
        assert.equal(doorFileLink('https://vastu-business-landing.onrender.com/#tariffs', SUPABASE, host), 'https://biz.annaromeovastu.com/#tariffs');
        assert.equal(doorFileLink('https://annaromeo-vastu.onrender.com/about', SUPABASE, host), 'https://annaromeovastu.com/about');

        // Public addresses stay public outside the Moscow door.
        assert.equal(doorFileLink('https://karta.annaromeovastu.com/plan', SUPABASE, host), 'https://karta.annaromeovastu.com/plan');
        assert.equal(doorFileLink('https://annaromeovastu.com/about', SUPABASE, host), 'https://annaromeovastu.com/about');
    }

    // 3. Bare host/path and //host links to Anna's sites are rewritten too.
    assert.equal(doorFileLink('annaromeo-vastu-karta.onrender.com/plan?a=1', SUPABASE, MOSCOW), 'https://karta-ru.annaromeovastu.com/plan?a=1');
    assert.equal(doorFileLink('//annaromeo-vastu-karta.onrender.com/plan?a=1', SUPABASE, MOSCOW), 'https://karta-ru.annaromeovastu.com/plan?a=1');
    assert.equal(doorFileLink('annaromeo-vastu-karta.onrender.com', SUPABASE, 'lk.annaromeovastu.com'), 'https://karta.annaromeovastu.com');
    assert.equal(doorFileLink('//annaromeo-vastu.onrender.com/about', SUPABASE, 'vastu-portal-app.onrender.com'), 'https://annaromeovastu.com/about');

    // 4. Platform and foreign/spoofed addresses are never rewritten on any host.
    for (const host of [MOSCOW, ...PUBLIC_HOSTS]) {
        assert.equal(doorFileLink('https://vastu-portal-app.onrender.com/', SUPABASE, host), 'https://vastu-portal-app.onrender.com/');
        assert.equal(doorFileLink('https://vastu-portal-app.onrender.com/access?t=abc#1', SUPABASE, host), 'https://vastu-portal-app.onrender.com/access?t=abc#1');
        assert.equal(doorFileLink('https://lk.annaromeovastu.com/login', SUPABASE, host), 'https://lk.annaromeovastu.com/login');
        assert.equal(doorFileLink('https://someone-else.onrender.com/', SUPABASE, host), 'https://someone-else.onrender.com/');
        assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com.evil.example/', SUPABASE, host), 'https://annaromeo-vastu-karta.onrender.com.evil.example/');
        assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com@evil.example/', SUPABASE, host), 'https://annaromeo-vastu-karta.onrender.com@evil.example/');
    }

    // Works even when no database URL is configured, while lovable and storage behave as before.
    assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com/', '', MOSCOW), 'https://karta-ru.annaromeovastu.com/');
    assert.equal(doorFileLink('https://annaromeo-vastu-karta.onrender.com/', '', 'lk.annaromeovastu.com'), 'https://karta.annaromeovastu.com/');
    assert.equal(doorFileLink('https://urok4-1.lovable.app/', SUPABASE, MOSCOW), 'https://urok4-1-ru.annaromeovastu.com/');
    assert.equal(doorFileLink('https://urok4-1.lovable.app/', SUPABASE, 'lk.annaromeovastu.com'), 'https://urok4-1.annaromeovastu.com/');
    assert.equal(doorFileLink('https://urok4-1.lovable.app/', SUPABASE, 'vastu-portal-app.onrender.com'), 'https://urok4-1.lovable.app/');
    assert.equal(doorFileLink(SUPABASE + FILE, SUPABASE, MOSCOW), DOOR + FILE);
    assert.equal(doorFileLink(DOOR + FILE, SUPABASE, 'lk.annaromeovastu.com'), SUPABASE + FILE);
});

test("src attributes on Anna's sites rewrite to -ru only on the Moscow door and stay untouched elsewhere", () => {
    const imgRender = 'https://annaromeo-vastu-karta.onrender.com/assets/grid.png';
    const imgPublic = 'https://karta.annaromeovastu.com/assets/grid.png';
    const frameMain = 'https://annaromeo-vastu.onrender.com/embed?v=1';

    assert.equal(doorSrcLink(imgRender, SUPABASE, 'lk-ru.annaromeovastu.com'), 'https://karta-ru.annaromeovastu.com/assets/grid.png');
    assert.equal(doorSrcLink(imgPublic, SUPABASE, 'lk-ru.annaromeovastu.com'), 'https://karta-ru.annaromeovastu.com/assets/grid.png');
    assert.equal(doorSrcLink(frameMain, SUPABASE, 'lk-ru.annaromeovastu.com'), 'https://www-ru.annaromeovastu.com/embed?v=1');
    assert.equal(doorSrcLink(SUPABASE + FILE, SUPABASE, 'lk-ru.annaromeovastu.com'), DOOR + FILE);

    for (const host of ['lk.annaromeovastu.com', 'vastu-portal-app.onrender.com']) {
        assert.equal(doorSrcLink(imgRender, SUPABASE, host), imgRender);
        assert.equal(doorSrcLink(imgPublic, SUPABASE, host), imgPublic);
        assert.equal(doorSrcLink(frameMain, SUPABASE, host), frameMain);
        assert.equal(doorSrcLink('//annaromeo-vastu-karta.onrender.com/assets/grid.png', SUPABASE, host), '//annaromeo-vastu-karta.onrender.com/assets/grid.png');
        assert.equal(doorSrcLink(DOOR + FILE, SUPABASE, host), SUPABASE + FILE);
    }
});

test('HTML and plain text rewrite href, visible link text (with or without scheme or formatting tags), bare text and src across all three portal hosts', () => {
    const html = [
        // Exact lesson 2 shape: bare host in visible link text.
        '<p>Конструктор: <a href="https://annaromeo-vastu-karta.onrender.com/" rel="noopener noreferrer" target="_blank">annaromeo-vastu-karta.onrender.com</a></p>',
        // Formatted inside <strong>, <em>, <u>, <s>, with and without scheme.
        '<p><a href="https://annaromeo-vastu-course.onrender.com/mk"><strong>annaromeo-vastu-course.onrender.com/mk</strong></a></p>',
        '<p><a href="https://annaromeo-venus.onrender.com/"><em><u><s>https://annaromeo-venus.onrender.com/</s></u></em></a></p>',
        // Bare href and //host href (point 4), and plain text without a link.
        '<p>Без схемы: <a href="annaromeo-vastu-color-test.onrender.com/quiz?a=1&amp;b=2">тест</a> и <a href="//vastu-business-landing.onrender.com/#top">бизнес</a>.</p>',
        '<p>Просто текст: зайдите на annaromeo-vastu.onrender.com или https://karta.annaromeovastu.com/map.</p>',
        // Embedded image and iframe src (point 3).
        '<p><img src="https://annaromeo-vastu-karta.onrender.com/grid.png" alt="map"><iframe src="https://annaromeo-vastu.onrender.com/video"></iframe></p>',
        // Lovable, storage, platform, foreign sites and email.
        `<p>Презентация: <a href='https://urokdva.lovable.app/slide/2'>слайд</a> и файл <a href="${SUPABASE}${FILE}">PDF</a></p>`,
        '<p>Платформа <a href="https://vastu-portal-app.onrender.com/login">vastu-portal-app.onrender.com</a>, чужой someone-else.onrender.com и почта hello@annaromeovastu.com.</p>',
    ].join('\n');

    const onMoscow = doorHtmlLinks(html, SUPABASE, 'lk-ru.annaromeovastu.com');
    assert.ok(onMoscow.includes('<a href="https://karta-ru.annaromeovastu.com/" rel="noopener noreferrer" target="_blank">karta-ru.annaromeovastu.com</a>'));
    assert.ok(onMoscow.includes('<a href="https://kurs-ru.annaromeovastu.com/mk"><strong>kurs-ru.annaromeovastu.com/mk</strong></a>'));
    assert.ok(onMoscow.includes('<a href="https://venus-ru.annaromeovastu.com/"><em><u><s>https://venus-ru.annaromeovastu.com/</s></u></em></a>'));
    assert.ok(onMoscow.includes('href="https://test-ru.annaromeovastu.com/quiz?a=1&amp;b=2"'));
    assert.ok(onMoscow.includes('href="https://biz-ru.annaromeovastu.com/#top"'));
    assert.ok(onMoscow.includes('Просто текст: зайдите на www-ru.annaromeovastu.com или https://karta-ru.annaromeovastu.com/map.'));
    assert.ok(onMoscow.includes('<img src="https://karta-ru.annaromeovastu.com/grid.png" alt="map">'));
    assert.ok(onMoscow.includes('<iframe src="https://www-ru.annaromeovastu.com/video"></iframe>'));
    assert.ok(onMoscow.includes("href='https://urokdva-ru.annaromeovastu.com/slide/2'"));
    assert.ok(onMoscow.includes(`href="${DOOR}${FILE}"`));
    assert.ok(onMoscow.includes('<a href="https://vastu-portal-app.onrender.com/login">vastu-portal-app.onrender.com</a>'));
    assert.ok(onMoscow.includes('чужой someone-else.onrender.com и почта hello@annaromeovastu.com.'));

    const onLk = doorHtmlLinks(html, SUPABASE, 'lk.annaromeovastu.com');
    assert.ok(onLk.includes('<a href="https://karta.annaromeovastu.com/" rel="noopener noreferrer" target="_blank">karta.annaromeovastu.com</a>'));
    assert.ok(onLk.includes('<a href="https://kurs.annaromeovastu.com/mk"><strong>kurs.annaromeovastu.com/mk</strong></a>'));
    assert.ok(onLk.includes('<a href="https://venus.annaromeovastu.com/"><em><u><s>https://venus.annaromeovastu.com/</s></u></em></a>'));
    assert.ok(onLk.includes('href="https://test.annaromeovastu.com/quiz?a=1&amp;b=2"'));
    assert.ok(onLk.includes('href="https://biz.annaromeovastu.com/#top"'));
    assert.ok(onLk.includes('Просто текст: зайдите на annaromeovastu.com или https://karta.annaromeovastu.com/map.'));
    assert.ok(onLk.includes('<img src="https://annaromeo-vastu-karta.onrender.com/grid.png" alt="map">'));
    assert.ok(onLk.includes('<iframe src="https://annaromeo-vastu.onrender.com/video"></iframe>'));
    assert.ok(onLk.includes("href='https://urokdva.annaromeovastu.com/slide/2'"));
    assert.ok(onLk.includes(`href="${SUPABASE}${FILE}"`));
    assert.ok(onLk.includes('<a href="https://vastu-portal-app.onrender.com/login">vastu-portal-app.onrender.com</a>'));
    assert.ok(onLk.includes('чужой someone-else.onrender.com и почта hello@annaromeovastu.com.'));

    const onRender = doorHtmlLinks(html, SUPABASE, 'vastu-portal-app.onrender.com');
    assert.ok(onRender.includes('<a href="https://karta.annaromeovastu.com/" rel="noopener noreferrer" target="_blank">karta.annaromeovastu.com</a>'));
    assert.ok(onRender.includes('<a href="https://kurs.annaromeovastu.com/mk"><strong>kurs.annaromeovastu.com/mk</strong></a>'));
    assert.ok(onRender.includes('<img src="https://annaromeo-vastu-karta.onrender.com/grid.png" alt="map">'));
    assert.ok(onRender.includes("href='https://urokdva.lovable.app/slide/2'"));
    assert.ok(onRender.includes(`href="${SUPABASE}${FILE}"`));

    // Plain-text helper (curator feedback, library/stream/week descriptions).
    const feedback = 'Постройте карту на annaromeo-vastu-karta.onrender.com (или https://annaromeo-vastu.onrender.com/about), не на vastu-portal-app.onrender.com.';
    assert.equal(
        doorTextLinks(feedback, 'lk-ru.annaromeovastu.com'),
        'Постройте карту на karta-ru.annaromeovastu.com (или https://www-ru.annaromeovastu.com/about), не на vastu-portal-app.onrender.com.',
    );
    assert.equal(
        doorTextLinks(feedback, 'lk.annaromeovastu.com'),
        'Постройте карту на karta.annaromeovastu.com (или https://annaromeovastu.com/about), не на vastu-portal-app.onrender.com.',
    );
    assert.equal(
        doorTextLinks('Spoofed evil.karta.annaromeovastu.com and annaromeo-vastu-karta.onrender.com.evil.example stay untouched.', 'lk-ru.annaromeovastu.com'),
        'Spoofed evil.karta.annaromeovastu.com and annaromeo-vastu-karta.onrender.com.evil.example stay untouched.',
    );
    assert.equal(doorHtmlLinks('', SUPABASE, 'lk-ru.annaromeovastu.com'), '');
});

import fs from 'node:fs';

test('inline tags are transparent when matching neighbours and split hostnames across tag boundaries', () => {
    const MOSCOW = 'lk-ru.annaromeovastu.com';
    const PUBLIC = 'lk.annaromeovastu.com';

    // Exact cases from round 3 point 1: must not misfire across inline tag boundaries.
    for (const host of [MOSCOW, PUBLIC]) {
        assert.equal(
            doorHtmlLinks('<p>hello@<strong>annaromeovastu.com</strong></p>', SUPABASE, host),
            '<p>hello@<strong>annaromeovastu.com</strong></p>',
        );
        assert.equal(
            doorHtmlLinks('<p><strong>lk.</strong>annaromeovastu.com</p>', SUPABASE, host),
            '<p><strong>lk.</strong>annaromeovastu.com</p>',
        );
        assert.equal(
            doorHtmlLinks('<strong>annaromeovastu.com</strong>.evil.example', SUPABASE, host),
            '<strong>annaromeovastu.com</strong>.evil.example',
        );
    }

    // Split www.annaromeovastu.com: rewrites whole host to www-ru on the door (no www.www-ru), untouched on public.
    assert.equal(
        doorHtmlLinks('<p><strong>www.</strong>annaromeovastu.com</p>', SUPABASE, MOSCOW),
        '<p><strong>www-ru.annaromeovastu.com</strong></p>',
    );
    assert.equal(
        doorHtmlLinks('<p><strong>www.</strong>annaromeovastu.com</p>', SUPABASE, PUBLIC),
        '<p><strong>www.</strong>annaromeovastu.com</p>',
    );

    // Every transparent inline tag (a, strong, em, u, s, span, b, i) sees neighbours across boundaries.
    for (const tag of ['a', 'strong', 'em', 'u', 's', 'span', 'b', 'i']) {
        const emailHtml = `<p>hello@<${tag}>annaromeovastu.com</${tag}></p>`;
        assert.equal(doorHtmlLinks(emailHtml, SUPABASE, MOSCOW), emailHtml);
        const subHtml = `<p><${tag}>evil.</${tag}>karta.annaromeovastu.com</p>`;
        assert.equal(doorHtmlLinks(subHtml, SUPABASE, MOSCOW), subHtml);
        const suffixHtml = `<p><${tag}>annaromeovastu.com</${tag}>.evil.example</p>`;
        assert.equal(doorHtmlLinks(suffixHtml, SUPABASE, MOSCOW), suffixHtml);
    }

    // Split Anna's own site across multiple inline tags rewrites cleanly in place.
    assert.equal(
        doorHtmlLinks('<p><b>annaromeo-vastu</b>-<i>karta</i>.<u>onrender</u>.<s>com</s>/plan</p>', SUPABASE, PUBLIC),
        '<p><b>karta.annaromeovastu.com</b><i></i><u></u><s></s>/plan</p>',
    );
    assert.equal(
        doorHtmlLinks('<p>https://<span>annaromeo-vastu-course.onrender.com</span>/mk</p>', SUPABASE, MOSCOW),
        '<p>https://<span>kurs-ru.annaromeovastu.com</span>/mk</p>',
    );
    assert.equal(
        doorHtmlLinks('<p><a href="https://annaromeo-venus.onrender.com/"><em>annaromeo-venus</em>.onrender.com</a></p>', SUPABASE, PUBLIC),
        '<p><a href="https://venus.annaromeovastu.com/"><em>venus.annaromeovastu.com</em></a></p>',
    );

    // Block tags and <br> still separate blocks so adjacent paragraphs/lines do not glue together.
    assert.equal(
        doorHtmlLinks('<p>hello@</p><p>annaromeovastu.com</p>', SUPABASE, MOSCOW),
        '<p>hello@</p><p>www-ru.annaromeovastu.com</p>',
    );
    assert.equal(
        doorHtmlLinks('<p>hello@<br>annaromeovastu.com</p>', SUPABASE, MOSCOW),
        '<p>hello@<br>www-ru.annaromeovastu.com</p>',
    );
});

test('unchanged public addresses in text stay completely untouched, and changed addresses replace only the hostname', () => {
    for (const host of ['lk.annaromeovastu.com', 'vastu-portal-app.onrender.com', 'localhost']) {
        assert.equal(doorTextLinks('AnnaRomeoVastu.com', host), 'AnnaRomeoVastu.com');
        assert.equal(doorTextLinks('http://annaromeovastu.com/kurs', host), 'http://annaromeovastu.com/kurs');
        assert.equal(doorTextLinks('http://AnnaRomeoVastu.com/Kurs', host), 'http://AnnaRomeoVastu.com/Kurs');
        assert.equal(doorTextLinks('Karta.AnnaRomeoVastu.com/Map', host), 'Karta.AnnaRomeoVastu.com/Map');
        assert.equal(doorTextLinks('http://WWW.AnnaRomeoVastu.com/About', host), 'http://WWW.AnnaRomeoVastu.com/About');

        assert.equal(
            doorHtmlLinks('<p>Сайт AnnaRomeoVastu.com и раздел http://annaromeovastu.com/kurs</p>', SUPABASE, host),
            '<p>Сайт AnnaRomeoVastu.com и раздел http://annaromeovastu.com/kurs</p>',
        );

        // When the host does change (Render -> public), only the hostname is replaced; scheme and path case stay as written.
        assert.equal(
            doorTextLinks('http://annaromeo-vastu-karta.onrender.com/Kurs', host),
            'http://karta.annaromeovastu.com/Kurs',
        );
        assert.equal(
            doorTextLinks('HTTP://AnnaRomeo-Vastu-Course.OnRender.com/MK', host),
            'HTTP://kurs.annaromeovastu.com/MK',
        );
    }

    // On the Moscow door, public -> -ru changes only the hostname and keeps http:// and path casing.
    assert.equal(
        doorTextLinks('http://annaromeovastu.com/kurs', 'lk-ru.annaromeovastu.com'),
        'http://www-ru.annaromeovastu.com/kurs',
    );
    assert.equal(
        doorTextLinks('AnnaRomeoVastu.com/Kurs', 'lk-ru.annaromeovastu.com'),
        'www-ru.annaromeovastu.com/Kurs',
    );
});

test("Anna's address inside a foreign URL's query, fragment or path is never rewritten", () => {
    const cases = [
        'https://t.me/share/url?url=https://annaromeo-vastu-karta.onrender.com/',
        'https://t.me/share/url?url=https://annaromeovastu.com/kurs&text=Vastu',
        'https://example.com/page?next=annaromeo-vastu-karta.onrender.com#https://annaromeovastu.com',
        'https://example.com/#https://annaromeo-vastu-karta.onrender.com/map',
        'https://example.com/#!https://annaromeo-vastu-karta.onrender.com/map',
        'https://web.archive.org/web/2026/https://annaromeo-vastu-karta.onrender.com/',
        '//t.me/share/url?url=https://annaromeo-vastu-karta.onrender.com/',
        't.me/share/url?url=https://annaromeo-vastu-karta.onrender.com/',
    ];

    for (const host of ['lk-ru.annaromeovastu.com', 'lk.annaromeovastu.com', 'vastu-portal-app.onrender.com']) {
        for (const url of cases) {
            assert.equal(doorTextLinks(`Поделиться: ${url}.`, host), `Поделиться: ${url}.`);
            assert.equal(doorHtmlLinks(`<p>Поделиться: ${url}</p>`, SUPABASE, host), `<p>Поделиться: ${url}</p>`);
        }
        assert.equal(
            doorHtmlLinks('<p>https://t.me/share/url?text=hi&amp;url=https://annaromeo-vastu-karta.onrender.com/</p>', SUPABASE, host),
            '<p>https://t.me/share/url?text=hi&amp;url=https://annaromeo-vastu-karta.onrender.com/</p>',
        );
        assert.equal(
            doorHtmlLinks('<p>https://t.me/share/url?url=<strong>https://annaromeo-vastu-karta.onrender.com/</strong></p>', SUPABASE, host),
            '<p>https://t.me/share/url?url=<strong>https://annaromeo-vastu-karta.onrender.com/</strong></p>',
        );
    }

    // When Anna's site IS the URL's own host, it still rewrites cleanly without touching its query/fragment.
    assert.equal(
        doorTextLinks('https://annaromeo-vastu-karta.onrender.com/plan?share=https://t.me/tymuron#zones', 'lk.annaromeovastu.com'),
        'https://karta.annaromeovastu.com/plan?share=https://t.me/tymuron#zones',
    );
    assert.equal(
        doorTextLinks('https://annaromeo-vastu-karta.onrender.com/plan?share=https://t.me/tymuron#zones', 'lk-ru.annaromeovastu.com'),
        'https://karta-ru.annaromeovastu.com/plan?share=https://t.me/tymuron#zones',
    );
});

test('tags that fail attribute tokenization (such as unquoted apostrophes) stay untouched and never enter text mode', () => {
    const unquotedApostrophe = '<img src="https://annaromeo-vastu-karta.onrender.com/grid.png" alt=Anna\'s>';
    const customAttrs = '<div data-url="https://annaromeo-vastu-karta.onrender.com/" title=Anna\'s>';

    for (const host of ['lk-ru.annaromeovastu.com', 'lk.annaromeovastu.com', 'vastu-portal-app.onrender.com']) {
        assert.equal(doorHtmlLinks(unquotedApostrophe, SUPABASE, host), unquotedApostrophe);
        assert.equal(doorHtmlLinks(customAttrs, SUPABASE, host), customAttrs);
    }

    // A later apostrophe in text must not merge with the unquoted apostrophe inside <img ... alt=Anna's>.
    assert.equal(
        doorHtmlLinks(`${unquotedApostrophe}<p>It's annaromeo-vastu-karta.onrender.com</p>`, SUPABASE, 'lk.annaromeovastu.com'),
        `${unquotedApostrophe}<p>It's karta.annaromeovastu.com</p>`,
    );
    assert.equal(
        doorHtmlLinks('<div title="unclosed>annaromeo-vastu-karta.onrender.com</div>', SUPABASE, 'lk.annaromeovastu.com'),
        '<div title="unclosed>karta.annaromeovastu.com</div>',
    );
});

test('performance: 50,000-character [a-z0-9-] strings process in under 100 ms without regex lookbehind', () => {
    const source = fs.readFileSync(new URL('../src/lib/siteLinks.js', import.meta.url), 'utf8');
    assert.ok(!source.includes('(?<=') && !source.includes('(?<!'), 'no regex lookbehind for pre-16.4 Safari');

    const longChain = 'a1-b2-'.repeat(8334).slice(0, 50_000);
    assert.equal(longChain.length, 50_000);

    const t0 = performance.now();
    const outText = doorTextLinks(longChain, 'lk-ru.annaromeovastu.com');
    const textMs = performance.now() - t0;
    assert.equal(outText, longChain);
    assert.ok(textMs < 100, `doorTextLinks on 50k chars took ${textMs.toFixed(2)} ms (expected < 100 ms)`);

    const longHtml = `<p>${longChain}</p>`;
    const t1 = performance.now();
    const outHtml = doorHtmlLinks(longHtml, SUPABASE, 'lk-ru.annaromeovastu.com');
    const htmlMs = performance.now() - t1;
    assert.equal(outHtml, longHtml);
    assert.ok(htmlMs < 100, `doorHtmlLinks on 50k chars took ${htmlMs.toFixed(2)} ms (expected < 100 ms)`);
});
