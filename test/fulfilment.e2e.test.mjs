// End-to-end: the real server.js against local fakes of Supabase, lava.top
// and Resend (test/fake-services.mjs). Run: npm test
//
// Covers every way a buyer reaches the platform — webhook, the lava invoice
// poll, manual /grant, GetCourse orders, monobank «Покупка частинами» — plus
// installments, the access link, "send me my link", retries and alerts. course_offers rows mirror
// supabase/migrations/20261023_purchase_fulfilment.sql.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeServices } from './fake-services.mjs';
import { makeAccessToken } from '../fulfilment.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The six «Васту-дизайн» tariffs: [product, offer, pro?]
const T = {
    base: ['ed760ac8-79d2-4f9e-9255-baeba0bdd1ac', '4d14d633-0578-4ce8-8ad6-2d85bc3e0c49', false],
    discount: ['13b60773-721f-4d05-a8f7-8f68f72472bf', 'ded0ec37-2888-4336-8e2d-38c49bab7df6', false],
    baseInstall: ['3453f635-cff3-4b3b-bc00-8a1a6bd01145', '51eedd02-887b-4e1b-b5d4-b7342ee4cba7', false],
    baseInstallEarly: ['8f936dd1-092c-4d49-8039-f5403b0f51a9', 'feaec9dc-cd7b-4fd3-95ee-638c633f885f', false],
    pro: ['34229951-b58e-424a-b1d1-d26823fd0373', 'd6a1aacb-974b-411c-8cee-3d353a44c852', true],
    proInstall: ['c6380628-cdcb-4b1f-9bb2-779e418a2687', 'df420ef4-68ec-4c80-a712-aaf0f50bda3d', true],
};
const BASE_PRODUCT = T.base[0];
const BASE_DISCOUNT_PRODUCT = T.discount[0];
const PRO_PRODUCT = T.pro[0];
const BIZ_PRODUCT = '11111111-2222-3333-4444-555555555555';
const BIZ_VIP_OFFER = '1daaffb0-e3aa-44a9-98f6-5e1a986a79b3';
const BIZ_STD_OFFER = 'caa3c132-dca3-438d-b424-eafff3dd3033';
const ALERTS = 'alerts@example.com';
const SECRET = { cron: 'cron-secret', hook: 'hook-key', access: 'access-secret', gk: 'gk-key', monoStore: 'mono-store', monoSign: 'mono-sign-key' };

let fake, serverProc, app, fakeUrl;

async function waitFor(fn, ms = 8000) {
    const end = Date.now() + ms;
    for (;;) {
        try { const v = await fn(); if (v) return v; } catch {}
        if (Date.now() > end) throw new Error('timed out');
        await new Promise((r) => setTimeout(r, 100));
    }
}

test.before(async () => {
    fake = createFakeServices({ lavaApiKey: 'lava-key', monoStoreId: SECRET.monoStore, monoSignKey: SECRET.monoSign });
    const fakePort = await fake.listen();
    fakeUrl = `http://127.0.0.1:${fakePort}`;

    const course = (slug, title, startsAt = null, months = null) => ({ id: crypto.randomUUID(), slug, title, starts_at: startsAt, access_duration_months: months, is_active: true });
    const c = {
        base: course('vastu-design-2026', 'Васту-дизайн', '2026-11-09T00:00:00+00:00', 6),
        pro: course('vastu-design-2026-pro', 'Васту-дизайн · Наставничество', '2026-11-09T00:00:00+00:00', 12),
        biz: course('vastu-2', 'Васту для бизнеса', '2026-05-18T00:00:00+00:00', 6),
        bizVip: course('vastu-2-vip', 'Васту для бизнеса · VIP'),
    };
    fake.seed('courses', Object.values(c));
    for (const [productId, offerId, pro] of Object.values(T)) {
        for (const id of [productId, offerId]) {
            fake.seed('course_offers', [{ course_id: c.base.id, lava_offer_id: id, access_months: pro ? 12 : 6 }]);
            if (pro) fake.seed('course_offers', [{ course_id: c.pro.id, lava_offer_id: id, access_months: 12 }]);
        }
        fake.products.push({ id: productId, title: `Тариф ${productId.slice(0, 4)}`, type: 'COURSE', offers: [{ id: offerId, name: 'x', prices: [{ currency: 'RUB', amount: pro ? 175000 : 75000, periodicity: 'ONE_TIME' }, { currency: 'EUR', amount: pro ? 1907.5 : 817.5, periodicity: 'ONE_TIME' }] }] });
    }
    fake.seed('course_offers', [
        { course_id: c.biz.id, lava_offer_id: BIZ_STD_OFFER },
        { course_id: c.biz.id, lava_offer_id: BIZ_VIP_OFFER, is_lifetime: true },
        { course_id: c.bizVip.id, lava_offer_id: BIZ_VIP_OFFER, is_lifetime: true },
    ]);

    const port = 20000 + Math.floor(Math.random() * 20000);
    app = `http://127.0.0.1:${port}`;
    serverProc = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: {
            ...process.env,
            PORT: String(port),
            APP_URL: app,
            SUPABASE_URL: fakeUrl,
            SUPABASE_SERVICE_ROLE_KEY: 'service-role',
            LAVA_WEBHOOK_API_KEY: SECRET.hook,
            LAVA_API_KEY: 'lava-key',
            LAVA_API_BASE: fakeUrl,
            RESEND_API_KEY: 're_test',
            RESEND_API_BASE: fakeUrl,
            CRON_SECRET: SECRET.cron,
            ACCESS_LINK_SECRET: SECRET.access,
            ALERT_EMAIL: ALERTS,
            RECONCILE_SINCE: '2026-10-20T00:00:00Z',
            RECONCILE_INTERVAL_MIN: '600',
            GETCOURSE_WEBHOOK_KEY: SECRET.gk,
            MONO_STORE_ID: SECRET.monoStore,
            MONO_SIGN_KEY: SECRET.monoSign,
            MONO_API_BASE: `${fakeUrl}/mono`,
            MONO_PRICES_UAH: 'design-base=38000, design-pro=88000',
            MONO_PARTS: '3,4,6',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.output = '';
    serverProc.stdout.on('data', (d) => (serverProc.output += d));
    serverProc.stderr.on('data', (d) => (serverProc.output += d));
    await waitFor(async () => (await fetch(`${app}/health`)).ok);
    fake.control.webhook = { url: `${app}/api/lava/webhook`, key: SECRET.hook };
});

test.after(async () => {
    serverProc?.kill();
    await fake?.close();
});

const webhook = (body, key = SECRET.hook) =>
    fetch(`${app}/api/lava/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': key }, body: JSON.stringify(body) });
const admin = (method, p, body, secret = SECRET.cron) =>
    fetch(`${app}${p}`, { method, headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: body ? JSON.stringify(body) : undefined });
const paid = (productId, email, contractId = crypto.randomUUID()) => ({
    eventType: 'payment.success', product: { id: productId, title: 'x' }, buyer: { email }, contractId,
    amount: 75000, currency: 'RUB', timestamp: new Date().toISOString(), status: 'completed',
});
// The real path: checkout started on /buy/<offer> (lava_invoices row), then
// lava's webhook, which carries only the product id.
const buy = (tariff, email, contractId = crypto.randomUUID()) => {
    const [productId, offerId] = T[tariff];
    fake.seed('lava_invoices', [{ contract_id: contractId, offer_id: offerId, email }]);
    return webhook(paid(productId, email, contractId)).then((r) => ({ r, contractId }));
};
const mailsTo = (to) => fake.sent.filter((m) => m.to === to);
const purchase = (id) => fake.db.purchases.find((p) => p.contract_id === id);
const entitlements = (email) => {
    const u = [...fake.users.values()].find((x) => x.email === email);
    if (!u) return [];
    return fake.db.user_entitlements.filter((e) => e.user_id === u.id).map((e) => ({
        slug: fake.db.courses.find((c) => c.id === e.course_id).slug, expires_at: e.expires_at,
    })).sort((a, b) => a.slug.localeCompare(b.slug));
};
const accessLinkIn = (mail) => (mail.html.match(/href="([^"]*\/access\?t=[^"]+)"/) || [])[1]?.replace(/&amp;/g, '&');

test('the whole customer journey: /buy -> lava checkout -> paid -> access + welcome email', async () => {
    const r = await fetch(`${app}/api/lava/invoice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'Journey@Mail.ru', offerId: T.discount[1], currency: 'RUB' }),
    });
    assert.equal(r.status, 200);
    const { paymentUrl } = await r.json();
    const contractId = paymentUrl.split('/').pop();
    assert.equal(fake.db.lava_invoices.find((x) => x.contract_id === contractId)?.offer_id, T.discount[1], '/buy recorded the offer');

    const paidPage = await (await fetch(paymentUrl, { method: 'POST' })).text();
    assert.match(paidPage, /webhook 200/);
    assert.deepEqual(entitlements('journey@mail.ru'), [{ slug: 'vastu-design-2026', expires_at: '2027-05-09T00:00:00.000Z' }]);
    assert.equal(mailsTo('journey@mail.ru').length, 1);
    assert.equal(purchase(contractId).matched_lava_id, T.discount[1]);
});

test('/buy can pay by СБП, and sends lava return links back to /buy', async () => {
    const make = (method, currency = 'RUB') => fetch(`${app}/api/lava/invoice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sbp@example.com', offerId: T.discount[1], currency, method }),
    });
    assert.equal((await make('sbp')).status, 200);
    let sentToLava = fake.control.lastInvoiceRequest;
    assert.equal(sentToLava.paymentProvider, 'PAY2ME');
    assert.equal(sentToLava.paymentMethod, 'SBP');
    assert.equal(sentToLava.successful_return_url, `${app}/buy/thanks`);
    assert.equal(sentToLava.failure_return_url, `${app}/buy/${T.discount[1]}?currency=RUB&failed=1`);

    await make('card');
    assert.equal(fake.control.lastInvoiceRequest.paymentMethod, undefined, 'card = lava default');
    await make('sbp', 'EUR');
    assert.equal(fake.control.lastInvoiceRequest.paymentMethod, undefined, 'СБП only exists for rubles');

    // The Ukrainian landing opens /buy?lang=uk: lava sends the buyer back in Ukrainian.
    const uk = await fetch(`${app}/api/lava/invoice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ua@example.com', offerId: T.base[1], currency: 'EUR', method: 'card', lang: 'uk' }),
    });
    assert.equal(uk.status, 200);
    sentToLava = fake.control.lastInvoiceRequest;
    assert.equal(sentToLava.successful_return_url, `${app}/buy/thanks?lang=uk`);
    assert.equal(sentToLava.failure_return_url, `${app}/buy/${T.base[1]}?currency=EUR&failed=1&lang=uk`);
    assert.equal(sentToLava.cancel_return_url, `${app}/buy/${T.base[1]}?currency=EUR&lang=uk`);
});

test('webhook rejects a wrong API key', async () => {
    const r = await webhook(paid(BASE_PRODUCT, 'x@example.com'), 'nope');
    assert.equal(r.status, 401);
});

test('«Основной» bought via /buy: account, 6-month access, one welcome email', async () => {
    const { r, contractId } = await buy('base', '  New.Buyer@Mail.RU ');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.course_slugs, ['vastu-design-2026']);

    assert.deepEqual(entitlements('new.buyer@mail.ru'), [{ slug: 'vastu-design-2026', expires_at: '2027-05-09T00:00:00.000Z' }]);
    const p = purchase(contractId);
    assert.equal(p.status, 'granted');
    assert.equal(p.source, 'webhook');
    assert.equal(p.matched_lava_id, T.base[1], 'matched by the offer from lava_invoices');
    assert.ok(p.email_sent_at);

    const mails = mailsTo('new.buyer@mail.ru');
    assert.equal(mails.length, 1);
    const m = mails[0];
    assert.equal(m.from, 'Anna Romeo <hello@annaromeo.design>');
    assert.match(m.html, /<meta name="color-scheme" content="light only" \/>/, 'Gmail dark mode must not repaint it');
    assert.equal(m.subject, 'Добро пожаловать на курс «Васту-дизайн»');
    assert.match(m.html, /Задать пароль и войти/);
    assert.match(m.html, /Старт потока — 9 ноября/);
    assert.match(m.html, /href="https:\/\/t\.me\/\+hphCpJ038x81MzU0"[^>]*>Канал курса</);
    assert.match(m.html, /href="https:\/\/t\.me\/\+HTc2SwoPYRkwYTBk"[^>]*>Чат курса</);
    assert.match(m.text, /Чат курса: https:\/\/t\.me\/\+HTc2SwoPYRkwYTBk/);
    assert.ok(accessLinkIn(m), 'access link in html');
    assert.match(m.text, /\/access\?t=/);
    assert.equal(m.idempotencyKey, `welcome/${contractId}/1`);
});

test('lava retrying the same webhook does not send a second email', async () => {
    const contractId = crypto.randomUUID();
    await webhook(paid(BASE_PRODUCT, 'retry@example.com', contractId));
    await webhook(paid(BASE_PRODUCT, 'retry@example.com', contractId));
    await Promise.all([webhook(paid(BASE_PRODUCT, 'retry@example.com', contractId)), webhook(paid(BASE_PRODUCT, 'retry@example.com', contractId))]);
    assert.equal(mailsTo('retry@example.com').length, 1);
});

test('two deliveries of a brand-new contract at the same instant: both 200, one account, one email', async () => {
    const contractId = crypto.randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => webhook(paid(BASE_PRODUCT, 'burst@example.com', contractId))));
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
    assert.equal([...fake.users.values()].filter((u) => u.email === 'burst@example.com').length, 1);
    assert.equal(mailsTo('burst@example.com').length, 1);
    assert.equal(purchase(contractId).status, 'granted');
});

test('discounted «Основной» product gives exactly what full-price «Основной» gives', async () => {
    const r = await webhook(paid(BASE_DISCOUNT_PRODUCT, 'discount@example.com'));
    assert.equal(r.status, 200);
    assert.deepEqual(entitlements('discount@example.com'), [{ slug: 'vastu-design-2026', expires_at: '2027-05-09T00:00:00.000Z' }]);
    const m = mailsTo('discount@example.com')[0];
    assert.equal(m.subject, 'Добро пожаловать на курс «Васту-дизайн»');
    assert.doesNotMatch(m.html, /Наставничество/);

    // …and a discounted purchase whose webhook never came is found by the poll.
    fake.addInvoice({ email: 'discount-poll@example.com', offerId: T.discount[1], amount: 55000 });
    const run = await (await admin('POST', '/api/cron/reconcile')).json();
    assert.ok(run.fulfilled.some((f) => f.email === 'discount-poll@example.com' && f.emailSent));
    assert.deepEqual(entitlements('discount-poll@example.com').map((e) => e.slug), ['vastu-design-2026']);
});

test('installments: first payment unlocks + welcomes, payments 2–4 are logged without another email', async () => {
    const first = await buy('baseInstall', 'install@example.com');
    assert.equal(first.r.status, 200);
    assert.equal(mailsTo('install@example.com').length, 1);
    assert.deepEqual(entitlements('install@example.com'), [{ slug: 'vastu-design-2026', expires_at: '2027-05-09T00:00:00.000Z' }]);

    const later = [];
    for (let i = 0; i < 3; i++) later.push(await buy('baseInstall', 'install@example.com'));
    assert.deepEqual(later.map((x) => x.r.status), [200, 200, 200]);
    assert.equal(mailsTo('install@example.com').length, 1, 'still just the one welcome email');
    for (const { contractId } of later) {
        assert.equal(purchase(contractId).status, 'granted');
        assert.match(purchase(contractId).email_skipped_reason, /повторная оплата/);
    }
    // …and the poll doesn't keep "retrying" those emails.
    const run = await (await admin('POST', '/api/cron/reconcile')).json();
    assert.ok(!run.retried.some((x) => x.email === 'install@example.com'));
    assert.equal(mailsTo('install@example.com').length, 1);
});

test('Наставничество installments unlock base + pro for a year; an upgrade from Основной is welcomed', async () => {
    await buy('proInstall', 'pro-install@example.com');
    assert.deepEqual(entitlements('pro-install@example.com').map((e) => [e.slug, e.expires_at]), [
        ['vastu-design-2026', '2027-11-09T00:00:00.000Z'],
        ['vastu-design-2026-pro', '2027-11-09T00:00:00.000Z'],
    ]);
    await buy('baseInstallEarly', 'upgrader@example.com');
    await buy('pro', 'upgrader@example.com');
    const mails = mailsTo('upgrader@example.com');
    assert.equal(mails.length, 2, 'the upgrade unlocked the pro course, so it gets its own email');
    assert.match(mails[1].html, /тариф «Наставничество»/);
    assert.deepEqual(entitlements('upgrader@example.com').map((e) => e.expires_at), ['2027-11-09T00:00:00.000Z', '2027-11-09T00:00:00.000Z']);
});

test('a contract that crashed after granting still gets its welcome email on retry', async () => {
    const u = fake.createUser('crashed@example.com');
    const contractId = crypto.randomUUID();
    const base = fake.db.courses.find((x) => x.slug === 'vastu-design-2026');
    fake.seed('user_entitlements', [{ user_id: u.id, course_id: base.id, source: 'lava.top', source_payment_id: contractId, expires_at: '2027-05-09T00:00:00.000Z' }]);
    fake.seed('purchases', [{ contract_id: contractId, email: 'crashed@example.com', lava_ids: [T.base[1]], source: 'webhook', status: 'error', attempts: 1, error: 'simulated crash', updated_at: '2026-10-22T00:00:00Z' }]);
    const run = await (await admin('POST', '/api/cron/reconcile')).json();
    assert.ok(run.retried.some((x) => x.contractId === contractId && x.emailSent));
    assert.equal(mailsTo('crashed@example.com').length, 1);
});

test('«Наставничество» grants base + pro courses for a year', async () => {
    const r = await webhook(paid(PRO_PRODUCT, 'pro@example.com'));
    assert.equal(r.status, 200);
    assert.deepEqual(entitlements('pro@example.com'), [
        { slug: 'vastu-design-2026', expires_at: '2027-11-09T00:00:00.000Z' },
        { slug: 'vastu-design-2026-pro', expires_at: '2027-11-09T00:00:00.000Z' },
    ]);
    assert.equal(mailsTo('pro@example.com')[0].subject, 'Добро пожаловать на курс «Васту-дизайн»');
    assert.match(mailsTo('pro@example.com')[0].html, /тариф «Наставничество»/);
    assert.match(mailsTo('pro@example.com')[0].html, />Канал курса</);
    assert.match(mailsTo('pro@example.com')[0].html, />Чат курса</);
});

test('returning student gets the course added and a "log in as usual" email', async () => {
    const u = fake.createUser('alumna@example.com', { last_sign_in_at: '2026-06-01T10:00:00Z', password: 'old-pass' });
    const r = await webhook(paid(BASE_PRODUCT, 'alumna@example.com'));
    assert.equal(r.status, 200);
    assert.equal([...fake.users.values()].filter((x) => x.email === 'alumna@example.com').length, 1);
    assert.equal(fake.db.user_entitlements.filter((e) => e.user_id === u.id).length, 1);
    const m = mailsTo('alumna@example.com')[0];
    assert.match(m.html, /Входите как обычно/);
    assert.match(m.html, new RegExp(`href="${app}/login"`));
    assert.match(m.html, /Не помню пароль/);
    assert.ok(accessLinkIn(m));
});

test('business VIP bought via /buy (invoice row) maps by offer, lifetime, VIP links only', async () => {
    const contractId = crypto.randomUUID();
    fake.seed('lava_invoices', [{ contract_id: contractId, offer_id: BIZ_VIP_OFFER, email: 'vip@example.com' }]);
    const r = await webhook(paid(BIZ_PRODUCT, 'vip@example.com', contractId));
    assert.equal(r.status, 200);
    assert.deepEqual(entitlements('vip@example.com'), [
        { slug: 'vastu-2', expires_at: null },
        { slug: 'vastu-2-vip', expires_at: null },
    ]);
    const m = mailsTo('vip@example.com')[0];
    assert.match(m.html, /VIP-канал/);
    assert.match(m.html, /VIP-чат/);
    assert.match(m.html, /Общий чат потока/);
    assert.doesNotMatch(m.html, />Канал потока</);
    assert.match(m.html, /тариф «VIP»/);
});

test('unknown product: 200 to lava, logged as unmapped, Tymur alerted', async () => {
    const contractId = crypto.randomUUID();
    const before = mailsTo(ALERTS).length;
    const r = await webhook(paid('99999999-9999-9999-9999-999999999999', 'lost@example.com', contractId));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).reason, 'unknown offer');
    assert.equal(purchase(contractId).status, 'unmapped');
    assert.equal(mailsTo(ALERTS).length, before + 1);
    assert.equal(mailsTo('lost@example.com').length, 0);
});

test('Resend outage: access still granted, failure recorded, poll re-sends the email', async () => {
    const contractId = crypto.randomUUID();
    fake.control.resendFailures = 1;
    const r = await webhook(paid(BASE_PRODUCT, 'outage@example.com', contractId));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).email_sent, false);
    assert.deepEqual(entitlements('outage@example.com').map((e) => e.slug), ['vastu-design-2026']);
    assert.equal(purchase(contractId).email_sent_at, null);
    assert.match(purchase(contractId).email_error, /Resend 500/);
    assert.ok(mailsTo(ALERTS).some((m) => m.subject.includes('письмо покупателю не ушло')));

    const rec = await (await admin('POST', '/api/cron/reconcile')).json();
    assert.ok(rec.retried.some((x) => x.contractId === contractId && x.emailSent));
    assert.equal(mailsTo('outage@example.com').length, 1);
    assert.ok(purchase(contractId).email_sent_at);
});

test('invoice poll fulfils a paid /buy checkout whose webhook never arrived', async () => {
    const fresh = fake.addInvoice({ email: 'silent@example.com', offerId: T.base[1], currency: 'EUR', amount: 817.5 });
    fake.addInvoice({ email: 'before-since@example.com', offerId: T.base[1], datetime: '2026-09-01T09:00:00Z' });
    fake.addInvoice({ email: 'declined@example.com', offerId: T.base[1], status: 'FAILED' });
    fake.addInvoice({ email: 'abandoned@example.com', offerId: T.base[1], status: 'IN_PROGRESS' });

    const dry = await (await admin('POST', '/api/cron/reconcile?dryRun=1')).json();
    assert.deepEqual(dry.pending.map((s) => [s.email, s.offerId]), [['silent@example.com', T.base[1]]]);
    assert.equal(mailsTo('silent@example.com').length, 0, 'dry run sends nothing');
    assert.equal(purchase(fresh), undefined, 'dry run writes nothing');

    const run = await (await admin('POST', '/api/cron/reconcile')).json();
    assert.deepEqual(run.fulfilled.map((f) => [f.email, f.status, f.emailSent]), [['silent@example.com', 'granted', true]]);
    assert.equal(purchase(fresh).source, 'poll');
    assert.equal(purchase(fresh).currency, 'EUR');
    for (const e of ['before-since@example.com', 'declined@example.com', 'abandoned@example.com']) assert.equal(mailsTo(e).length, 0);

    const again = await (await admin('POST', '/api/cron/reconcile')).json();
    assert.equal(again.fulfilled.length, 0);
    assert.equal(mailsTo('silent@example.com').length, 1);
});

test('a paid invoice we have no offer for is flagged, not guessed', async () => {
    const id = fake.addInvoice({ email: 'mystery@example.com', offerId: T.base[1], recorded: false });
    const before = mailsTo(ALERTS).length;
    await admin('POST', '/api/cron/reconcile');
    assert.equal(purchase(id).status, 'unmapped');
    assert.equal(mailsTo('mystery@example.com').length, 0);
    assert.equal(mailsTo(ALERTS).length, before + 1);
});

test('poll and webhook arriving together for one sale send one email', async () => {
    const contractId = fake.addInvoice({ email: 'race@example.com', offerId: T.pro[1] });
    await Promise.all([admin('POST', '/api/cron/reconcile'), webhook(paid(PRO_PRODUCT, 'race@example.com', contractId))]);
    assert.equal(mailsTo('race@example.com').length, 1);
});

test('poll walks every page of lava invoices', async () => {
    fake.control.lavaPageSize = 2;
    try {
        const emails = ['p1@example.com', 'p2@example.com', 'p3@example.com', 'p4@example.com', 'p5@example.com'];
        for (const e of emails) fake.addInvoice({ email: e, offerId: T.base[1] });
        const run = await (await admin('POST', '/api/cron/reconcile')).json();
        assert.deepEqual(run.errors, []);
        for (const e of emails) assert.equal(mailsTo(e).length, 1, e);
    } finally {
        fake.control.lavaPageSize = Infinity;
    }
});

test('/buy shows the tariff: offer lookup knows hidden tariffs, 404s unknown ones', async () => {
    const r = await fetch(`${app}/api/lava/offer/${T.proInstall[1]}`);
    assert.equal(r.status, 200);
    const info = await r.json();
    assert.equal(info.productId, T.proInstall[0]);
    assert.equal(info.prices.RUB, 175000);
    assert.equal((await fetch(`${app}/api/lava/offer/00000000-0000-0000-0000-000000000000`)).status, 404);
});

test('access link mints a fresh recovery token every click and survives a mail scanner', async () => {
    const link = accessLinkIn(mailsTo('new.buyer@mail.ru')[0]);
    const head = await fetch(link, { method: 'HEAD', redirect: 'manual' });
    assert.equal(head.status, 200);

    const scanner = await fetch(link, { redirect: 'manual' });
    const human = await fetch(link, { redirect: 'manual' });
    for (const r of [scanner, human]) {
        assert.equal(r.status, 302);
        assert.match(r.headers.get('location'), new RegExp(`^${app}/update-password\\?token_hash=[0-9a-f]+&type=recovery$`));
    }
    const tokenHash = new URL(human.headers.get('location')).searchParams.get('token_hash');
    const verify = await fetch(`${fakeUrl}/auth/v1/verify`, { method: 'POST', body: JSON.stringify({ type: 'recovery', token_hash: tokenHash }) });
    assert.equal(verify.status, 200, 'the latest token works even though a scanner opened the link first');
});

test('tampered and expired access links land on "send me a new link"', async () => {
    const tampered = await fetch(`${app}/access?t=abc.def`, { redirect: 'manual' });
    assert.equal(tampered.headers.get('location'), `${app}/forgot-password?invalid=1`);
    const old = makeAccessToken(SECRET.access, 'new.buyer@mail.ru', Date.now() - 61 * 24 * 3600 * 1000);
    const expired = await fetch(`${app}/access?t=${old}`, { redirect: 'manual' });
    assert.equal(expired.headers.get('location'), `${app}/forgot-password?expired=1&email=new.buyer%40mail.ru`);
    const forged = makeAccessToken('wrong-secret', 'new.buyer@mail.ru');
    assert.match((await fetch(`${app}/access?t=${forged}`, { redirect: 'manual' })).headers.get('location'), /invalid=1/);
});

test('"send me my link": known address gets course links, unknown gets nothing, both answer the same', async () => {
    const ask = (email) => fetch(`${app}/api/access/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const before = mailsTo('vip@example.com').length;
    const known = await ask('VIP@example.com');
    const unknown = await ask('nobody@example.com');
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json());
    const m = mailsTo('vip@example.com').at(-1);
    assert.equal(mailsTo('vip@example.com').length, before + 1);
    assert.equal(m.subject, 'Ссылка для входа в личный кабинет');
    assert.match(m.html, /VIP-чат/);
    assert.equal(mailsTo('nobody@example.com').length, 0);

    await ask('vip@example.com');
    await ask('vip@example.com');
    assert.equal((await ask('vip@example.com')).status, 429);
});

test('/grant: wrong secret refused; tier grant = purchase grant, with email and a paste-ready link', async () => {
    assert.equal((await admin('POST', '/api/admin/grant-access', { email: 'm@example.com', tier: 'design-base' }, 'bad')).status, 401);
    const tiers = await (await admin('GET', '/api/admin/tiers')).json();
    assert.deepEqual(tiers.tiers.map((t) => t.key), ['design-base', 'design-pro', 'standard', 'vip']);

    const r = await (await admin('POST', '/api/admin/grant-access', { email: 'Manual@Example.com', tier: 'design-pro' })).json();
    assert.equal(r.granted, true);
    assert.deepEqual(r.courses, ['vastu-design-2026', 'vastu-design-2026-pro']);
    assert.equal(r.emailSent, true);
    assert.match(r.loginLink, new RegExp(`^${app}/access\\?t=`));
    assert.deepEqual(entitlements('manual@example.com').map((e) => e.expires_at), ['2027-11-09T00:00:00.000Z', '2027-11-09T00:00:00.000Z']);

    const silent = await (await admin('POST', '/api/admin/grant-access', { email: 'quiet@example.com', tier: 'standard', sendEmail: false })).json();
    assert.equal(silent.granted, true);
    assert.equal(silent.emailSent, false);
    assert.equal(mailsTo('quiet@example.com').length, 0);
    assert.deepEqual(entitlements('quiet@example.com'), [{ slug: 'vastu-2', expires_at: '2026-11-18T00:00:00.000Z' }]);
});

test('admin purchases list + retry re-sends; status reports missing Telegram links', async () => {
    const list = await (await admin('GET', '/api/admin/purchases')).json();
    assert.ok(list.purchases.length >= 8);
    const target = list.purchases.find((p) => p.email === 'pro@example.com');
    const before = mailsTo('pro@example.com').length;
    const retry = await (await admin('POST', '/api/admin/purchases/retry', { contractId: target.contract_id })).json();
    assert.equal(retry.email.sent, true);
    assert.equal(mailsTo('pro@example.com').length, before + 1);

    const status = await (await admin('GET', '/api/admin/status')).json();
    assert.equal(status.reconcile.enabled, true);
    assert.deepEqual(status.missingWelcomeLinks, []);
});

test('the access token never shows up in the server log', () => {
    assert.match(serverProc.output, /\/access\?t=…/);
    assert.doesNotMatch(serverProc.output, /\/access\?t=(?!…)/);
});

// ------------------------------------------------------------- GetCourse

const gk = (params, { method = 'GET', key = SECRET.gk, form = false } = {}) => {
    const q = new URLSearchParams({ key, ...params });
    if (method === 'GET') return fetch(`${app}/api/getcourse/order?${q}`);
    return fetch(`${app}/api/getcourse/order`, form
        ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString() }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...params }) });
};
const entitlementSource = (email) => {
    const u = [...fake.users.values()].find((x) => x.email === email);
    return fake.db.user_entitlements.filter((e) => e.user_id === u.id).map((e) => e.source);
};

test('GetCourse paid order: Основной for 6 months, one welcome email, logged as gk-<order>', async () => {
    const r = await gk({ tier: 'design-base', email: 'GK.Buyer@mail.ru', order: '1001', positions: 'Основной тариф', cost: '75000', paid: '18 750 руб.' });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.granted, true);
    assert.deepEqual(body.courses, ['vastu-design-2026']);
    assert.deepEqual(entitlements('gk.buyer@mail.ru'), [{ slug: 'vastu-design-2026', expires_at: '2027-05-09T00:00:00.000Z' }]);
    assert.deepEqual(entitlementSource('gk.buyer@mail.ru'), ['getcourse']);
    const p = purchase('gk-1001');
    assert.equal(p.status, 'granted');
    assert.equal(p.amount, 75000);
    assert.equal(p.currency, 'RUB');
    assert.equal(mailsTo('gk.buyer@mail.ru').length, 1);
    assert.equal(mailsTo('gk.buyer@mail.ru')[0].subject, 'Добро пожаловать на курс «Васту-дизайн»');

    // The process fires again when the order is fully paid: nothing new.
    const again = await gk({ tier: 'design-base', email: 'gk.buyer@mail.ru', order: '1001', paid: '75000' });
    assert.equal(again.status, 200);
    assert.equal(mailsTo('gk.buyer@mail.ru').length, 1);
});

test('GetCourse without a tier: the offer name decides (VIP-тариф = Наставничество), POST form or JSON', async () => {
    const r = await gk({ email: 'gk-vip@example.com', order: '1002', positions: 'VIP-тариф', cost: '175000' }, { method: 'POST', form: true });
    assert.equal(r.status, 200);
    assert.deepEqual(entitlements('gk-vip@example.com').map((e) => [e.slug, e.expires_at]), [
        ['vastu-design-2026', '2027-11-09T00:00:00.000Z'],
        ['vastu-design-2026-pro', '2027-11-09T00:00:00.000Z'],
    ]);
    assert.match(mailsTo('gk-vip@example.com')[0].html, /тариф «Наставничество»/);

    const mk = await gk({ email: 'gk-mk@example.com', order: '1003', positions: 'Тариф МК' }, { method: 'POST' });
    assert.equal(mk.status, 200);
    assert.deepEqual(entitlements('gk-mk@example.com').map((e) => e.slug), ['vastu-design-2026']);
});

test('GetCourse: wrong key, unpaid order, unfilled variables, unknown offer, a "+" lost in the URL, dry run', async () => {
    assert.equal((await gk({ email: 'x@example.com', order: '1' }, { key: 'nope' })).status, 401);

    // A signed installment still in its cooling-off period: nothing granted,
    // and since GetCourse won't send the order again once it's paid, Tymur
    // hears about it (a dry run tells nobody).
    const beforeUnpaid = mailsTo(ALERTS).length;
    const unpaid = await gk({ tier: 'design-base', email: 'gk-unpaid@example.com', order: '1004', paid: '0 руб.' });
    assert.equal((await unpaid.json()).ignored, true);
    assert.equal(purchase('gk-1004'), undefined);
    assert.deepEqual(entitlements('gk-unpaid@example.com'), []);
    const unpaidAlerts = mailsTo(ALERTS).slice(beforeUnpaid);
    assert.equal(unpaidAlerts.length, 1);
    assert.match(unpaidAlerts[0].subject, /заказ #1004 пришёл без оплаты/);
    assert.match(unpaidAlerts[0].text, /gk-unpaid@example\.com/);
    assert.match(unpaidAlerts[0].text, /Васту-дизайн · Основной/);
    await gk({ positions: 'Тариф МК', email: 'gk-unpaid@example.com', order: '1008', paid: '0', dry: '1' });
    assert.equal(mailsTo(ALERTS).length, beforeUnpaid + 1);

    const alertsBefore = mailsTo(ALERTS).length;
    const raw = await gk({ email: '{object.user.email}', order: '{object.number}' });
    assert.equal(raw.status, 400);

    const odd = await gk({ email: 'gk-odd@example.com', order: '1005', positions: 'Марафон по цвету' });
    assert.equal((await odd.json()).granted, false);
    assert.equal(purchase('gk-1005').status, 'unmapped');
    assert.deepEqual(entitlements('gk-odd@example.com'), []);
    assert.ok(mailsTo(ALERTS).length >= alertsBefore + 2, 'Tymur hears about both');

    // GetCourse may not encode what it substitutes: "a+b@x" arrives as "a b@x".
    await fetch(`${app}/api/getcourse/order?key=${SECRET.gk}&tier=design-base&order=1006&email=anna+gk@example.com`);
    assert.deepEqual(entitlements('anna+gk@example.com').map((e) => e.slug), ['vastu-design-2026']);

    const dry = await (await gk({ email: 'gk-dry@example.com', order: '1007', positions: 'Основной тариф', dry: '1' })).json();
    assert.equal(dry.dryRun, true);
    assert.equal(dry.tier, 'design-base');
    assert.equal(purchase('gk-1007'), undefined);
});

test('the GetCourse key and recovery tokens never show up in the server log', async () => {
    await fetch(`${app}/update-password?token_hash=recovery-secret-123&type=recovery`);
    await new Promise((r) => setTimeout(r, 100));
    assert.match(serverProc.output, /Request: GET \/update-password\?token_hash=…&type=recovery/);
    assert.ok(!serverProc.output.includes('recovery-secret-123'), 'recovery token');
    assert.match(serverProc.output, /\/api\/getcourse\/order\?key=…/);
    assert.ok(!serverProc.output.includes(SECRET.gk), 'GetCourse key');
});

// -------------------------------------------------------------- monobank

const monoOrder = (body) =>
    fetch(`${app}/api/mono/order`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) });
const monoState = (id) => fetch(`${app}/api/mono/order/${id}`).then((r) => r.json());

test('monobank plan: price and payment counts for the page; unpriced plans are not for sale', async () => {
    const r = await fetch(`${app}/api/mono/plan/design-base`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { title: '«Васту-дизайн» · тариф «Основний»', uah: 38000, parts: [3, 4, 6] });
    assert.equal((await fetch(`${app}/api/mono/plan/design-base-mk`)).status, 404, 'no MK price set');
    assert.equal((await fetch(`${app}/api/mono/plan/nonsense`)).status, 404);
});

test('monobank: order -> approved in the app -> callback -> confirmed once -> access + email', async () => {
    const bad = await monoOrder({ plan: 'design-base', email: 'mono@example.com', phone: '12345', parts: 4 });
    assert.equal(bad.status, 400);
    assert.equal((await monoOrder({ plan: 'design-base', email: 'mono@example.com', phone: '0671234567', parts: 5 })).status, 400, 'only the configured counts');

    const r = await monoOrder({ plan: 'design-base', email: ' Mono@Example.com ', phone: '+38 (067) 123-45-67', parts: 4 });
    assert.equal(r.status, 200);
    const { orderId } = await r.json();
    const o = fake.monoOrders.get(orderId);
    assert.equal(o.client_phone, '+380671234567');
    assert.equal(o.total_sum, 38000);
    assert.deepEqual(o.available_programs, [{ type: 'payment_installments', available_parts_count: [4] }]);
    assert.deepEqual(o.products, [{ name: '«Васту-дизайн» · тариф «Основний»', count: 1, sum: 38000 }]);
    assert.equal(o.invoice.source, 'INTERNET');
    assert.equal(o.result_callback, `${app}/api/mono/callback`);

    // The page polls while the buyer hasn't answered yet.
    assert.equal((await monoState(orderId)).state, 'IN_PROCESS');
    assert.deepEqual(entitlements('mono@example.com'), []);

    assert.equal(await fake.monoApprove(orderId), 200);
    assert.equal(o.confirms, 1);
    assert.equal(o.order_sub_state, 'ACTIVE');
    assert.deepEqual(entitlements('mono@example.com'), [{ slug: 'vastu-design-2026', expires_at: '2027-05-09T00:00:00.000Z' }]);
    assert.deepEqual(entitlementSource('mono@example.com'), ['monobank']);
    assert.equal(purchase(`mono-${orderId}`).status, 'granted');
    assert.equal(purchase(`mono-${orderId}`).currency, 'UAH');

    const s = await monoState(orderId);
    assert.equal(s.granted, true);
    assert.equal(mailsTo('mono@example.com').length, 1);
    assert.equal(o.confirms, 1, 'never confirmed twice');
});

test('monobank: a forged callback is refused; the page poll alone confirms and grants', async () => {
    const { orderId } = await (await monoOrder({ plan: 'design-pro', email: 'mono-pro@example.com', phone: '380501112233', parts: 6 })).json();
    assert.equal(await fake.monoApprove(orderId, { signature: 'forged' }), 401);
    assert.equal(fake.monoOrders.get(orderId).confirms, 0);

    const s = await monoState(orderId);
    assert.equal(s.state, 'SUCCESS');
    assert.equal(s.granted, true);
    assert.deepEqual(entitlements('mono-pro@example.com').map((e) => e.slug), ['vastu-design-2026', 'vastu-design-2026-pro']);
});

test('monobank: approved but no callback and the tab closed — the sweep grants it', async () => {
    const { orderId } = await (await monoOrder({ plan: 'design-base', email: 'mono-sweep@example.com', phone: '0931234567', parts: 3 })).json();
    await fake.monoApprove(orderId, { callback: false });
    const run = await (await admin('POST', '/api/cron/mono-sweep')).json();
    assert.ok(run.granted.includes(`mono-${orderId}`));
    assert.equal(mailsTo('mono-sweep@example.com').length, 1);
    const again = await (await admin('POST', '/api/cron/mono-sweep')).json();
    assert.ok(!again.granted.includes(`mono-${orderId}`));
});

test('monobank test order: 10 ₴, approved and confirmed, grants nothing, Tymur hears it passed', async () => {
    const plan = await (await fetch(`${app}/api/mono/plan/test`)).json();
    assert.equal(plan.uah, 10);
    const alertsBefore = mailsTo(ALERTS).length;
    const { orderId } = await (await monoOrder({ plan: 'test', email: 'tester@example.com', phone: '0671234500', parts: 3 })).json();
    const o = fake.monoOrders.get(orderId);
    assert.equal(o.total_sum, 10);
    assert.equal(await fake.monoApprove(orderId), 200);
    assert.equal(o.confirms, 1, 'confirmed like a sale');
    assert.deepEqual(entitlements('tester@example.com'), [], 'no course access');
    assert.equal(purchase(`mono-${orderId}`), undefined);
    const s = await monoState(orderId);
    assert.equal(s.test, true);
    assert.equal(s.state, 'SUCCESS');
    assert.ok(mailsTo(ALERTS).slice(alertsBefore).some((m) => /тестовий договір пройшов/.test(m.subject)));
    assert.equal(mailsTo('tester@example.com').length, 0);
    assert.equal((await fetch(`${app}/api/mono/plan/constructor`)).status, 404, 'no prototype keys as plans');
});

test('monobank says no: the buyer reads why, nothing is granted; a refused setup alerts Tymur', async () => {
    const { orderId } = await (await monoOrder({ plan: 'design-base', email: 'mono-limit@example.com', phone: '0661234567', parts: 4 })).json();
    await fake.monoFail(orderId, 'EXCEEDED_SUM_LIMIT');
    const s = await monoState(orderId);
    assert.equal(s.state, 'FAIL');
    assert.match(s.message, /ліміт/);
    assert.deepEqual(entitlements('mono-limit@example.com'), []);

    const alertsBefore = mailsTo(ALERTS).length;
    fake.control.monoCreateFail = 'PAY_PARTS_ARE_NOT_ACCEPTABLE';
    const r = await monoOrder({ plan: 'design-base', email: 'mono-parts@example.com', phone: '0671112233', parts: 6 });
    fake.control.monoCreateFail = null;
    assert.equal(r.status, 402);
    assert.ok(mailsTo(ALERTS).length > alertsBefore);
});
