// Tests for «Васту для бизнеса» evergreen sales (recorded course all year) +
// 6-month Telegram support chat bot:
//   - purchase-relative expiry (old offers unchanged; new offers = paid_at + 6m)
//   - support_chat_access entitlement (idempotent per purchase, repeat purchase keeps both)
//   - welcome email (self has no chat/stream links; support has deep-link button + date; VIP & design unchanged)
//   - GetCourse tier=biz-self|biz-support (configured vs unset env -> unmapped + alert)
//   - Telegram bot webhook (/start flows, secret header 401, chat_member join tracking, setWebhook)
//   - Hourly cron (T-7d reminder once, expiry ban+unban+goodbye, owner/admin untouched, never-joined note, dry-run, off)
//   - Admin status endpoint (counts, next 20 expiries, no tokens leaked)
//
// Runs completely against local fakes (test/fake-services.mjs); fake Telegram
// calls are recorded, never sent externally.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createFakeServices } from './fake-services.mjs';
import {
    TG_GENERAL_CHAT_URL,
    TG_STANDARD_CHANNEL_URL,
    availableGrantTiers,
    buildWelcomeEmail,
    computeExpiresAt,
    createFulfilment,
    formatDateRu,
    getcourseTier,
    resolveGrantTier,
} from '../fulfilment.js';
import {
    SUPPORT_CHAT_MESSAGES,
    createSupportChat,
    makeSupportTelegramClient,
    readSupportChatConfig,
} from '../supportChat.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const BIZ_STD_OFFER = 'caa3c132-dca3-438d-b424-eafff3dd3033';
const BIZ_VIP_OFFER = '1daaffb0-e3aa-44a9-98f6-5e1a986a79b3';
const BIZ_SELF_OFFER = 'aaaaaaaa-1111-4111-8111-111111111111';
const BIZ_SUPPORT_OFFER = 'bbbbbbbb-2222-4222-8222-222222222222';
const DESIGN_BASE_OFFER = '4d14d633-0578-4ce8-8ad6-2d85bc3e0c49';
const BOT_TOKEN = '123456:fake-support-token';
const BOT_USERNAME = 'anna_biz_support_bot';
const CHAT_ID = '-1005556667778';
const WEBHOOK_SECRET = 'tg-webhook-secret-xyz';
const CRON_SECRET = 'cron-secret-biz';
const GK_KEY = 'gk-secret-biz';
const HOOK_KEY = 'lava-hook-biz';
const ALERTS = 'alerts@example.com';

// ---------------------------------------------------------------------------
// 1. Unit tests: expiry, tiers, GetCourse parsing, welcome email
// ---------------------------------------------------------------------------

test('computeExpiresAt: old Standard (caa3c132) and VIP (1daaffb0) keep exact existing behaviour; purchase offers expire paid_at + 6m', () => {
    const bizCourse = {
        slug: 'vastu-2',
        starts_at: '2026-05-18T00:00:00+00:00',
        access_duration_months: 6,
    };
    const nowToday = '2026-11-19T12:00:00.000Z';

    // Old Standard offer (access_from defaults to 'course_start')
    const oldStd = {
        lava_offer_id: BIZ_STD_OFFER,
        is_lifetime: false,
        access_months: null,
        access_from: 'course_start',
        courses: bizCourse,
    };
    assert.equal(computeExpiresAt(oldStd, nowToday), '2026-11-18T00:00:00.000Z');
    // Also when access_from is omitted (legacy row shape)
    assert.equal(computeExpiresAt({ lava_offer_id: BIZ_STD_OFFER, is_lifetime: false, courses: bizCourse }, nowToday), '2026-11-18T00:00:00.000Z');

    // Old VIP offer (lifetime)
    const oldVip = {
        lava_offer_id: BIZ_VIP_OFFER,
        is_lifetime: true,
        access_months: null,
        access_from: 'course_start',
        courses: bizCourse,
    };
    assert.equal(computeExpiresAt(oldVip, nowToday), null);

    // New evergreen offers: access_from = 'purchase', access_months = 6
    const newSelf = {
        lava_offer_id: BIZ_SELF_OFFER,
        is_lifetime: false,
        access_months: 6,
        access_from: 'purchase',
        courses: bizCourse,
    };
    const selfExp = computeExpiresAt(newSelf, nowToday);
    assert.equal(selfExp, '2027-05-19T12:00:00.000Z');
    assert.ok(Date.parse(selfExp) > Date.parse(nowToday), 'purchase today is active');

    // Falls back to course.access_duration_months when offer.access_months is null
    const fallbackMonths = {
        lava_offer_id: BIZ_SUPPORT_OFFER,
        is_lifetime: false,
        access_months: null,
        access_from: 'purchase',
        courses: bizCourse,
    };
    assert.equal(computeExpiresAt(fallbackMonths, nowToday), '2027-05-19T12:00:00.000Z');
});

test('GRANT_TIERS and getcourseTier: biz tiers hidden when env unset, explicit only in GetCourse', () => {
    const emptyEnv = {};
    assert.deepEqual(
        availableGrantTiers(emptyEnv).map((t) => t.key),
        ['design-base', 'design-pro', 'standard', 'vip']
    );
    assert.equal(resolveGrantTier('biz-self', emptyEnv), null);
    assert.equal(resolveGrantTier('biz-support', emptyEnv), null);

    const configuredEnv = {
        BIZ_SELF_LAVA_OFFER: BIZ_SELF_OFFER,
        BIZ_SUPPORT_LAVA_OFFER: BIZ_SUPPORT_OFFER,
    };
    assert.deepEqual(
        availableGrantTiers(configuredEnv).map((t) => t.key),
        ['design-base', 'design-pro', 'standard', 'vip', 'biz-self', 'biz-support']
    );
    assert.equal(resolveGrantTier('biz-self', configuredEnv)?.lavaId, BIZ_SELF_OFFER);
    assert.equal(resolveGrantTier('Васту для бизнеса · С поддержкой', configuredEnv)?.key, 'biz-support');

    // GetCourse accepts explicit tier=biz-self / tier=biz-support, never infers from offer names
    assert.equal(getcourseTier({ tier: 'biz-self', positions: '' }), 'biz-self');
    assert.equal(getcourseTier({ tier: 'biz-support', positions: '' }), 'biz-support');
    assert.equal(getcourseTier({ tier: '', positions: 'Васту для бизнеса · С поддержкой 50 000' }), null);
    assert.equal(getcourseTier({ tier: '', positions: 'Васту для бизнеса · Самостоятельно 35 000' }), null);
    // Existing design rules untouched
    assert.equal(getcourseTier({ tier: '', positions: 'Основной тариф' }), 'design-base');
    assert.equal(getcourseTier({ tier: '', positions: 'VIP-тариф' }), 'design-pro');
});

test('welcome email: self has no chat button and no stream links; support has button with token + date; VIP and design unchanged', () => {
    const biz = [{ slug: 'vastu-2', title: 'Васту для бизнеса' }];
    const vip = [
        { slug: 'vastu-2', title: 'Васту для бизнеса' },
        { slug: 'vastu-2-vip', title: 'Васту для бизнеса · VIP' },
    ];
    const design = [{ slug: 'vastu-design-2026', title: 'Васту-дизайн' }];

    const selfMail = buildWelcomeEmail({
        email: 'self@example.com',
        courses: biz,
        accessUrl: 'https://lk.example.com/access?t=abc',
        loginUrl: 'https://lk.example.com/login',
        returning: false,
    });
    assert.doesNotMatch(selfMail.html, /Войти в чат поддержки/);
    assert.doesNotMatch(selfMail.html, /Поддержка в чате/);
    assert.doesNotMatch(selfMail.html, /Канал потока/);
    assert.doesNotMatch(selfMail.html, /Чат потока/);
    assert.ok(!selfMail.html.includes(TG_STANDARD_CHANNEL_URL));
    assert.ok(!selfMail.html.includes(TG_GENERAL_CHAT_URL));
    assert.ok(!selfMail.html.includes(BOT_USERNAME));
    assert.doesNotMatch(selfMail.text, /Войти в чат поддержки/);
    assert.doesNotMatch(selfMail.text, /Канал потока|Чат потока/);
    assert.ok(!selfMail.text.includes(TG_STANDARD_CHANNEL_URL));
    assert.ok(!selfMail.text.includes(TG_GENERAL_CHAT_URL));

    const token = 'tok_sample_abc123';
    const supportMail = buildWelcomeEmail({
        email: 'sup@example.com',
        courses: biz,
        accessUrl: 'https://lk.example.com/access?t=abc',
        loginUrl: 'https://lk.example.com/login',
        returning: false,
        supportChat: {
            url: `https://t.me/${BOT_USERNAME}?start=${token}`,
            expiresAt: '2027-05-19T12:00:00.000Z',
            months: 6,
        },
    });
    assert.match(supportMail.html, new RegExp(`href="https://t\\.me/${BOT_USERNAME}\\?start=${token}"[^>]*>Войти в чат поддержки<`));
    assert.match(supportMail.html, /Поддержка в чате — 6 месяцев с даты покупки, до 19\.05\.2027\./);
    assert.doesNotMatch(supportMail.html, /Канал потока|Чат потока/);
    assert.ok(!supportMail.html.includes(TG_STANDARD_CHANNEL_URL));
    assert.ok(!supportMail.html.includes(TG_GENERAL_CHAT_URL));
    assert.match(supportMail.text, new RegExp(`Войти в чат поддержки: https://t\\.me/${BOT_USERNAME}\\?start=${token}`));
    assert.match(supportMail.text, /Поддержка в чате — 6 месяцев с даты покупки, до 19\.05\.2027\./);

    // VIP unchanged
    const vipMail = buildWelcomeEmail({
        email: 'vip@example.com',
        courses: vip,
        accessUrl: 'https://lk.example.com/access?t=abc',
        loginUrl: 'https://lk.example.com/login',
        returning: false,
    });
    assert.match(vipMail.html, /VIP-канал/);
    assert.match(vipMail.html, /VIP-чат/);
    assert.match(vipMail.html, /Общий чат потока/);
    assert.doesNotMatch(vipMail.html, /Войти в чат поддержки/);

    // Design unchanged
    const designMail = buildWelcomeEmail({
        email: 'des@example.com',
        courses: design,
        accessUrl: 'https://lk.example.com/access?t=abc',
        loginUrl: 'https://lk.example.com/login',
        returning: false,
    });
    assert.match(designMail.html, /Канал курса/);
    assert.match(designMail.html, /Чат курса/);
    assert.match(designMail.html, /Старт потока — 9 ноября/);
    assert.doesNotMatch(designMail.html, /Войти в чат поддержки/);
});

// ---------------------------------------------------------------------------
// 2. In-process service tests: supportChat bot + cron with controlled clock
// ---------------------------------------------------------------------------

function makeSupportWorld({ mode = 'live', nowMs = Date.parse('2026-11-19T12:00:00Z') } = {}) {
    let clock = nowMs;
    const fake = createFakeServices();
    const sb = createClient('http://fake.test', 'service-role', {
        global: { fetch: fake.fetch },
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const bizCourse = {
        id: crypto.randomUUID(),
        slug: 'vastu-2',
        title: 'Васту для бизнеса',
        starts_at: '2026-05-18T00:00:00+00:00',
        access_duration_months: 6,
        is_active: true,
    };
    fake.seed('courses', [bizCourse]);
    fake.seed('course_offers', [
        { course_id: bizCourse.id, lava_offer_id: BIZ_STD_OFFER, is_lifetime: false, access_from: 'course_start' },
        { course_id: bizCourse.id, lava_offer_id: BIZ_SELF_OFFER, access_months: 6, access_from: 'purchase', support_chat_months: null },
        { course_id: bizCourse.id, lava_offer_id: BIZ_SUPPORT_OFFER, access_months: 6, access_from: 'purchase', support_chat_months: 6 },
    ]);

    const env = {
        BIZ_SELF_LAVA_OFFER: BIZ_SELF_OFFER,
        BIZ_SUPPORT_LAVA_OFFER: BIZ_SUPPORT_OFFER,
        SUPPORT_CHAT: mode,
        SUPPORT_CHAT_BOT_TOKEN: BOT_TOKEN,
        SUPPORT_CHAT_BOT_USERNAME: BOT_USERNAME,
        SUPPORT_CHAT_ID: CHAT_ID,
        TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };
    const config = readSupportChatConfig(env);
    const telegram = makeSupportTelegramClient({
        token: config.botToken,
        base: 'http://fake.test',
        fetchFn: fake.fetch,
    });
    const logs = [];
    const log = {
        log: (...a) => logs.push(a.join(' ')),
        warn: (...a) => logs.push(a.join(' ')),
        error: (...a) => logs.push(a.join(' ')),
    };
    const bot = createSupportChat({
        getSupabase: () => sb,
        telegram,
        config,
        appUrl: 'https://lk.annaromeovastu.com',
        log,
        now: () => clock,
    });
    const fulfilment = createFulfilment({
        getSupabase: () => sb,
        sendEmail: async (mail) => {
            const resp = await fake.fetch('http://fake.test/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mail),
            });
            return (await resp.json()).id;
        },
        appUrl: 'https://lk.annaromeovastu.com',
        accessSecret: 'acc-secret',
        alertEmail: ALERTS,
        supportChatBotUsername: BOT_USERNAME,
        env,
        fetchFn: fake.fetch,
    });

    return {
        fake,
        sb,
        bot,
        fulfilment,
        logs,
        bizCourse,
        setNow: (iso) => { clock = Date.parse(iso); },
        getNow: () => clock,
    };
}

test('fulfilment creates one support_chat_access row for support (idempotent), none for self, and keeps both on repeat purchase', async () => {
    const w = makeSupportWorld();

    // Self purchase -> no support_chat_access row
    await w.fulfilment.fulfil({
        contractId: 'c-self-1',
        email: 'self@example.com',
        lavaIds: [BIZ_SELF_OFFER],
        source: 'webhook',
        paidAt: '2026-11-19T12:00:00Z',
    });
    assert.equal(w.fake.db.support_chat_access.length, 0);
    const selfEnt = w.fake.db.user_entitlements.find((e) => e.source_payment_id === 'c-self-1');
    assert.equal(selfEnt.expires_at, '2027-05-19T12:00:00.000Z');

    // Support purchase processed twice (webhook + poll) -> exactly one row
    await Promise.all([
        w.fulfilment.fulfil({
            contractId: 'c-sup-1',
            email: 'buyer@example.com',
            lavaIds: [BIZ_SUPPORT_OFFER],
            source: 'webhook',
            paidAt: '2026-11-19T10:00:00Z',
        }),
        w.fulfilment.fulfil({
            contractId: 'c-sup-1',
            email: 'buyer@example.com',
            lavaIds: [BIZ_SUPPORT_OFFER],
            source: 'poll',
            paidAt: '2026-11-19T10:00:00Z',
        }),
    ]);
    assert.equal(w.fake.db.support_chat_access.length, 1);
    const firstRow = w.fake.db.support_chat_access[0];
    assert.equal(firstRow.contract_id, 'c-sup-1');
    assert.equal(firstRow.starts_at, '2026-11-19T10:00:00.000Z');
    assert.equal(firstRow.expires_at, '2027-05-19T10:00:00.000Z');
    assert.match(firstRow.join_token, /^[A-Za-z0-9_-]{20,64}$/);
    assert.equal(w.fake.sent.filter((m) => m.to === 'buyer@example.com').length, 1);

    // Same email buys again later -> new row from new purchase, both kept, new welcome email sent
    await w.fulfilment.fulfil({
        contractId: 'c-sup-2',
        email: 'buyer@example.com',
        lavaIds: [BIZ_SUPPORT_OFFER],
        source: 'webhook',
        paidAt: '2027-06-01T08:00:00Z',
    });
    assert.equal(w.fake.db.support_chat_access.length, 2);
    const secondRow = w.fake.db.support_chat_access.find((r) => r.contract_id === 'c-sup-2');
    assert.equal(secondRow.starts_at, '2027-06-01T08:00:00.000Z');
    assert.equal(secondRow.expires_at, '2027-12-01T08:00:00.000Z');
    assert.notEqual(secondRow.join_token, firstRow.join_token);
    const buyerMails = w.fake.sent.filter((m) => m.to === 'buyer@example.com');
    assert.equal(buyerMails.length, 2);
    assert.ok(buyerMails[1].html.includes(secondRow.join_token));
});

test('bot /start: good token binds + sends 24h single-use invite; second /start revokes old link; another user / expired / unknown handled politely', async () => {
    const w = makeSupportWorld({ mode: 'live', nowMs: Date.parse('2026-11-19T12:00:00Z') });

    const activeRow = {
        id: crypto.randomUUID(),
        email: 'ok@example.com',
        contract_id: 'c-1',
        starts_at: '2026-11-19T12:00:00.000Z',
        expires_at: '2027-05-19T12:00:00.000Z',
        join_token: 'valid_tok_111',
    };
    const expiredRow = {
        id: crypto.randomUUID(),
        email: 'old@example.com',
        contract_id: 'c-2',
        starts_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-07-01T00:00:00.000Z',
        join_token: 'expired_tok_222',
    };
    w.fake.seed('support_chat_access', [activeRow, expiredRow]);

    const sendStart = (fromId, text) =>
        w.bot.handleUpdate({
            message: {
                chat: { id: fromId, type: 'private' },
                from: { id: fromId },
                text,
            },
        });

    // 1. Good token -> binds user 1001, creates 24h member_limit=1 invite link, sends button
    await sendStart(1001, '/start valid_tok_111');
    const rowAfter1 = w.fake.db.support_chat_access.find((r) => r.id === activeRow.id);
    assert.equal(rowAfter1.telegram_user_id, 1001);
    assert.ok(rowAfter1.invite_link);
    assert.ok(rowAfter1.invited_at);

    const create1 = w.fake.telegramCalls.find((c) => c.method === 'createChatInviteLink');
    assert.equal(create1.payload.chat_id, CHAT_ID);
    assert.equal(create1.payload.name, `support-${activeRow.id}`);
    assert.equal(create1.payload.member_limit, 1);
    const expectedExp = Math.floor(w.getNow() / 1000) + 24 * 3600;
    assert.ok(Math.abs(create1.payload.expire_date - expectedExp) <= 5, 'expire_date is ~now+24h');

    const msg1 = w.fake.telegramCalls.find((c) => c.method === 'sendMessage' && c.payload.chat_id === 1001);
    assert.match(msg1.payload.text, /ссылка одноразовая и действует сутки/i);
    assert.deepEqual(msg1.payload.reply_markup, {
        inline_keyboard: [[{ text: 'Войти в чат', url: rowAfter1.invite_link }]],
    });

    const firstInvite = rowAfter1.invite_link;

    // 2. Another user (2002) tries the same token -> refused politely, no new invite link
    const callsBeforeOther = w.fake.telegramCalls.length;
    await sendStart(2002, '/start valid_tok_111');
    const otherCalls = w.fake.telegramCalls.slice(callsBeforeOther);
    assert.equal(otherCalls.filter((c) => c.method === 'createChatInviteLink').length, 0);
    assert.equal(otherCalls.length, 1);
    assert.equal(otherCalls[0].method, 'sendMessage');
    assert.equal(otherCalls[0].payload.text, SUPPORT_CHAT_MESSAGES.otherAccount);
    assert.equal(w.fake.db.support_chat_access.find((r) => r.id === activeRow.id).telegram_user_id, 1001);

    // 3. Same user (1001) runs /start again -> previous link revoked, new link created and sent
    const callsBeforeSecond = w.fake.telegramCalls.length;
    await sendStart(1001, '/start valid_tok_111');
    const secondCalls = w.fake.telegramCalls.slice(callsBeforeSecond);
    assert.equal(secondCalls[0].method, 'revokeChatInviteLink');
    assert.equal(secondCalls[0].payload.invite_link, firstInvite);
    assert.ok(w.fake.telegramRevokedLinks.has(firstInvite));
    assert.equal(secondCalls[1].method, 'createChatInviteLink');
    assert.equal(secondCalls[2].method, 'sendMessage');
    const rowAfter2 = w.fake.db.support_chat_access.find((r) => r.id === activeRow.id);
    assert.notEqual(rowAfter2.invite_link, firstInvite);
    assert.equal(secondCalls[2].payload.reply_markup.inline_keyboard[0][0].url, rowAfter2.invite_link);

    // 4. Expired token -> polite message with expiry date, no invite link
    const callsBeforeExp = w.fake.telegramCalls.length;
    await sendStart(3003, '/start expired_tok_222');
    const expCalls = w.fake.telegramCalls.slice(callsBeforeExp);
    assert.equal(expCalls.filter((c) => c.method === 'createChatInviteLink').length, 0);
    assert.equal(expCalls[0].payload.text, SUPPORT_CHAT_MESSAGES.expired('01.07.2026'));

    // 5. Unknown token -> polite «ссылка не найдена» with support contact
    const callsBeforeUnk = w.fake.telegramCalls.length;
    await sendStart(4004, '/start totally_unknown');
    const unkCalls = w.fake.telegramCalls.slice(callsBeforeUnk);
    assert.equal(unkCalls.filter((c) => c.method === 'createChatInviteLink').length, 0);
    assert.equal(unkCalls[0].payload.text, SUPPORT_CHAT_MESSAGES.notFound);
    assert.match(unkCalls[0].payload.text, /@tymuron/);
});

test('chat_member update: join via support-<id> sets joined_at; other joins do nothing', async () => {
    const w = makeSupportWorld({ mode: 'live' });
    const rowId = crypto.randomUUID();
    w.fake.seed('support_chat_access', [{
        id: rowId,
        email: 'joiner@example.com',
        contract_id: 'c-join-1',
        starts_at: '2026-11-19T12:00:00.000Z',
        expires_at: '2027-05-19T12:00:00.000Z',
        join_token: 'join_tok_1',
        telegram_user_id: 5005,
    }]);

    // Joining without a support-<id> link does nothing
    await w.bot.handleUpdate({
        chat_member: {
            chat: { id: Number(CHAT_ID), type: 'supergroup' },
            date: 1795090000,
            old_chat_member: { user: { id: 5005 }, status: 'left' },
            new_chat_member: { user: { id: 5005 }, status: 'member' },
            invite_link: { name: 'manual-invite', invite_link: 'https://t.me/+other' },
        },
    });
    assert.equal(w.fake.db.support_chat_access.find((r) => r.id === rowId).joined_at, null);

    // Joining via support-<rowId> sets joined_at
    await w.bot.handleUpdate({
        chat_member: {
            chat: { id: Number(CHAT_ID), type: 'supergroup' },
            date: 1795090123,
            old_chat_member: { user: { id: 5005 }, status: 'left' },
            new_chat_member: { user: { id: 5005 }, status: 'member' },
            invite_link: { name: `support-${rowId}`, invite_link: 'https://t.me/+fake_1' },
        },
    });
    assert.equal(
        w.fake.db.support_chat_access.find((r) => r.id === rowId).joined_at,
        new Date(1795090123 * 1000).toISOString()
    );
});

test('cron: T-7d reminder sent once; expiry sends goodbye + ban + unban(only_if_banned); owner/admin untouched; never-joined gets note', async () => {
    const w = makeSupportWorld({ mode: 'live', nowMs: Date.parse('2027-05-12T12:00:00Z') });

    const rRemind = {
        id: crypto.randomUUID(),
        email: 'remind@example.com',
        contract_id: 'c-rem',
        starts_at: '2026-11-19T12:00:00.000Z',
        expires_at: '2027-05-19T12:00:00.000Z', // exactly 7 days ahead
        join_token: 'tok-rem',
        telegram_user_id: 7001,
        joined_at: '2026-11-19T13:00:00.000Z',
    };
    const rExpiredMember = {
        id: crypto.randomUUID(),
        email: 'exp-member@example.com',
        contract_id: 'c-exp-m',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: '2027-05-01T00:00:00.000Z', // already expired
        join_token: 'tok-exp-m',
        telegram_user_id: 7002,
        joined_at: '2026-11-01T01:00:00.000Z',
    };
    const rAdmin = {
        id: crypto.randomUUID(),
        email: 'admin@example.com',
        contract_id: 'c-exp-adm',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: '2027-05-01T00:00:00.000Z',
        join_token: 'tok-adm',
        telegram_user_id: 7003,
        joined_at: '2026-11-01T01:00:00.000Z',
    };
    const rOwner = {
        id: crypto.randomUUID(),
        email: 'owner@example.com',
        contract_id: 'c-exp-own',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: '2027-05-01T00:00:00.000Z',
        join_token: 'tok-own',
        telegram_user_id: 7004,
        joined_at: '2026-11-01T01:00:00.000Z',
    };
    const rNeverJoined = {
        id: crypto.randomUUID(),
        email: 'ghost@example.com',
        contract_id: 'c-exp-ghost',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: '2027-05-01T00:00:00.000Z',
        join_token: 'tok-ghost',
        telegram_user_id: null,
        joined_at: null,
    };
    w.fake.seed('support_chat_access', [rRemind, rExpiredMember, rAdmin, rOwner, rNeverJoined]);
    w.fake.setChatMemberStatus(CHAT_ID, 7002, 'member');
    w.fake.setChatMemberStatus(CHAT_ID, 7003, 'administrator');
    w.fake.setChatMemberStatus(CHAT_ID, 7004, 'creator');

    const run1 = await w.bot.run();
    assert.equal(run1.reminders.length, 1);
    assert.equal(run1.reminders[0].id, rRemind.id);
    assert.equal(run1.removals.length, 1);
    assert.equal(run1.removals[0].id, rExpiredMember.id);
    assert.deepEqual(run1.skippedAdmin.map((x) => x.telegram_user_id).sort(), [7003, 7004]);
    assert.equal(run1.skippedNeverJoined.length, 1);
    assert.equal(run1.skippedNeverJoined[0].id, rNeverJoined.id);

    // Check reminder message & DB stamp
    const remMsg = w.fake.telegramCalls.find((c) => c.method === 'sendMessage' && c.payload.chat_id === 7001);
    assert.equal(
        remMsg.payload.text,
        'Через неделю, 19.05.2027, заканчиваются 6 месяцев поддержки в чате курса «Васту для бизнеса». Если остались вопросы, задайте их в чате до этой даты.'
    );
    assert.ok(w.fake.db.support_chat_access.find((r) => r.id === rRemind.id).reminder_sent_at);

    // Check expired member: goodbye DM, then banChatMember, then unbanChatMember(only_if_banned: true)
    const memberCalls = w.fake.telegramCalls.filter(
        (c) => c.payload.chat_id === 7002 || c.payload.user_id === 7002
    );
    assert.deepEqual(
        memberCalls.map((c) => c.method),
        ['getChatMember', 'sendMessage', 'banChatMember', 'unbanChatMember']
    );
    assert.equal(
        memberCalls[1].payload.text,
        'Сегодня закончились 6 месяцев поддержки в чате курса «Васту для бизнеса», поэтому бот выводит вас из чата. Спасибо, что были с нами 💛'
    );
    assert.equal(memberCalls[3].payload.only_if_banned, true);
    assert.ok(w.fake.db.support_chat_access.find((r) => r.id === rExpiredMember.id).removed_at);

    // Admin and owner untouched: only getChatMember called, no DM/ban/unban, removed_at stays null
    for (const uid of [7003, 7004]) {
        const calls = w.fake.telegramCalls.filter((c) => c.payload.chat_id === uid || c.payload.user_id === uid);
        assert.deepEqual(calls.map((c) => c.method), ['getChatMember']);
    }
    assert.equal(w.fake.db.support_chat_access.find((r) => r.id === rAdmin.id).removed_at, null);
    assert.equal(w.fake.db.support_chat_access.find((r) => r.id === rOwner.id).removed_at, null);

    // Never joined: removed_at set with note, no Telegram calls
    const ghostRow = w.fake.db.support_chat_access.find((r) => r.id === rNeverJoined.id);
    assert.ok(ghostRow.removed_at);
    assert.match(ghostRow.removed_note, /never joined/i);

    // Second cron run: reminder NOT sent a second time, already-removed member NOT banned again
    const callsBeforeRun2 = w.fake.telegramCalls.length;
    const run2 = await w.bot.run();
    assert.equal(run2.reminders.length, 0);
    assert.equal(run2.removals.length, 0);
    const run2Calls = w.fake.telegramCalls.slice(callsBeforeRun2);
    assert.equal(run2Calls.filter((c) => c.method === 'sendMessage').length, 0);
    assert.equal(run2Calls.filter((c) => c.method === 'banChatMember').length, 0);
});

test('cron dry-run and off: dry-run logs and sends/writes nothing; off does nothing', async () => {
    const seedRows = () => [
        {
            id: crypto.randomUUID(),
            email: 'rem@example.com',
            contract_id: 'c-d1',
            starts_at: '2026-11-19T00:00:00.000Z',
            expires_at: '2027-05-18T00:00:00.000Z',
            join_token: 'tok-d1',
            telegram_user_id: 8001,
        },
        {
            id: crypto.randomUUID(),
            email: 'exp@example.com',
            contract_id: 'c-d2',
            starts_at: '2026-10-01T00:00:00.000Z',
            expires_at: '2027-04-01T00:00:00.000Z',
            join_token: 'tok-d2',
            telegram_user_id: 8002,
        },
    ];

    // dry-run
    const dry = makeSupportWorld({ mode: 'dry-run', nowMs: Date.parse('2027-05-12T12:00:00Z') });
    dry.fake.seed('support_chat_access', seedRows());
    const dryRes = await dry.bot.run();
    assert.equal(dryRes.mode, 'dry-run');
    assert.equal(dryRes.dryRun, true);
    assert.equal(dryRes.reminders.length, 1);
    assert.equal(dryRes.removals.length, 1);
    assert.equal(dry.fake.telegramCalls.length, 0, 'dry-run sends nothing to Telegram');
    assert.ok(dry.fake.db.support_chat_access.every((r) => r.reminder_sent_at === null && r.removed_at === null), 'dry-run writes nothing');
    assert.ok(dry.logs.some((l) => l.includes('[dry-run]')));

    // off
    const off = makeSupportWorld({ mode: 'off', nowMs: Date.parse('2027-05-12T12:00:00Z') });
    off.fake.seed('support_chat_access', seedRows());
    const offRes = await off.bot.run();
    assert.equal(offRes.mode, 'off');
    assert.equal(offRes.skipped, true);
    assert.equal(off.fake.telegramCalls.length, 0);
    assert.ok(off.fake.db.support_chat_access.every((r) => r.reminder_sent_at === null && r.removed_at === null));
});

test('config token fallback, poll/manual timestamps, renewal protection in cron, and next-20 cap without tokens', async () => {
    // SUPPORT_CHAT_BOT_TOKEN falls back to TELEGRAM_BOT_TOKEN
    const cfgFallback = readSupportChatConfig({
        SUPPORT_CHAT: 'live',
        TELEGRAM_BOT_TOKEN: 'shared-tg-token',
        SUPPORT_CHAT_BOT_USERNAME: '@anna_bot',
        SUPPORT_CHAT_ID: CHAT_ID,
        TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
    assert.equal(cfgFallback.botToken, 'shared-tg-token');
    assert.equal(cfgFallback.botUsername, 'anna_bot');
    assert.deepEqual(cfgFallback.problems, []);

    // Poll uses invoice datetime; manual /grant uses now
    const w = makeSupportWorld({ mode: 'live', nowMs: Date.parse('2027-05-20T12:00:00Z') });
    const pollPaidAt = '2026-11-25T09:15:00.000Z';
    const invId = w.fake.addInvoice({ email: 'poll-sup@example.com', offerId: BIZ_SUPPORT_OFFER, datetime: pollPaidAt, amount: 50000 });
    const fulfilWithPoll = createFulfilment({
        getSupabase: () => w.sb,
        sendEmail: async (mail) => {
            const resp = await w.fake.fetch('http://fake.test/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mail),
            });
            return (await resp.json()).id;
        },
        appUrl: 'https://lk.annaromeovastu.com',
        accessSecret: 'acc-secret',
        alertEmail: ALERTS,
        lavaApiKey: 'lava-test-key',
        lavaBase: 'http://fake.test',
        reconcileSince: '2026-11-01T00:00:00Z',
        supportChatBotUsername: BOT_USERNAME,
        env: { BIZ_SELF_LAVA_OFFER: BIZ_SELF_OFFER, BIZ_SUPPORT_LAVA_OFFER: BIZ_SUPPORT_OFFER },
        fetchFn: w.fake.fetch,
    });
    // Patch global fetch isn't needed for direct fulfil + grantByTier; test grantByTier uses now
    const beforeGrant = Date.now();
    const granted = await fulfilWithPoll.grantByTier({ email: 'manual-biz@example.com', tier: 'biz-support', sendEmail: true });
    assert.equal(granted.status, 200);
    assert.equal(granted.body.granted, true);
    const manualSc = w.fake.db.support_chat_access.find((r) => r.email === 'manual-biz@example.com');
    assert.ok(manualSc);
    assert.ok(Date.parse(manualSc.starts_at) >= beforeGrant - 2000);
    assert.ok(Date.parse(manualSc.expires_at) > beforeGrant + 150 * 24 * 3600 * 1000);
    assert.ok(invId);

    // Renewal protection: user has an expired row AND a newer still-active row -> old row closed without kicking
    const rOld = {
        id: crypto.randomUUID(),
        email: 'renew@example.com',
        contract_id: 'c-ren-1',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: '2027-05-01T00:00:00.000Z',
        join_token: 'tok-ren-1',
        telegram_user_id: 9901,
        joined_at: '2026-11-01T01:00:00.000Z',
    };
    const rNew = {
        id: crypto.randomUUID(),
        email: 'renew@example.com',
        contract_id: 'c-ren-2',
        starts_at: '2027-04-20T00:00:00.000Z',
        expires_at: '2027-10-20T00:00:00.000Z',
        join_token: 'tok-ren-2',
        telegram_user_id: 9901,
        joined_at: '2027-04-20T01:00:00.000Z',
    };
    w.fake.seed('support_chat_access', [rOld, rNew]);
    const cronRes = await w.bot.run();
    assert.ok(cronRes.removals.some((x) => x.id === rOld.id && /superseded/i.test(x.note)));
    assert.equal(w.fake.telegramCalls.filter((c) => c.method === 'banChatMember' && c.payload.user_id === 9901).length, 0);
    assert.ok(w.fake.db.support_chat_access.find((r) => r.id === rOld.id).removed_at);
    assert.equal(w.fake.db.support_chat_access.find((r) => r.id === rNew.id).removed_at, null);

    // Seed 25 more active rows and verify adminStatus caps nextExpiries at 20 with zero tokens
    for (let i = 0; i < 25; i++) {
        w.fake.seed('support_chat_access', [{
            id: crypto.randomUUID(),
            email: `cap${i}@example.com`,
            contract_id: `c-cap-${i}`,
            starts_at: '2027-01-01T00:00:00.000Z',
            expires_at: new Date(Date.parse('2027-07-01T00:00:00.000Z') + i * 86400000).toISOString(),
            join_token: `secret-cap-token-${i}`,
        }]);
    }
    const st = await w.bot.adminStatus();
    assert.equal(st.nextExpiries.length, 20);
    assert.ok(!JSON.stringify(st).includes('secret-cap-token-'));
});

// ---------------------------------------------------------------------------
// 3. Full HTTP e2e tests against the real server.js
// ---------------------------------------------------------------------------

async function startServer({ fakeUrl, envExtra = {} }) {
    const port = 25000 + Math.floor(Math.random() * 20000);
    const app = `http://127.0.0.1:${port}`;
    const env = {
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
        GETCOURSE_WEBHOOK_KEY: GK_KEY,
        TELEGRAM_API_BASE: fakeUrl,
        ...envExtra,
    };
    const proc = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.output = '';
    proc.stdout.on('data', (d) => (proc.output += d));
    proc.stderr.on('data', (d) => (proc.output += d));
    const end = Date.now() + 8000;
    for (;;) {
        try {
            if ((await fetch(`${app}/health`)).ok) break;
        } catch {}
        if (Date.now() > end) throw new Error(`server failed to boot:\n${proc.output}`);
        await new Promise((r) => setTimeout(r, 80));
    }
    return { app, proc };
}

function seedCourses(fake) {
    const biz = { id: crypto.randomUUID(), slug: 'vastu-2', title: 'Васту для бизнеса', starts_at: '2026-05-18T00:00:00+00:00', access_duration_months: 6, is_active: true };
    const bizVip = { id: crypto.randomUUID(), slug: 'vastu-2-vip', title: 'Васту для бизнеса · VIP', starts_at: null, access_duration_months: null, is_active: true };
    const design = { id: crypto.randomUUID(), slug: 'vastu-design-2026', title: 'Васту-дизайн', starts_at: '2026-11-09T00:00:00+00:00', access_duration_months: 6, is_active: true };
    fake.seed('courses', [biz, bizVip, design]);
    fake.seed('course_offers', [
        { course_id: biz.id, lava_offer_id: BIZ_STD_OFFER, is_lifetime: false, access_from: 'course_start' },
        { course_id: biz.id, lava_offer_id: BIZ_VIP_OFFER, is_lifetime: true, access_from: 'course_start' },
        { course_id: bizVip.id, lava_offer_id: BIZ_VIP_OFFER, is_lifetime: true, access_from: 'course_start' },
        { course_id: design.id, lava_offer_id: DESIGN_BASE_OFFER, access_months: 6, access_from: 'course_start' },
        { course_id: biz.id, lava_offer_id: BIZ_SELF_OFFER, access_months: 6, access_from: 'purchase', support_chat_months: null },
        { course_id: biz.id, lava_offer_id: BIZ_SUPPORT_OFFER, access_months: 6, access_from: 'purchase', support_chat_months: 6 },
    ]);
    return { biz, bizVip, design };
}

test('e2e (configured): GetCourse biz-support, Lava self vs support, webhook 401/200, /start, chat_member, setWebhook, admin status without tokens', async () => {
    const fake = createFakeServices({ lavaApiKey: 'lava-key' });
    const fakePort = await fake.listen();
    const fakeUrl = `http://127.0.0.1:${fakePort}`;
    seedCourses(fake);

    const { app, proc } = await startServer({
        fakeUrl,
        envExtra: {
            BIZ_SELF_LAVA_OFFER: BIZ_SELF_OFFER,
            BIZ_SUPPORT_LAVA_OFFER: BIZ_SUPPORT_OFFER,
            SUPPORT_CHAT: 'live',
            SUPPORT_CHAT_BOT_TOKEN: BOT_TOKEN,
            SUPPORT_CHAT_BOT_USERNAME: BOT_USERNAME,
            SUPPORT_CHAT_ID: CHAT_ID,
            TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
        },
    });

    try {
        // setWebhook MUST NOT be called automatically on boot
        assert.equal(fake.telegramCalls.filter((c) => c.method === 'setWebhook').length, 0);

        // /api/admin/tiers includes biz-self and biz-support when env is set
        const tiersResp = await fetch(`${app}/api/admin/tiers`, { headers: { 'x-cron-secret': CRON_SECRET } });
        assert.equal(tiersResp.status, 200);
        const tierKeys = (await tiersResp.json()).tiers.map((t) => t.key);
        assert.ok(tierKeys.includes('biz-self'));
        assert.ok(tierKeys.includes('biz-support'));

        // Admin registers webhook explicitly -> allowed_updates = ['message', 'chat_member']
        const setWh = await fetch(`${app}/api/admin/support-chat/set-webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
            body: JSON.stringify({}),
        });
        assert.equal(setWh.status, 200);
        const wh = fake.getTelegramWebhook();
        assert.equal(wh.url, `${app}/api/telegram/support-bot`);
        assert.equal(wh.secret_token, WEBHOOK_SECRET);
        assert.deepEqual(wh.allowed_updates, ['message', 'chat_member']);

        // GetCourse tier=biz-support grants vastu-2 (6m from purchase) + support_chat_access + welcome email with button
        const gkResp = await fetch(
            `${app}/api/getcourse/order?key=${GK_KEY}&tier=biz-support&email=gk-sup@example.com&order=9001&cost=50000&paid=12500`
        );
        assert.equal(gkResp.status, 200);
        const gkBody = await gkResp.json();
        assert.equal(gkBody.granted, true);
        assert.deepEqual(gkBody.courses, ['vastu-2']);

        const scRow = fake.db.support_chat_access.find((r) => r.contract_id === 'gk-9001');
        assert.ok(scRow, 'support_chat_access row created for GetCourse biz-support');
        const gkUser = [...fake.users.values()].find((u) => u.email === 'gk-sup@example.com');
        const gkEnt = fake.db.user_entitlements.find((e) => e.user_id === gkUser.id);
        assert.equal(gkEnt.expires_at, scRow.expires_at);
        assert.ok(Date.parse(gkEnt.expires_at) > Date.now() + 150 * 24 * 3600 * 1000, 'active ~6 months from today');

        const supMail = fake.sent.find((m) => m.to === 'gk-sup@example.com');
        assert.match(supMail.html, new RegExp(`https://t\\.me/${BOT_USERNAME}\\?start=${scRow.join_token}`));
        assert.match(supMail.html, /Войти в чат поддержки/);
        assert.match(supMail.html, new RegExp(`Поддержка в чате — 6 месяцев с даты покупки, до ${formatDateRu(scRow.expires_at).replace(/\./g, '\\.')}`));
        assert.doesNotMatch(supMail.html, /Канал потока|Чат потока/);

        // Lava webhook for biz-self (35 000 ₽): no support_chat_access row, no chat button or stream links
        const selfPaidAt = '2026-11-19T15:30:00.000Z';
        const lavaSelf = await fetch(`${app}/api/lava/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': HOOK_KEY },
            body: JSON.stringify({
                eventType: 'payment.success',
                product: { id: BIZ_SELF_OFFER, title: 'Самостоятельно' },
                buyer: { email: 'lava-self@example.com' },
                contractId: 'lava-self-1',
                amount: 35000,
                currency: 'RUB',
                timestamp: selfPaidAt,
            }),
        });
        assert.equal(lavaSelf.status, 200);
        assert.equal(fake.db.support_chat_access.filter((r) => r.email === 'lava-self@example.com').length, 0);
        const selfUser = [...fake.users.values()].find((u) => u.email === 'lava-self@example.com');
        const selfEnt = fake.db.user_entitlements.find((e) => e.user_id === selfUser.id);
        assert.equal(selfEnt.expires_at, '2027-05-19T15:30:00.000Z');
        const selfMail = fake.sent.find((m) => m.to === 'lava-self@example.com');
        assert.doesNotMatch(selfMail.html, /Войти в чат поддержки|Канал потока|Чат потока/);
        assert.ok(!selfMail.html.includes(BOT_USERNAME));

        // Lava invoice poll uses the invoice's own datetime for purchase-relative expiry
        const pollPaidAt = '2026-11-21T08:00:00.000Z';
        const pollContract = fake.addInvoice({
            email: 'poll-biz@example.com',
            offerId: BIZ_SUPPORT_OFFER,
            datetime: pollPaidAt,
            amount: 50000,
        });
        const recResp = await fetch(`${app}/api/cron/reconcile`, {
            method: 'POST',
            headers: { 'x-cron-secret': CRON_SECRET },
        });
        assert.equal(recResp.status, 200);
        const pollUser = [...fake.users.values()].find((u) => u.email === 'poll-biz@example.com');
        const pollEnt = fake.db.user_entitlements.find((e) => e.user_id === pollUser.id);
        assert.equal(pollEnt.expires_at, '2027-05-21T08:00:00.000Z');
        const pollSc = fake.db.support_chat_access.find((r) => r.contract_id === pollContract);
        assert.equal(pollSc.starts_at, pollPaidAt);
        assert.equal(pollSc.expires_at, '2027-05-21T08:00:00.000Z');

        // Webhook without secret header -> 401 and nothing done
        const tgCallsBeforeBad = fake.telegramCalls.length;
        const badWh = await fetch(`${app}/api/telegram/support-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' },
            body: JSON.stringify({
                message: { chat: { id: 9001, type: 'private' }, from: { id: 9001 }, text: `/start ${scRow.join_token}` },
            }),
        });
        assert.equal(badWh.status, 401);
        const missingWh = await fetch(`${app}/api/telegram/support-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: { chat: { id: 9001, type: 'private' }, from: { id: 9001 }, text: `/start ${scRow.join_token}` },
            }),
        });
        assert.equal(missingWh.status, 401);
        assert.equal(fake.telegramCalls.length, tgCallsBeforeBad);
        assert.equal(fake.db.support_chat_access.find((r) => r.id === scRow.id).telegram_user_id, null);

        // Verified webhook /start -> 200, binds user + creates invite link + sends button
        const goodWh = await fetch(`${app}/api/telegram/support-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET },
            body: JSON.stringify({
                message: { chat: { id: 9001, type: 'private' }, from: { id: 9001 }, text: `/start ${scRow.join_token}` },
            }),
        });
        assert.equal(goodWh.status, 200);
        assert.equal(fake.db.support_chat_access.find((r) => r.id === scRow.id).telegram_user_id, 9001);

        // Verified chat_member update -> sets joined_at
        const joinWh = await fetch(`${app}/api/telegram/support-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET },
            body: JSON.stringify({
                chat_member: {
                    chat: { id: Number(CHAT_ID), type: 'supergroup' },
                    date: 1795100000,
                    old_chat_member: { user: { id: 9001 }, status: 'left' },
                    new_chat_member: { user: { id: 9001 }, status: 'member' },
                    invite_link: { name: `support-${scRow.id}`, invite_link: 'https://t.me/+fake_invite_1' },
                },
            }),
        });
        assert.equal(joinWh.status, 200);
        assert.ok(fake.db.support_chat_access.find((r) => r.id === scRow.id).joined_at);

        // Cron auth check: wrong secret -> 401; right secret -> 200
        assert.equal((await fetch(`${app}/api/cron/support-chat`, { method: 'POST', headers: { 'x-cron-secret': 'bad' } })).status, 401);
        assert.equal((await fetch(`${app}/api/cron/support-chat`, { method: 'POST', headers: { 'x-cron-secret': CRON_SECRET } })).status, 200);

        // GET /api/admin/support-chat: counts + nextExpiries, NO join_token or invite_link leaked
        assert.equal((await fetch(`${app}/api/admin/support-chat`, { headers: { 'x-cron-secret': 'bad' } })).status, 401);
        const adminResp = await fetch(`${app}/api/admin/support-chat`, { headers: { 'x-cron-secret': CRON_SECRET } });
        assert.equal(adminResp.status, 200);
        const adminRaw = await adminResp.text();
        assert.ok(!adminRaw.includes(scRow.join_token), 'join_token must never appear in admin status');
        assert.ok(!adminRaw.includes('fake_invite_'), 'invite_link must never appear in admin status');
        const adminJson = JSON.parse(adminRaw);
        assert.equal(adminJson.mode, 'live');
        assert.equal(adminJson.counts.total, 2);
        assert.equal(adminJson.counts.active, 2);
        assert.equal(adminJson.counts.joined, 1);
        assert.equal(adminJson.counts.pendingJoin, 1);
        assert.equal(adminJson.nextExpiries.length, 2);
        assert.equal(adminJson.nextExpiries[0].join_token, undefined);
    } finally {
        proc.kill();
        await fake.close();
    }
});

test('e2e (unset env): biz tiers hidden from /grant and GetCourse biz-support -> unmapped + Tymur alert, nothing granted', async () => {
    const fake = createFakeServices({ lavaApiKey: 'lava-key' });
    const fakePort = await fake.listen();
    const fakeUrl = `http://127.0.0.1:${fakePort}`;
    seedCourses(fake);

    const { app, proc } = await startServer({
        fakeUrl,
        envExtra: {
            BIZ_SELF_LAVA_OFFER: '',
            BIZ_SUPPORT_LAVA_OFFER: '',
            SUPPORT_CHAT: 'off',
        },
    });

    try {
        // Hidden from /api/admin/tiers
        const tiers = await (await fetch(`${app}/api/admin/tiers`, { headers: { 'x-cron-secret': CRON_SECRET } })).json();
        assert.deepEqual(tiers.tiers.map((t) => t.key), ['design-base', 'design-pro', 'standard', 'vip']);

        // Refused by /api/admin/grant-access
        const grantResp = await fetch(`${app}/api/admin/grant-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
            body: JSON.stringify({ email: 'nope@example.com', tier: 'biz-support' }),
        });
        assert.equal(grantResp.status, 400);

        // Refused by GetCourse -> unmapped + alert Tymur, nothing granted, no chat row
        const alertsBefore = fake.sent.filter((m) => m.to === ALERTS).length;
        const gkResp = await fetch(
            `${app}/api/getcourse/order?key=${GK_KEY}&tier=biz-support&email=unset-gk@example.com&order=9999&cost=50000&paid=50000`
        );
        assert.equal(gkResp.status, 200);
        const gkBody = await gkResp.json();
        assert.equal(gkBody.granted, false);
        assert.equal(gkBody.reason, 'unmapped');
        assert.equal(fake.db.purchases.find((p) => p.contract_id === 'gk-9999')?.status, 'unmapped');
        assert.equal(fake.db.user_entitlements.length, 0);
        assert.equal(fake.db.support_chat_access.length, 0);
        assert.equal(fake.sent.filter((m) => m.to === 'unset-gk@example.com').length, 0);
        assert.equal(fake.sent.filter((m) => m.to === ALERTS).length, alertsBefore + 1);
    } finally {
        proc.kill();
        await fake.close();
    }
});
