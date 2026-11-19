// Tests for paid course access extensions («Продление доступа»):
//   - computeExpiresAt for 'extend': expired student -> payment + months;
//     active student -> current expiry + months; lifetime stays null;
//     course_start and purchase unchanged
//   - buildExtensionEmail: subject/body contain course title and <d MMMM yyyy>,
//     durable access link present, no Telegram links
//   - fulfilment.fulfil(): extension grant semantics, mixed offer -> welcome email,
//     retry after email failure does not double-extend, reminder_sent_at cleared
//   - GET /api/student/extensions: 401 without valid Bearer token; returns only
//     current user's expired/expiring-within-14d courses with 'extend' offers
//     sorted by months asc (items sorted by expires_at asc); empty when no
//     'extend' offers exist
//   - POST /api/lava/invoice: passes extend=1 in return URLs when requested
//   - POST /api/cron/expiry-reminders: includes extension buttons when 'extend'
//     offers exist for the course

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createFakeServices } from './fake-services.mjs';
import {
    buildExtensionEmail,
    computeExpiresAt,
    createFulfilment,
    formatDateRuLong,
    formatPriceRub,
} from '../fulfilment.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXTEND_1M_OFFER = '11111111-aaaa-4aaa-8aaa-111111111111';
const EXTEND_12M_OFFER = '22222222-bbbb-4bbb-8bbb-222222222222';
const EXTEND_PRODUCT_1M = '11111111-aaaa-4aaa-8aaa-000000000001';
const EXTEND_PRODUCT_12M = '22222222-bbbb-4bbb-8bbb-000000000012';
const NORMAL_BIZ_OFFER = 'aaaaaaaa-1111-4111-8111-111111111111';
const HOOK_KEY = 'lava-hook-ext';
const CRON_SECRET = 'cron-secret-ext';
const ALERTS = 'alerts@example.com';

// ---------------------------------------------------------------------------
// 1. Unit tests: computeExpiresAt & extension email
// ---------------------------------------------------------------------------

test('computeExpiresAt for extend: expired -> paidAt + months, active -> current + months, lifetime stays null; course_start and purchase unchanged', () => {
    const bizCourse = {
        slug: 'vastu-2',
        starts_at: '2026-05-18T00:00:00+00:00',
        access_duration_months: 6,
    };
    const extend1m = {
        lava_offer_id: EXTEND_1M_OFFER,
        is_lifetime: false,
        access_months: 1,
        access_from: 'extend',
        courses: bizCourse,
    };
    const extend12m = {
        lava_offer_id: EXTEND_12M_OFFER,
        is_lifetime: false,
        access_months: 12,
        access_from: 'extend',
        courses: bizCourse,
    };

    const paidAt = '2026-11-20T12:00:00.000Z';

    // Expired student -> payment + months
    assert.equal(
        computeExpiresAt(extend1m, paidAt, '2026-11-18T00:00:00.000Z'),
        '2026-12-20T12:00:00.000Z'
    );
    assert.equal(
        computeExpiresAt(extend12m, paidAt, '2026-11-18T00:00:00.000Z'),
        '2027-11-20T12:00:00.000Z'
    );

    // Active student (5 days left) -> current expiry + months (loses nothing)
    assert.equal(
        computeExpiresAt(extend1m, paidAt, '2026-11-25T00:00:00.000Z'),
        '2026-12-25T00:00:00.000Z'
    );
    assert.equal(
        computeExpiresAt(extend12m, paidAt, '2026-11-25T00:00:00.000Z'),
        '2027-11-25T00:00:00.000Z'
    );

    // Lifetime access (currentExpiresAt === null) stays lifetime
    assert.equal(computeExpiresAt(extend1m, paidAt, null), null);
    assert.equal(computeExpiresAt(extend12m, paidAt, null), null);

    // No prior entitlement (undefined) -> payment + months
    assert.equal(computeExpiresAt(extend1m, paidAt), '2026-12-20T12:00:00.000Z');

    // course_start and purchase behave exactly as before (even if 3rd arg is passed)
    const courseStartOffer = {
        is_lifetime: false,
        access_months: 6,
        access_from: 'course_start',
        courses: bizCourse,
    };
    assert.equal(
        computeExpiresAt(courseStartOffer, '2026-11-17T12:00:00.000Z', '2026-11-25T00:00:00.000Z'),
        '2026-11-18T00:00:00.000Z'
    );
    const purchaseOffer = {
        is_lifetime: false,
        access_months: 6,
        access_from: 'purchase',
        courses: bizCourse,
    };
    assert.equal(
        computeExpiresAt(purchaseOffer, paidAt, '2026-11-25T00:00:00.000Z'),
        '2027-05-20T12:00:00.000Z'
    );
});

test('extension email: subject and body contain course title, <d MMMM yyyy>, durable access link, and no Telegram links', () => {
    assert.equal(formatDateRuLong('2026-12-20T12:00:00.000Z'), '20 декабря 2026');
    assert.equal(formatDateRuLong('2027-05-05T00:00:00.000Z'), '5 мая 2027');
    assert.equal(formatPriceRub(3500), '3\u2009500');
    assert.equal(formatPriceRub(10000), '10\u2009000');

    const mail = buildExtensionEmail({
        courseTitle: 'Васту для бизнеса',
        expiresAt: '2026-12-20T12:00:00.000Z',
        accessUrl: 'https://lk.annaromeovastu.com/access?t=tok123',
        spareUrl: 'https://spare.example.com/access?t=tok123',
    });

    assert.equal(mail.subject, 'Доступ к курсу «Васту для бизнеса» продлён до 20 декабря 2026');
    assert.match(mail.html, /Доступ к курсу «Васту для бизнеса» продлён до 20 декабря 2026/);
    assert.match(mail.html, /href="https:\/\/lk\.annaromeovastu\.com\/access\?t=tok123"/);
    assert.match(mail.html, /Войти в личный кабинет/);
    assert.match(mail.html, /spare\.example\.com\/access\?t=tok123/);
    assert.match(mail.text, /Доступ к курсу «Васту для бизнеса» продлён до 20 декабря 2026/);
    assert.match(mail.text, /https:\/\/lk\.annaromeovastu\.com\/access\?t=tok123/);

    // No Telegram links or support chat buttons anywhere in HTML or plain text
    assert.doesNotMatch(mail.html, /t\.me|telegram|чат поддержки|канал курса|чат потока/i);
    assert.doesNotMatch(mail.text, /t\.me|telegram|чат поддержки|канал курса|чат потока/i);
});

// ---------------------------------------------------------------------------
// 2. In-process fulfilment tests
// ---------------------------------------------------------------------------

function makeWorld() {
    const fake = createFakeServices();
    const sb = createClient('http://fake.test', 'service-role', {
        global: { fetch: fake.fetch },
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const biz = {
        id: crypto.randomUUID(),
        slug: 'vastu-2',
        title: 'Васту для бизнеса',
        starts_at: '2026-05-18T00:00:00+00:00',
        access_duration_months: 6,
        is_active: true,
    };
    const design = {
        id: crypto.randomUUID(),
        slug: 'vastu-design-2026',
        title: 'Васту-дизайн',
        starts_at: '2026-11-09T00:00:00+00:00',
        access_duration_months: 6,
        is_active: true,
    };
    const MIXED_OFFER = '99999999-9999-4999-8999-999999999999';
    fake.seed('courses', [biz, design]);
    fake.seed('course_offers', [
        {
            course_id: biz.id,
            lava_offer_id: EXTEND_1M_OFFER,
            access_months: 1,
            access_from: 'extend',
            extension_label: '1 месяц',
            price_rub: 3500,
        },
        {
            course_id: biz.id,
            lava_offer_id: EXTEND_12M_OFFER,
            access_months: 12,
            access_from: 'extend',
            extension_label: '1 год',
            price_rub: 10000,
        },
        {
            course_id: biz.id,
            lava_offer_id: NORMAL_BIZ_OFFER,
            access_months: 6,
            access_from: 'purchase',
        },
        // Mixed offer (should not happen in practice, tests fallback to normal welcome)
        { course_id: biz.id, lava_offer_id: MIXED_OFFER, access_months: 1, access_from: 'extend' },
        { course_id: design.id, lava_offer_id: MIXED_OFFER, access_months: 6, access_from: 'course_start' },
    ]);

    const fulfilment = createFulfilment({
        getSupabase: () => sb,
        sendEmail: async (mail) => {
            const resp = await fake.fetch('http://fake.test/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mail),
            });
            if (!resp.ok) throw new Error(`Resend ${resp.status}`);
            return (await resp.json()).id;
        },
        appUrl: 'https://lk.annaromeovastu.com',
        accessSecret: 'acc-secret',
        alertEmail: ALERTS,
        fetchFn: fake.fetch,
    });

    return { fake, sb, fulfilment, biz, design, MIXED_OFFER };
}

test('fulfilment extend: expired, active, lifetime, mixed offer, and safe retry without double-extending', async () => {
    const w = makeWorld();
    const paidAt = '2026-11-20T12:00:00.000Z';

    // 1. Expired student -> extends from paidAt, clears reminder_sent_at, sends extension email
    const expiredUser = w.fake.createUser('expired@example.com');
    w.fake.seed('user_entitlements', [{
        user_id: expiredUser.id,
        course_id: w.biz.id,
        source: 'lava.top',
        source_payment_id: 'old-1',
        expires_at: '2026-11-18T00:00:00.000Z',
        reminder_sent_at: '2026-11-11T00:00:00.000Z',
    }]);

    await w.fulfilment.fulfil({
        contractId: 'ext-expired-1',
        email: 'expired@example.com',
        lavaIds: [EXTEND_1M_OFFER],
        source: 'webhook',
        paidAt,
    });

    const expEnt = w.fake.db.user_entitlements.find((e) => e.user_id === expiredUser.id);
    assert.equal(expEnt.expires_at, '2026-12-20T12:00:00.000Z');
    assert.equal(expEnt.reminder_sent_at, null, 'reminder_sent_at reset for new window');
    const expMails = w.fake.sent.filter((m) => m.to === 'expired@example.com');
    assert.equal(expMails.length, 1);
    assert.equal(expMails[0].subject, 'Доступ к курсу «Васту для бизнеса» продлён до 20 декабря 2026');
    assert.doesNotMatch(expMails[0].html, /t\.me|telegram/i);
    assert.match(expMails[0].html, /\/access\?t=/);

    // 2. Active student (5 days left) -> adds 12 months to current expires_at (no days lost)
    const activeUser = w.fake.createUser('active@example.com');
    w.fake.seed('user_entitlements', [{
        user_id: activeUser.id,
        course_id: w.biz.id,
        source: 'lava.top',
        source_payment_id: 'old-2',
        expires_at: '2026-11-25T00:00:00.000Z',
    }]);

    await w.fulfilment.fulfil({
        contractId: 'ext-active-1',
        email: 'active@example.com',
        lavaIds: [EXTEND_12M_OFFER],
        source: 'webhook',
        paidAt,
    });
    const actEnt = w.fake.db.user_entitlements.find((e) => e.user_id === activeUser.id);
    assert.equal(actEnt.expires_at, '2027-11-25T00:00:00.000Z');
    const actMails = w.fake.sent.filter((m) => m.to === 'active@example.com');
    assert.equal(actMails.length, 1);
    assert.equal(actMails[0].subject, 'Доступ к курсу «Васту для бизнеса» продлён до 25 ноября 2027');

    // 3. Lifetime student -> stays null, no email
    const vipUser = w.fake.createUser('vip@example.com');
    w.fake.seed('user_entitlements', [{
        user_id: vipUser.id,
        course_id: w.biz.id,
        source: 'lava.top',
        source_payment_id: 'old-vip',
        expires_at: null,
    }]);
    await w.fulfilment.fulfil({
        contractId: 'ext-vip-1',
        email: 'vip@example.com',
        lavaIds: [EXTEND_1M_OFFER],
        source: 'webhook',
        paidAt,
    });
    assert.equal(w.fake.db.user_entitlements.find((e) => e.user_id === vipUser.id).expires_at, null);
    assert.equal(w.fake.sent.filter((m) => m.to === 'vip@example.com').length, 0);

    // 4. Mixed purchase (extend + normal) -> sends normal welcome email
    await w.fulfilment.fulfil({
        contractId: 'ext-mixed-1',
        email: 'mixed@example.com',
        lavaIds: [w.MIXED_OFFER],
        source: 'webhook',
        paidAt,
    });
    const mixedMails = w.fake.sent.filter((m) => m.to === 'mixed@example.com');
    assert.equal(mixedMails.length, 1);
    assert.match(mixedMails[0].subject, /Добро пожаловать на курс/);

    // 5. Email fails on first attempt, then retry runs -> does NOT double-extend
    const retryUser = w.fake.createUser('retry-ext@example.com');
    w.fake.seed('user_entitlements', [{
        user_id: retryUser.id,
        course_id: w.biz.id,
        source: 'lava.top',
        source_payment_id: 'old-retry',
        expires_at: '2026-11-25T00:00:00.000Z',
    }]);
    w.fake.control.resendFailures = 1; // fail the buyer email (alert succeeds next)
    await w.fulfilment.fulfil({
        contractId: 'ext-retry-1',
        email: 'retry-ext@example.com',
        lavaIds: [EXTEND_1M_OFFER],
        source: 'webhook',
        paidAt,
    });
    assert.equal(
        w.fake.db.user_entitlements.find((e) => e.user_id === retryUser.id).expires_at,
        '2026-12-25T00:00:00.000Z'
    );
    assert.equal(w.fake.sent.filter((m) => m.to === 'retry-ext@example.com').length, 0);

    // Now retry the same contract -> sends email with 25 декабря 2026, expiry stays 2026-12-25
    await w.fulfilment.fulfil({
        contractId: 'ext-retry-1',
        email: 'retry-ext@example.com',
        lavaIds: [EXTEND_1M_OFFER],
        source: 'webhook',
        paidAt,
    });
    assert.equal(
        w.fake.db.user_entitlements.find((e) => e.user_id === retryUser.id).expires_at,
        '2026-12-25T00:00:00.000Z',
        'retry must not add a second month'
    );
    const retryMails = w.fake.sent.filter((m) => m.to === 'retry-ext@example.com');
    assert.equal(retryMails.length, 1);
    assert.equal(retryMails[0].subject, 'Доступ к курсу «Васту для бизнеса» продлён до 25 декабря 2026');
});

// ---------------------------------------------------------------------------
// 3. Full HTTP e2e tests against server.js
// ---------------------------------------------------------------------------

async function startServer(fakeUrl) {
    const port = 26000 + Math.floor(Math.random() * 20000);
    const app = `http://127.0.0.1:${port}`;
    const proc = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: {
            ...process.env,
            PORT: String(port),
            APP_URL: app,
            SUPABASE_URL: fakeUrl,
            SUPABASE_SERVICE_ROLE_KEY: 'service-role',
            LAVA_WEBHOOK_API_KEY: HOOK_KEY,
            LAVA_API_KEY: 'lava-key',
            LAVA_API_BASE: fakeUrl,
            RESEND_API_KEY: 're_test',
            RESEND_API_BASE: fakeUrl,
            CRON_SECRET,
            ACCESS_LINK_SECRET: 'access-sec',
            ALERT_EMAIL: ALERTS,
            RECONCILE_SINCE: '2026-10-20T00:00:00Z',
            RECONCILE_INTERVAL_MIN: '600',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.output = '';
    proc.stdout.on('data', (d) => (proc.output += d));
    proc.stderr.on('data', (d) => (proc.output += d));
    const end = Date.now() + 8000;
    for (;;) {
        try {
            if ((await fetch(`${app}/health`)).ok) break;
        } catch { /* wait */ }
        if (Date.now() > end) throw new Error(`server did not boot:\n${proc.output}`);
        await new Promise((r) => setTimeout(r, 80));
    }
    return { proc, app };
}

test('HTTP e2e: /api/student/extensions auth, scoping, sorting, empty state, /api/lava/invoice extend=1, and expiry-reminders buttons', async () => {
    const fake = createFakeServices({ lavaApiKey: 'lava-key' });
    const fakePort = await fake.listen();
    const fakeUrl = `http://127.0.0.1:${fakePort}`;
    const { proc, app } = await startServer(fakeUrl);

    try {
        fake.control.webhook = { url: `${app}/api/lava/webhook`, key: HOOK_KEY };

        const biz = {
            id: crypto.randomUUID(),
            slug: 'vastu-2',
            title: 'Васту для бизнеса',
            starts_at: '2026-05-18T00:00:00+00:00',
            access_duration_months: 6,
            is_active: true,
        };
        const design = {
            id: crypto.randomUUID(),
            slug: 'vastu-design-2026',
            title: 'Васту-дизайн',
            starts_at: '2026-11-09T00:00:00+00:00',
            access_duration_months: 6,
            is_active: true,
        };
        const extra = {
            id: crypto.randomUUID(),
            slug: 'vastu-extra',
            title: 'Васту-доп',
            starts_at: '2026-01-01T00:00:00+00:00',
            access_duration_months: 6,
            is_active: true,
        };
        fake.seed('courses', [biz, design, extra]);
        fake.products.push(
            { id: EXTEND_PRODUCT_1M, title: 'Продление 1 месяц', offers: [{ id: EXTEND_1M_OFFER, prices: [{ currency: 'RUB', amount: 3500 }] }] },
            { id: EXTEND_PRODUCT_12M, title: 'Продление 1 год', offers: [{ id: EXTEND_12M_OFFER, prices: [{ currency: 'RUB', amount: 10000 }] }] },
        );

        const sb = createClient(fakeUrl, 'service-role', {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const studentA = fake.createUser('student-a@example.com', { password: 'pwA' });
        const studentB = fake.createUser('student-b@example.com', { password: 'pwB' });
        const tokenA = (await sb.auth.signInWithPassword({ email: 'student-a@example.com', password: 'pwA' })).data.session.access_token;
        const tokenB = (await sb.auth.signInWithPassword({ email: 'student-b@example.com', password: 'pwB' })).data.session.access_token;

        const now = Date.now();
        const pastIso = new Date(now - 2 * 24 * 3600 * 1000).toISOString();
        const soon7dIso = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
        const far30dIso = new Date(now + 30 * 24 * 3600 * 1000).toISOString();

        // Student A: expired vastu-2, expiring-soon vastu-extra (7d), active far-away vastu-design (30d)
        // Student B: expired vastu-2 (must NEVER leak to A), lifetime vastu-extra
        fake.seed('user_entitlements', [
            { user_id: studentA.id, course_id: biz.id, source: 'lava.top', expires_at: pastIso },
            { user_id: studentA.id, course_id: extra.id, source: 'lava.top', expires_at: soon7dIso },
            { user_id: studentA.id, course_id: design.id, source: 'lava.top', expires_at: far30dIso },
            { user_id: studentB.id, course_id: biz.id, source: 'lava.top', expires_at: soon7dIso },
            { user_id: studentB.id, course_id: extra.id, source: 'lava.top', expires_at: null },
        ]);

        // 1. 401 without token or with invalid token
        assert.equal((await fetch(`${app}/api/student/extensions`)).status, 401);
        assert.equal(
            (await fetch(`${app}/api/student/extensions`, { headers: { Authorization: 'Bearer invalid-jwt' } })).status,
            401
        );

        // 2. No 'extend' offers in DB yet -> empty items
        const emptyResp = await fetch(`${app}/api/student/extensions`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.equal(emptyResp.status, 200);
        assert.deepEqual(await emptyResp.json(), { items: [] });

        // 3. Seed 'extend' offers (12m BEFORE 1m to verify ascending sort by months)
        const EXTRA_EXT_OFFER = '33333333-cccc-4ccc-8ccc-333333333333';
        fake.seed('course_offers', [
            {
                course_id: biz.id,
                lava_offer_id: EXTEND_12M_OFFER,
                access_months: 12,
                access_from: 'extend',
                extension_label: '1 год',
                price_rub: 10000,
            },
            {
                course_id: biz.id,
                lava_offer_id: EXTEND_1M_OFFER,
                access_months: 1,
                access_from: 'extend',
                extension_label: '1 месяц',
                price_rub: 3500,
            },
            {
                course_id: biz.id,
                lava_offer_id: NORMAL_BIZ_OFFER,
                access_months: 6,
                access_from: 'purchase',
            },
            {
                course_id: extra.id,
                lava_offer_id: EXTRA_EXT_OFFER,
                access_months: 3,
                access_from: 'extend',
                extension_label: '3 месяца',
                price_rub: 6000,
            },
            {
                course_id: design.id,
                lava_offer_id: '44444444-dddd-4ddd-8ddd-444444444444',
                access_months: 1,
                access_from: 'extend',
                extension_label: '1 месяц',
                price_rub: 3500,
            },
        ]);

        // Student A sees vastu-2 (expired) then vastu-extra (expiring in 7d), NOT vastu-design (30d away)
        const respA = await fetch(`${app}/api/student/extensions`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.equal(respA.status, 200);
        assert.match(respA.headers.get('cache-control') || '', /no-store/i);
        const dataA = await respA.json();
        assert.deepEqual(dataA, {
            items: [
                {
                    course_slug: 'vastu-2',
                    course_title: 'Васту для бизнеса',
                    expires_at: pastIso,
                    expired: true,
                    offers: [
                        { offer_id: EXTEND_1M_OFFER, months: 1, label: '1 месяц', price_rub: 3500 },
                        { offer_id: EXTEND_12M_OFFER, months: 12, label: '1 год', price_rub: 10000 },
                    ],
                },
                {
                    course_slug: 'vastu-extra',
                    course_title: 'Васту-доп',
                    expires_at: soon7dIso,
                    expired: false,
                    offers: [
                        { offer_id: EXTRA_EXT_OFFER, months: 3, label: '3 месяца', price_rub: 6000 },
                    ],
                },
            ],
        });

        // Student B sees ONLY their own vastu-2 (expiring in 7d, not expired); lifetime vastu-extra excluded
        const respB = await fetch(`${app}/api/student/extensions`, {
            headers: { Authorization: `Bearer ${tokenB}` },
        });
        assert.equal(respB.status, 200);
        const dataB = await respB.json();
        assert.equal(dataB.items.length, 1);
        assert.equal(dataB.items[0].course_slug, 'vastu-2');
        assert.equal(dataB.items[0].expires_at, soon7dIso);
        assert.equal(dataB.items[0].expired, false);
        assert.deepEqual(dataB.items[0].offers.map((o) => o.months), [1, 12]);

        // 4. /api/lava/invoice with extend: true passes &extend=1 to Lava return URLs
        const invResp = await fetch(`${app}/api/lava/invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'student-a@example.com',
                offerId: EXTEND_1M_OFFER,
                currency: 'RUB',
                method: 'sbp',
                extend: true,
            }),
        });
        assert.equal(invResp.status, 200);
        const { paymentUrl } = await invResp.json();
        const sentToLava = fake.control.lastInvoiceRequest;
        assert.equal(sentToLava.successful_return_url, `${app}/buy/thanks?offer=${EXTEND_1M_OFFER}&extend=1`);
        assert.equal(sentToLava.failure_return_url, `${app}/buy/${EXTEND_1M_OFFER}?currency=RUB&failed=1&extend=1`);
        assert.equal(sentToLava.cancel_return_url, `${app}/buy/${EXTEND_1M_OFFER}?currency=RUB&extend=1`);

        // Paying that invoice extends Student A's expired vastu-2 by 1 month and sends extension email
        const paidPage = await (await fetch(paymentUrl, { method: 'POST' })).text();
        assert.match(paidPage, /webhook 200/);
        const entAfter = fake.db.user_entitlements.find((e) => e.user_id === studentA.id && e.course_id === biz.id);
        assert.ok(Date.parse(entAfter.expires_at) > now + 25 * 24 * 3600 * 1000);
        const extMail = fake.sent.find((m) => m.to === 'student-a@example.com');
        assert.ok(extMail);
        assert.match(extMail.subject, /^Доступ к курсу «Васту для бизнеса» продлён до \d{1,2} [а-я]+ \d{4}$/);
        assert.doesNotMatch(extMail.html, /t\.me|telegram/i);

        // 5. /api/cron/expiry-reminders includes extension buttons for Student B (expiring in 7d)
        const remResp = await fetch(`${app}/api/cron/expiry-reminders`, {
            method: 'POST',
            headers: { 'x-cron-secret': CRON_SECRET },
        });
        assert.equal(remResp.status, 200);
        const remBody = await remResp.json();
        assert.ok(remBody.sent >= 1);
        const remMailB = fake.sent.find((m) => m.to === 'student-b@example.com' && m.subject === 'Ваш доступ к курсу скоро закончится');
        assert.ok(remMailB, 'expiry reminder sent to Student B');
        assert.match(remMailB.html, new RegExp(`/buy/${EXTEND_1M_OFFER}\\?email=student-b%40example\\.com&amp;extend=1`));
        assert.match(remMailB.html, new RegExp(`/buy/${EXTEND_12M_OFFER}\\?email=student-b%40example\\.com&amp;extend=1`));
        assert.match(remMailB.html, /1 месяц — 3\u2009500 ₽/);
        assert.match(remMailB.html, /1 год — 10\u2009000 ₽/);
    } finally {
        proc.kill();
        await fake.close();
    }
});
