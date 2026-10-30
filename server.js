import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
    EMAIL_LIGHT_ONLY_HEAD,
    EMAIL_RE,
    GRANT_TIERS,
    TG_GENERAL_CHAT_URL,
    TG_STANDARD_CHANNEL_URL,
    TG_VIP_CHANNEL_URL,
    TG_VIP_CHAT_URL,
    createFulfilment,
    getcourseTier,
    makeResendSender,
    normEmail,
} from './fulfilment.js';
import { createMono } from './mono.js';
import { clientIp, createRateLimiter } from './ratelimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = process.env.PORT || 10000;
const distPath = path.join(__dirname, 'dist');

// ---------------------------------------------------------------------------
// Lava.top webhook setup
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LAVA_WEBHOOK_API_KEY = process.env.LAVA_WEBHOOK_API_KEY;
const LAVA_API_KEY = process.env.LAVA_API_KEY;
const APP_URL = process.env.APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Where failure alerts go (a paid buyer who didn't get access/email).
const ALERT_EMAIL = process.env.ALERT_EMAIL;
// Signs the durable /access links in welcome emails. Falls back to a key
// derived from CRON_SECRET so a missing env var can't break checkout.
const ACCESS_LINK_SECRET =
    process.env.ACCESS_LINK_SECRET ||
    crypto.createHash('sha256').update(`access-link:${CRON_SECRET || SUPABASE_SERVICE_ROLE_KEY || ''}`).digest('hex');
// lava.top sales poll: only sales created at/after this ISO date are
// fulfilled (unset = poll off), every RECONCILE_INTERVAL_MIN minutes.
const RECONCILE_SINCE = process.env.RECONCILE_SINCE;
const RECONCILE_INTERVAL_MIN = Number(process.env.RECONCILE_INTERVAL_MIN || 3);
// Overridable only so the local test harness can stand in for both APIs.
const LAVA_API_BASE = process.env.LAVA_API_BASE || 'https://gate.lava.top';
const RESEND_API_BASE = process.env.RESEND_API_BASE || 'https://api.resend.com';

// Sender for every Resend email. Its domain MUST be verified in Resend
// (DKIM/SPF in DNS) or every send fails with 403 — that happened when
// annaromeo.design expired (2026-09-02): buyers got access but no email.
// Anna doesn't need a real mailbox at hello@; Resend only uses the header.
const RESEND_FROM = process.env.RESEND_FROM || 'Anna Romeo <hello@annaromeovastu.com>';

// GetCourse orders (рассрочка в рублях): the `key` Мила's process puts in the
// URL it calls. Unset = the endpoint refuses everything.
const GETCOURSE_WEBHOOK_KEY = process.env.GETCOURSE_WEBHOOK_KEY;

// monobank «Покупка частинами» (mono.js). Store id + sign key come from
// monobank's activation letter; prices are hryvnias per plan.
const MONO_STORE_ID = process.env.MONO_STORE_ID;
const MONO_SIGN_KEY = process.env.MONO_SIGN_KEY;
const MONO_API_BASE = process.env.MONO_API_BASE || 'https://u2.monobank.com.ua';
const MONO_PRICES_UAH = process.env.MONO_PRICES_UAH;
const MONO_PARTS = process.env.MONO_PARTS;

// Lazy-init: only create the admin client when the webhook actually fires,
// so the static server still boots if envs are missing in dev.
let supabaseAdmin = null;
function getSupabaseAdmin() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    }
    if (!supabaseAdmin) {
        supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    }
    return supabaseAdmin;
}

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024; // 1MB

function sendJson(res, status, payload) {
    if (res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        let aborted = false;

        req.on('data', (chunk) => {
            if (aborted) return;
            size += chunk.length;
            if (size > MAX_WEBHOOK_BODY_BYTES) {
                aborted = true;
                const err = new Error('Payload too large');
                err.code = 'PAYLOAD_TOO_LARGE';
                reject(err);
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            if (aborted) return;
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                const e = new Error('Invalid JSON');
                e.code = 'INVALID_JSON';
                reject(e);
            }
        });

        req.on('error', (err) => {
            if (aborted) return;
            reject(err);
        });
    });
}

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_WEBHOOK_BODY_BYTES) {
                const err = new Error('Payload too large');
                err.code = 'PAYLOAD_TOO_LARGE';
                reject(err);
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function secretMatches(given, expected) {
    const a = Buffer.from(String(given || ''));
    const b = Buffer.from(String(expected || ''));
    return a.length === b.length && b.length > 0 && crypto.timingSafeEqual(a, b);
}

function pickEventType(payload) {
    return payload?.eventType || payload?.event_type || payload?.event || null;
}

function pickEmail(payload) {
    return (
        payload?.buyer?.email ||
        payload?.email ||
        payload?.customer?.email ||
        payload?.user?.email ||
        null
    );
}

function pickOfferId(payload) {
    return (
        payload?.product?.id ||
        payload?.offer?.id ||
        payload?.productId ||
        payload?.offerId ||
        payload?.product_id ||
        payload?.offer_id ||
        null
    );
}

function pickPaymentId(payload) {
    return (
        payload?.contractId ||
        payload?.contract_id ||
        payload?.id ||
        payload?.paymentId ||
        payload?.payment_id ||
        null
    );
}

// One fulfilment service for the webhook, the sales poll and /grant — see
// fulfilment.js for why buyers never depend on Supabase's mailer.
const fulfilment = createFulfilment({
    getSupabase: getSupabaseAdmin,
    sendEmail: makeResendSender({ apiKey: RESEND_API_KEY, from: RESEND_FROM, base: RESEND_API_BASE }),
    appUrl: APP_URL,
    accessSecret: ACCESS_LINK_SECRET,
    alertEmail: ALERT_EMAIL,
    lavaApiKey: LAVA_API_KEY,
    lavaBase: LAVA_API_BASE,
    reconcileSince: RECONCILE_SINCE
});

const mono = createMono({
    storeId: MONO_STORE_ID,
    signKey: MONO_SIGN_KEY,
    base: MONO_API_BASE,
    appUrl: APP_URL,
    prices: MONO_PRICES_UAH,
    parts: MONO_PARTS,
    getSupabase: getSupabaseAdmin,
    fulfil: fulfilment.fulfil,
    alert: fulfilment.alert
});

// The public endpoints that send something on a stranger's word — the
// access-link email and monobank's push — are limited per sender and per
// target (ratelimit.js). Totals across everyone only alert Tymur.
const limits = createRateLimiter({
    onFull: () => void fulfilment.alert('лимиты запросов: таблица заполнена — новые адреса проходят без счёта, похоже на атаку'),
});
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

async function handleLavaWebhook(req, res) {
    // 1. Authenticate
    const headerKey =
        req.headers['x-api-key'] ||
        (typeof req.headers['authorization'] === 'string'
            ? req.headers['authorization'].replace(/^Bearer\s+/i, '')
            : undefined);

    if (!LAVA_WEBHOOK_API_KEY) {
        console.error('LAVA_WEBHOOK_API_KEY is not set on the server');
        sendJson(res, 500, { error: 'Webhook not configured' });
        return;
    }
    if (!headerKey || headerKey !== LAVA_WEBHOOK_API_KEY) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }

    // 2. Parse body
    let payload;
    try {
        payload = await readJsonBody(req);
    } catch (err) {
        if (err.code === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { error: 'Payload too large' });
            return;
        }
        if (err.code === 'INVALID_JSON') {
            sendJson(res, 400, { error: 'Invalid JSON' });
            return;
        }
        console.error('Webhook body read error:', err);
        sendJson(res, 400, { error: 'Failed to read body' });
        return;
    }

    // 3. Extract fields defensively
    console.log('Lava webhook payload:', JSON.stringify(payload));
    const eventType = pickEventType(payload);
    const email = pickEmail(payload);
    const offerId = pickOfferId(payload);
    const paymentId = pickPaymentId(payload);

    // Money going back out: access stays (Anna decides), but Tymur hears.
    if (eventType === 'refund.success' || eventType === 'chargeback.initiated') {
        await fulfilment.alert(`${eventType} от lava.top (${email || 'без почты'})`, payload);
        sendJson(res, 200, { noted: true, eventType });
        return;
    }

    // 4. Only act on success events
    const successEvents = new Set([
        'payment.success',
        'subscription.recurring.payment.success'
    ]);
    if (!eventType || !successEvents.has(eventType)) {
        sendJson(res, 200, { ignored: true, eventType });
        return;
    }

    if (!email || !offerId) {
        console.warn('Lava webhook missing email or offer id', { email, offerId });
        await fulfilment.alert('вебхук lava.top без почты или продукта', payload);
        sendJson(res, 200, { ignored: true, reason: 'missing email or offer id' });
        return;
    }

    try {
        const supabase = getSupabaseAdmin();

        // 5. Lava's webhook payload only includes product.id, not the offer
        //    under it. Purchases that went through /buy/<offerId> stashed
        //    {contractId -> offerId} in lava_invoices; that offer is the more
        //    specific match (Стандарт vs VIP share one product). Storefront
        //    purchases have no invoice row and map by product.id instead.
        let invoiceOfferId = null;
        if (paymentId) {
            const { data: invoiceRow, error: invErr } = await supabase
                .from('lava_invoices')
                .select('offer_id')
                .eq('contract_id', paymentId)
                .maybeSingle();
            if (invErr) console.error('lava_invoices lookup error:', invErr.message);
            invoiceOfferId = invoiceRow?.offer_id || null;
        }

        const result = await fulfilment.fulfil({
            contractId: paymentId || `webhook-${offerId}-${normEmail(email)}-${payload?.timestamp || Date.now()}`,
            email,
            lavaIds: [invoiceOfferId, offerId],
            source: 'webhook',
            amount: payload?.amount ?? null,
            currency: payload?.currency ?? null
        });

        if (result.status === 'unmapped') {
            // Retrying can't help; the alert has gone out.
            sendJson(res, 200, { ignored: true, reason: 'unknown offer' });
            return;
        }
        if (result.status !== 'granted') {
            sendJson(res, 200, { ignored: true, reason: result.error || result.status });
            return;
        }
        sendJson(res, 200, {
            success: true,
            user_id: result.userId,
            course_slugs: result.courseSlugs,
            email_sent: !!result.email?.sent || !!result.already
        });
    } catch (err) {
        // 5xx makes lava retry (19 times over ~5h); the poll retries too.
        console.error('Lava webhook unexpected error:', err);
        sendJson(res, 500, { error: err?.message || 'Internal error' });
    }
}

// ---------------------------------------------------------------------------
// Lava invoice creation (server -> Lava /api/v3/invoice)
// ---------------------------------------------------------------------------

const ALLOWED_CURRENCIES = new Set(['RUB', 'EUR', 'USD']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleCreateInvoice(req, res) {
    if (!LAVA_API_KEY) {
        console.error('LAVA_API_KEY is not set on the server');
        sendJson(res, 500, { error: 'Invoice creation not configured' });
        return;
    }

    let payload;
    try {
        payload = await readJsonBody(req);
    } catch (err) {
        if (err.code === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { error: 'Payload too large' });
            return;
        }
        if (err.code === 'INVALID_JSON') {
            sendJson(res, 400, { error: 'Invalid JSON' });
            return;
        }
        sendJson(res, 400, { error: 'Failed to read body' });
        return;
    }

    const email = (payload?.email || '').trim();
    const offerId = (payload?.offerId || '').trim();
    const currency = (payload?.currency || 'RUB').trim().toUpperCase();
    // 'sbp' or 'card'. Without a method lava falls back to card only (RUB via
    // SMART_GLOCAL), and Russian cards are declined there a lot: on the
    // masterclass day 14 of 16 checkouts failed or were abandoned.
    const method = String(payload?.method || 'card').toLowerCase() === 'sbp' && currency === 'RUB' ? 'sbp' : 'card';
    // The Ukrainian landing (/ua/) opens /buy with ?lang=uk; keep it on the way back.
    const lang = payload?.lang === 'uk' ? 'uk' : null;

    if (!EMAIL_RE.test(email)) {
        sendJson(res, 400, { error: 'Invalid email' });
        return;
    }
    if (!UUID_RE.test(offerId)) {
        sendJson(res, 400, { error: 'Invalid offerId' });
        return;
    }
    if (!ALLOWED_CURRENCIES.has(currency)) {
        sendJson(res, 400, { error: 'Unsupported currency' });
        return;
    }

    const appBase = APP_URL ? APP_URL.replace(/\/$/, '') : 'https://vastu-portal-app.onrender.com';
    try {
        const lavaResp = await fetch(`${LAVA_API_BASE}/api/v3/invoice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Api-Key': LAVA_API_KEY
            },
            body: JSON.stringify({
                email,
                offerId,
                currency,
                ...(method === 'sbp' ? { paymentProvider: 'PAY2ME', paymentMethod: 'SBP' } : {}),
                // Back to us after paying: a page that says what happens next,
                // or the same tariff with a hint to try СБП / another card.
                successful_return_url: `${appBase}/buy/thanks${lang ? `?lang=${lang}` : ''}`,
                failure_return_url: `${appBase}/buy/${offerId}?currency=${currency}&failed=1${lang ? `&lang=${lang}` : ''}`,
                cancel_return_url: `${appBase}/buy/${offerId}?currency=${currency}${lang ? `&lang=${lang}` : ''}`
            })
        });

        const text = await lavaResp.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }

        if (!lavaResp.ok) {
            console.error(`Lava invoice failed (${lavaResp.status}):`, text);
            sendJson(res, lavaResp.status === 404 ? 404 : 502, {
                error: body?.error || 'Lava invoice request failed',
                status: lavaResp.status
            });
            return;
        }

        const paymentUrl = body?.paymentUrl;
        if (!paymentUrl) {
            console.error('Lava invoice response missing paymentUrl:', text);
            sendJson(res, 502, { error: 'Lava response missing paymentUrl' });
            return;
        }

        // Stash {contractId -> offerId} so the webhook handler can resolve
        // which offer was bought (Lava's webhook payload only includes
        // product.id, not offer.id). Best-effort — don't block payment if
        // the insert fails; we'll fall back to manual recovery for that one.
        const contractId = body?.id;
        if (contractId) {
            try {
                const supabase = getSupabaseAdmin();
                const { error: insErr } = await supabase
                    .from('lava_invoices')
                    .insert({ contract_id: contractId, offer_id: offerId, email });
                if (insErr) {
                    console.error('lava_invoices insert error:', insErr.message);
                }
            } catch (err) {
                console.error('lava_invoices insert threw:', err?.message || err);
            }
        } else {
            console.error('Lava invoice response missing id:', text);
        }

        sendJson(res, 200, { paymentUrl });
    } catch (err) {
        console.error('Lava invoice fetch threw:', err);
        sendJson(res, 502, { error: 'Failed to reach Lava' });
    }
}

// ---------------------------------------------------------------------------
// GetCourse orders -> access («Рассрочка в рублях» on the landing goes to
// Мила's GetCourse pages). Her process over paid orders calls, GET or POST
// (form or JSON — "Вызвать URL"):
//   /api/getcourse/order?key=<GETCOURSE_WEBHOOK_KEY>&tier=design-base
//     &email={object.user.email}&order={object.number}
//     &positions={object.positions}&cost={object.cost_money_value}&paid={object.payed_money}
// The order number is the contract id (gk-<number>), so a process that fires
// on «частично оплачен» and again on «завершён» grants and emails once.
// The process's rule must count only payments that arrived («Есть платеж»
// with статус «Получен»): it runs once per order, so an order sent while its
// payment is still pending never comes back.
// &dry=1 answers with what it understood and grants nothing.
// ---------------------------------------------------------------------------

// "75 000 руб." / "75000.00" / "0 руб." -> number; "" -> null
function moneyOf(v) {
    const s = String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.');
    if (!s || !/\d/.test(s)) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

function parseLooseBody(raw, contentType) {
    if (!raw) return {};
    if (String(contentType || '').includes('json') || /^\s*\{/.test(raw)) {
        try {
            const o = JSON.parse(raw);
            return o && typeof o === 'object' ? o : {};
        } catch {
            return {};
        }
    }
    return Object.fromEntries(new URLSearchParams(raw));
}

async function handleGetcourseOrder(req, res) {
    if (!GETCOURSE_WEBHOOK_KEY) {
        sendJson(res, 500, { error: 'GetCourse webhook not configured' });
        return;
    }
    const params = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (req.method === 'POST') {
        try {
            Object.assign(params, parseLooseBody(await readRawBody(req), req.headers['content-type']));
        } catch {
            sendJson(res, 400, { error: 'Bad body' });
            return;
        }
    }
    if (!secretMatches(params.key, GETCOURSE_WEBHOOK_KEY)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }
    const { key, ...seen } = params;

    // GetCourse may not URL-encode what it substitutes: a "+" in an address
    // then arrives as a space.
    const email = normEmail(params.email).replace(/ /g, '+');
    const order = String(params.order || params.number || '').trim();
    const positions = String(params.positions || '').trim();
    if (!order || /\{object\./.test(email + order) || !EMAIL_RE.test(email)) {
        await fulfilment.alert('GetCourse прислал заказ без номера или почты', seen);
        sendJson(res, 400, { error: 'need email and order (are the {object.…} variables spelled right?)' });
        return;
    }
    const tierKey = getcourseTier({ tier: params.tier, positions });
    const tier = GRANT_TIERS.find((t) => t.key === tierKey);

    const paid = moneyOf(params.paid);
    if (paid === 0) {
        // GetCourse runs a process once per order, and a payment that hasn't
        // arrived yet already counts as «Есть платеж»: a signed installment
        // (Яндекс Сплит first waits out a cooling-off period of up to 4 hours)
        // or a credit application lands here unpaid, and when the money comes
        // GetCourse doesn't ask again. So each one is said out loud.
        if (params.dry !== '1') {
            await fulfilment.alert(`GetCourse: заказ #${order} пришёл без оплаты — когда оплатят, доступ сам не откроется`, {
                order,
                email,
                tier: tier?.label || `не понял тариф: ${positions || '—'}`,
                cost: params.cost,
                paid: params.paid,
                todo: 'Когда заказ оплатят, откройте доступ на /grant. Процесс в GetCourse должен брать только платежи со статусом «Получен».',
            });
        }
        sendJson(res, 200, { ignored: true, reason: 'nothing paid yet' });
        return;
    }

    const contractId = `gk-${order}`;
    // The tier's lava id maps to courses; the GetCourse names ride along so an
    // unmapped order says what it was.
    const lavaIds = [tier?.lavaId, `getcourse:${positions || params.offers || '—'}`].filter(Boolean);
    const amount = moneyOf(params.cost) ?? paid;

    if (params.dry === '1') {
        sendJson(res, 200, { dryRun: true, contractId, email, tier: tierKey, amount, paid, seen });
        return;
    }

    try {
        const result = await fulfilment.fulfil({ contractId, email, lavaIds, source: 'webhook', amount, currency: 'RUB' });
        if (result.status !== 'granted') {
            // unmapped / bad email: recorded and alerted; a retry can't help.
            sendJson(res, 200, { granted: false, reason: result.error || result.status });
            return;
        }
        sendJson(res, 200, {
            granted: true,
            tier: tierKey,
            courses: result.courseSlugs,
            email_sent: !!result.email?.sent || !!result.already
        });
    } catch (err) {
        // Recorded as an error and retried by the reconcile timer.
        console.error('GetCourse order failed:', err);
        sendJson(res, 500, { error: err?.message || 'Internal error' });
    }
}

// ---------------------------------------------------------------------------
// monobank «Покупка частинами» (mono.js): /buy/mono/<plan> in the SPA asks
// /api/mono/plan/<plan>, creates the order, then polls its state.
// ---------------------------------------------------------------------------

async function handleMonoCreate(req, res) {
    let payload;
    try {
        payload = await readJsonBody(req);
    } catch {
        sendJson(res, 400, { error: 'Bad body' });
        return;
    }
    // Every order pushes a request into somebody's monobank app — keep this
    // from being used to spam phones.
    const phoneKey = String(payload?.phone || '').replace(/\D/g, '').slice(-9);
    if (limits.take([[`mono-i:${clientIp(req)}`, 6, 15 * MINUTE], [`mono-p:${phoneKey}`, 3, 15 * MINUTE]])) {
        sendJson(res, 429, { error: 'Забагато заявок. Зачекайте 15 хвилин.' });
        return;
    }
    // Totals only alert: orders come in waves after a webinar.
    const lastHour = limits.count('mono-all', HOUR);
    const last24h = limits.count('mono-all-day', DAY);
    if (lastHour > 20 || last24h > 100) {
        await fulfilment.alert('monobank: необычно много заявок — проверьте, не атака ли', { lastHour, last24h });
    }
    try {
        const r = await mono.createOrder({
            planKey: String(payload?.plan || ''),
            email: payload?.email,
            phone: payload?.phone,
            parts: payload?.parts
        });
        if (r.error) {
            sendJson(res, r.status || 400, { error: r.error });
            return;
        }
        sendJson(res, 200, { orderId: r.orderId });
    } catch (err) {
        console.error('monobank create failed:', err?.message || err);
        await fulfilment.alert('monobank: не удалось создать заявку', String(err?.message || err));
        sendJson(res, 502, { error: 'monobank зараз не відповідає. Спробуйте за кілька хвилин.' });
    }
}

async function handleMonoCallback(req, res) {
    let raw;
    try {
        raw = await readRawBody(req);
    } catch {
        sendJson(res, 400, { error: 'Bad body' });
        return;
    }
    console.log('monobank callback:', raw.slice(0, 500));
    const r = await mono.handleCallback(raw, req.headers['signature']);
    sendJson(res, r.status, r.result || {});
}

// ---------------------------------------------------------------------------
// Legacy «Васту для бизнеса» welcome email (Telegram channel + chat invite)
//
// Manual only, via /api/admin/welcome-email. Purchases no longer need it:
// fulfil() sends one email with access + Telegram links (COURSE_WELCOME in
// fulfilment.js). Kept for re-sending the May-stream text verbatim.
// ---------------------------------------------------------------------------

function tgButton(href, label) {
    return `<a href="${href}" style="display:inline-block;background-color:#422326;color:#F2EDE2;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;padding:13px 24px;border:1px solid #422326;margin:6px 4px;">${label}</a>`;
}

function buildVipWelcomeEmailHtml({ firstName, loginUrl }) {
    const greeting = firstName
        ? `Здравствуйте, ${firstName} 🤍`
        : 'Здравствуйте 🤍';
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
${EMAIL_LIGHT_ONLY_HEAD}
<title>Добро пожаловать на VIP-поток</title>
</head>
<body style="margin:0;padding:0;background-color:#F2EDE2;font-family:Georgia,'Times New Roman',serif;color:#422326;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2EDE2;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#F2EDE2;">
          <tr>
            <td align="center" style="padding:24px 24px 8px 24px;">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:34px;color:#422326;letter-spacing:0.5px;">Anna Romeo</div>
              <div style="margin-top:10px;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#8a6a3b;font-variant:small-caps;">Васту &amp; дизайн портал</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px;">
              <hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px;">
              <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;font-size:30px;color:#422326;margin:0 0 16px 0;">${greeting}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px;font-size:16px;line-height:1.75;color:#422326;">
              <p style="margin:0 0 16px 0;">Рада приветствовать вас на VIP-потоке курса <em>«Васту для бизнеса»</em>.</p>
              <p style="margin:0 0 24px 0;">Очень жду нашей совместной работы — впереди глубокая программа и личные разборы.</p>
              <p style="margin:0 0 12px 0;">Отправляю ссылки на наше пространство:</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 16px 24px;">
              ${tgButton(TG_VIP_CHANNEL_URL, 'VIP-канал')}
              ${tgButton(TG_VIP_CHAT_URL, 'VIP-чат')}
              ${tgButton(TG_GENERAL_CHAT_URL, 'Общий чат потока')}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;font-size:15px;line-height:1.7;color:#422326;">
              <p style="margin:0 0 8px 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:20px;">Где что происходит</p>
              <p style="margin:0 0 12px 0;"><strong>VIP-канал и VIP-чат</strong> — ваше основное пространство. Здесь материалы для VIP, ссылки на уроки, прямая связь со мной, ваши личные вопросы и кейсы.</p>
              <p style="margin:0 0 16px 0;"><strong>Общий чат потока</strong> — здесь вся группа: знакомства, обсуждения уроков, разные кейсы участников. Это живая среда, где много полезного из чужого опыта — рекомендую быть включёнными.</p>
              <p style="margin:0 0 16px 0;">Расписание VIP zoom-встреч и информацию о личных разборах предназначения пришлю отдельно.</p>
              <p style="margin:0 0 16px 0;"><strong>Предобучение (Модуль&nbsp;0)</strong> уже открыто — стартует 13 мая. Можно заходить и начинать в своём темпе.</p>
              <p style="margin:0 0 16px 0;">На вашу почту пришло (или вот-вот придёт) письмо с доступом к платформе. Если письма нет — напишите <a href="https://t.me/tymuron" style="color:#8a6a3b;">@tymuron</a> вашу почту, пожалуйста.</p>
              <p style="margin:0 0 24px 0;"><strong>Старт основного обучения</strong> — 18 мая.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 16px 24px;">
              <a href="${loginUrl}" style="display:inline-block;background-color:#F2EDE2;color:#422326;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;padding:13px 24px;border:1px solid #422326;">Войти в личный кабинет</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px 24px;">
              <hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 32px 24px;font-size:14px;line-height:1.6;color:#7a5a3a;font-style:italic;">
              <p style="margin:0;">До встречи на программе 🙌</p>
              <p style="margin:8px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;">Anna Romeo</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildStandardWelcomeEmailHtml({ firstName, loginUrl }) {
    const greeting = firstName
        ? `Здравствуйте, ${firstName} 🤍`
        : 'Здравствуйте 🤍';
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
${EMAIL_LIGHT_ONLY_HEAD}
<title>Добро пожаловать на курс «Васту для бизнеса»</title>
</head>
<body style="margin:0;padding:0;background-color:#F2EDE2;font-family:Georgia,'Times New Roman',serif;color:#422326;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2EDE2;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#F2EDE2;">
          <tr>
            <td align="center" style="padding:24px 24px 8px 24px;">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:34px;color:#422326;letter-spacing:0.5px;">Anna Romeo</div>
              <div style="margin-top:10px;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#8a6a3b;font-variant:small-caps;">Васту &amp; дизайн портал</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px;">
              <hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px;">
              <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;font-size:30px;color:#422326;margin:0 0 16px 0;">${greeting}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px;font-size:16px;line-height:1.75;color:#422326;">
              <p style="margin:0 0 16px 0;">Добро пожаловать на курс <em>«Васту для бизнеса»</em>.</p>
              <p style="margin:0 0 12px 0;">Делюсь ссылками:</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 16px 24px;">
              ${tgButton(TG_STANDARD_CHANNEL_URL, 'Канал потока')}
              ${tgButton(TG_GENERAL_CHAT_URL, 'Чат потока')}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;font-size:15px;line-height:1.7;color:#422326;">
              <p style="margin:0 0 12px 0;"><strong>‼ Доступ на платформу пришёл на почту.</strong></p>
              <p style="margin:0 0 12px 0;">Предобучение (Модуль&nbsp;0) открыто с сегодняшнего дня, 13 мая.</p>
              <p style="margin:0 0 24px 0;">Если письма нет — пишите <a href="https://t.me/tymuron" style="color:#8a6a3b;">@tymuron</a>.</p>
              <p style="margin:0 0 16px 0;"><strong>Старт основного обучения</strong> — 18 мая. Очень жду 🙌</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 16px 24px;">
              <a href="${loginUrl}" style="display:inline-block;background-color:#F2EDE2;color:#422326;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;padding:13px 24px;border:1px solid #422326;">Войти в личный кабинет</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px 24px;">
              <hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 32px 24px;font-size:14px;line-height:1.6;color:#7a5a3a;font-style:italic;">
              <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;">Anna Romeo</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function handleSendWelcomeEmail(req, res) {
    if (!CRON_SECRET) {
        console.error('CRON_SECRET is not set on the server');
        sendJson(res, 500, { error: 'Endpoint not configured' });
        return;
    }
    const headerSecret = req.headers['x-cron-secret'];
    if (!headerSecret || headerSecret !== CRON_SECRET) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }
    if (!RESEND_API_KEY) {
        sendJson(res, 500, { error: 'RESEND_API_KEY not configured' });
        return;
    }

    let payload;
    try {
        payload = await readJsonBody(req);
    } catch (err) {
        if (err.code === 'INVALID_JSON') {
            sendJson(res, 400, { error: 'Invalid JSON' });
            return;
        }
        sendJson(res, 400, { error: 'Failed to read body' });
        return;
    }

    const email = (payload?.email || '').trim();
    const firstName = (payload?.firstName || '').trim() || null;
    const tier = (payload?.tier || 'vip').trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
        sendJson(res, 400, { error: 'Invalid email' });
        return;
    }
    if (tier !== 'vip' && tier !== 'standard') {
        sendJson(res, 400, { error: 'tier must be "vip" or "standard"' });
        return;
    }

    const loginUrl =
        (APP_URL ? APP_URL.replace(/\/$/, '') : 'https://vastu-portal-app.onrender.com') +
        '/login';
    const html =
        tier === 'vip'
            ? buildVipWelcomeEmailHtml({ firstName, loginUrl })
            : buildStandardWelcomeEmailHtml({ firstName, loginUrl });
    const subject =
        tier === 'vip'
            ? 'Добро пожаловать на VIP-поток курса «Васту для бизнеса»'
            : 'Добро пожаловать на курс «Васту для бизнеса»';

    try {
        const resp = await fetch(`${RESEND_API_BASE}/emails`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: RESEND_FROM,
                to: email,
                subject,
                html
            })
        });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            console.error(`Resend welcome-email failed (${resp.status}):`, errText);
            sendJson(res, 502, { error: 'Resend send failed', status: resp.status });
            return;
        }
        sendJson(res, 200, { sent: true, to: email, tier });
    } catch (err) {
        console.error('Resend welcome-email threw:', err);
        sendJson(res, 502, { error: 'Failed to reach Resend' });
    }
}

// ---------------------------------------------------------------------------
// Admin console (GET /grant) and its API. Every /api/admin/* and
// /api/cron/* call needs x-cron-secret. The page itself is harmless without
// the secret — it is only a form.
// ---------------------------------------------------------------------------

const GRANT_PAGE_HTML = fs.readFileSync(path.join(__dirname, 'grant.html'), 'utf8');

function checkCronSecret(req, res) {
    if (!CRON_SECRET) {
        sendJson(res, 500, { error: 'Endpoint not configured' });
        return false;
    }
    const headerSecret = req.headers['x-cron-secret'];
    if (!headerSecret || headerSecret !== CRON_SECRET) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return false;
    }
    return true;
}

// POST /api/admin/grant-access {email, tier, sendEmail}
// Grants exactly what buying that tier grants (same course_offers mapping),
// logs it in purchases, and by default sends the same welcome email. Also
// returns a durable login link to paste into Telegram, so access never
// depends on the email arriving.
async function handleGrantAccess(req, res) {
    if (!checkCronSecret(req, res)) return;

    let payload;
    try {
        payload = await readJsonBody(req);
    } catch (err) {
        sendJson(res, 400, { error: 'Bad body' });
        return;
    }

    const email = normEmail(payload?.email);
    const tierKey = String(payload?.tier || '').trim().toLowerCase();
    const tier = GRANT_TIERS.find((t) => t.key === tierKey);
    if (!EMAIL_RE.test(email)) {
        sendJson(res, 400, { error: 'Invalid email' });
        return;
    }
    if (!tier) {
        sendJson(res, 400, { error: `tier must be one of: ${GRANT_TIERS.map((t) => t.key).join(', ')}` });
        return;
    }

    try {
        const result = await fulfilment.fulfil({
            contractId: `manual-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
            email,
            lavaIds: [tier.lavaId],
            source: 'manual',
            sendEmail: payload?.sendEmail !== false
        });
        if (result.status !== 'granted') {
            sendJson(res, 500, { error: result.error || `Не удалось: ${result.status}` });
            return;
        }
        sendJson(res, 200, {
            granted: true,
            email,
            tier: tier.key,
            courses: result.courseSlugs,
            created: result.created,
            emailSent: !!result.email?.sent,
            emailError: result.email?.error || null,
            loginLink: result.accessUrl
        });
    } catch (err) {
        console.error('handleGrantAccess threw:', err);
        sendJson(res, 500, { error: err?.message || 'Internal error' });
    }
}

async function handleAdminPurchases(req, res) {
    if (!checkCronSecret(req, res)) return;
    const { data, error } = await getSupabaseAdmin()
        .from('purchases')
        .select('contract_id, email, source, status, course_slugs, amount, currency, error, email_sent_at, email_error, email_skipped_reason, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) {
        sendJson(res, 500, { error: error.message });
        return;
    }
    sendJson(res, 200, { purchases: data || [] });
}

// POST /api/admin/purchases/retry {contractId} — run fulfilment again and
// (re)send the welcome email.
async function handleAdminRetry(req, res) {
    if (!checkCronSecret(req, res)) return;
    let payload;
    try {
        payload = await readJsonBody(req);
    } catch {
        sendJson(res, 400, { error: 'Bad body' });
        return;
    }
    const contractId = String(payload?.contractId || '');
    const { data: p, error } = await getSupabaseAdmin()
        .from('purchases')
        .select('contract_id, email, lava_ids, source')
        .eq('contract_id', contractId)
        .maybeSingle();
    if (error || !p) {
        sendJson(res, 404, { error: 'purchase not found' });
        return;
    }
    try {
        const result = await fulfilment.fulfil({
            contractId: p.contract_id,
            email: p.email,
            lavaIds: p.lava_ids || [],
            source: p.source,
            resend: true
        });
        sendJson(res, 200, result);
    } catch (err) {
        sendJson(res, 500, { error: err?.message || 'Internal error' });
    }
}

// POST /api/access/request {email} — the "forgot password / no email"
// button. Always answers the same, whether or not the address exists.
async function handleAccessRequest(req, res) {
    let payload;
    try {
        payload = await readJsonBody(req);
    } catch {
        sendJson(res, 400, { error: 'Bad body' });
        return;
    }
    const email = normEmail(payload?.email);
    if (!EMAIL_RE.test(email)) {
        sendJson(res, 400, { error: 'Invalid email' });
        return;
    }
    if (limits.take([[`i:${clientIp(req)}`, 20, HOUR], [`e:${email}`, 3, 15 * MINUTE]])) {
        sendJson(res, 429, { error: 'Слишком много запросов. Подождите 15 минут.' });
        return;
    }
    // Totals only alert: before a course starts, many students ask at once.
    const lastHour = limits.count('access-all', HOUR);
    const last24h = limits.count('access-all-day', DAY);
    if (lastHour > 60 || last24h > 300) {
        await fulfilment.alert('необычно много запросов ссылки для входа — проверьте, не атака ли', { lastHour, last24h });
    }
    try {
        await fulfilment.requestAccessEmail(email);
    } catch (err) {
        console.error('access request failed:', err?.message || err);
        await fulfilment.alert(`не удалось отправить ссылку для входа (${email})`, String(err?.message || err));
        sendJson(res, 502, { error: 'Не удалось отправить письмо' });
        return;
    }
    sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Daily expiry-reminder cron
// ---------------------------------------------------------------------------

function formatDateRu(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}.${mm}.${yyyy}`;
}

function buildExpiryEmailHtml({ courseTitle, expiresAtIso, loginUrl }) {
    const dateStr = formatDateRu(expiresAtIso);
    // Cream bg / burgundy / Cormorant aesthetic to match the invite email.
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
${EMAIL_LIGHT_ONLY_HEAD}
<title>Ваш доступ скоро закончится</title>
</head>
<body style="margin:0;padding:0;background-color:#F2EDE2;font-family:Georgia,'Times New Roman',serif;color:#422326;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2EDE2;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#F2EDE2;">
          <tr>
            <td align="center" style="padding:24px 24px 8px 24px;">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:34px;color:#422326;letter-spacing:0.5px;">Anna Romeo</div>
              <div style="margin-top:10px;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#8a6a3b;font-variant:small-caps;">Васту &amp; дизайн портал</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px;">
              <hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px;">
              <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;font-size:30px;color:#422326;margin:0 0 16px 0;">Ваш доступ скоро закончится</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px;font-size:16px;line-height:1.7;color:#422326;">
              <p style="margin:0 0 16px 0;">Через несколько дней истекает ваш доступ к курсу <strong>${courseTitle}</strong>. После <strong>${dateStr}</strong> вы больше не сможете открывать материалы курса.</p>
              <p style="margin:0 0 24px 0;">Если хотите продлить доступ или вернуться к материалам — войдите в личный кабинет.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 8px 24px;">
              <a href="${loginUrl}" style="display:inline-block;background-color:#422326;color:#F2EDE2;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:0.18em;text-transform:uppercase;padding:14px 28px;border:1px solid #422326;">Войти в личный кабинет</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px 24px;">
              <hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 32px 24px;font-size:13px;line-height:1.6;color:#7a5a3a;">
              <p style="margin:0;">Ваш прогресс сохранится — если вы решите вернуться позже и продлить доступ, все ваши отметки и заметки останутся на месте.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function handleExpiryReminders(req, res) {
    // 1. Auth
    if (!CRON_SECRET) {
        console.error('CRON_SECRET is not set on the server');
        sendJson(res, 500, { error: 'Cron not configured' });
        return;
    }
    const headerSecret = req.headers['x-cron-secret'];
    if (!headerSecret || headerSecret !== CRON_SECRET) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }

    // 2. Resend availability — let cron run cleanly until Resend is wired up.
    if (!RESEND_API_KEY) {
        sendJson(res, 200, {
            skipped: true,
            reason: 'RESEND_API_KEY not configured'
        });
        return;
    }

    try {
        const supabase = getSupabaseAdmin();

        // 3. Candidates: entitlements expiring 6-8 days from now (buffer in
        //    case cron skips a day) that haven't been reminded yet.
        const lower = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
        const upper = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error: qErr } = await supabase
            .from('user_entitlements')
            .select(
                'id, user_id, course_id, expires_at, profiles!inner(email, full_name), courses!inner(title)'
            )
            .gte('expires_at', lower)
            .lte('expires_at', upper)
            .is('reminder_sent_at', null);

        if (qErr) {
            console.error('expiry-reminders query error:', qErr.message);
            sendJson(res, 500, { error: qErr.message });
            return;
        }

        const checked = rows?.length || 0;
        let sent = 0;
        let failed = 0;

        const loginUrl =
            (APP_URL ? APP_URL.replace(/\/$/, '') : 'https://vastu-portal-app.onrender.com') +
            '/login';

        // 4. Send sequentially — volume is tiny and we want to be polite to Resend.
        for (const row of rows || []) {
            const email = row.profiles?.email;
            const courseTitle = row.courses?.title || 'курсу';
            if (!email) {
                failed += 1;
                console.warn('expiry-reminders: row missing profile email', row.id);
                continue;
            }

            const html = buildExpiryEmailHtml({
                courseTitle,
                expiresAtIso: row.expires_at,
                loginUrl
            });

            const body = {
                from: RESEND_FROM,
                to: email,
                subject: 'Ваш доступ к курсу скоро закончится',
                html
            };

            try {
                const resp = await fetch(`${RESEND_API_BASE}/emails`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                if (!resp.ok) {
                    const errText = await resp.text().catch(() => '');
                    console.error(
                        `Resend send failed for entitlement ${row.id} (status ${resp.status}):`,
                        errText
                    );
                    failed += 1;
                    continue;
                }

                const { error: updErr } = await supabase
                    .from('user_entitlements')
                    .update({ reminder_sent_at: new Date().toISOString() })
                    .eq('id', row.id);
                if (updErr) {
                    console.error(
                        `reminder_sent_at update failed for ${row.id}:`,
                        updErr.message
                    );
                    failed += 1;
                    continue;
                }
                sent += 1;
            } catch (sendErr) {
                console.error(
                    `Resend send threw for entitlement ${row.id}:`,
                    sendErr?.message || sendErr
                );
                failed += 1;
            }
        }

        sendJson(res, 200, { checked, sent, failed });
    } catch (err) {
        console.error('handleExpiryReminders unexpected error:', err);
        sendJson(res, 500, { error: err?.message || 'Internal error' });
    }
}

// Query values that let someone in — the access link's ?t=, Supabase's
// recovery token_hash, GetCourse's key — are blanked in the request log.
const SECRET_QUERY_VALUES = /([?&](?:t|key|token|token_hash|code|access_token|refresh_token)=)[^&#]*/gi;

const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    console.log(`Request: ${req.method} ${req.url.replace(SECRET_QUERY_VALUES, '$1…')}`);

    // Lava.top payment webhook (must short-circuit before static logic)
    if (req.method === 'POST' && urlPath === '/api/lava/webhook') {
        handleLavaWebhook(req, res).catch((err) => {
            console.error('handleLavaWebhook threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    // Daily expiry-reminder cron (must also short-circuit before static logic)
    if (req.method === 'POST' && urlPath === '/api/cron/expiry-reminders') {
        handleExpiryReminders(req, res).catch((err) => {
            console.error('handleExpiryReminders threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    // Lava invoice creation — proxy to Lava's /api/v3/invoice so storefront
    // sales fire webhooks. Customer hits /buy/<offerId>, page POSTs here, we
    // call Lava with our X-Api-Key, and return paymentUrl for the redirect.
    if (req.method === 'POST' && urlPath === '/api/lava/invoice') {
        handleCreateInvoice(req, res).catch((err) => {
            console.error('handleCreateInvoice threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    // Manual welcome-email trigger — Anna/Tymur calls this with x-cron-secret
    // to send the styled Telegram-links email to a specific customer.
    if (req.method === 'POST' && urlPath === '/api/admin/welcome-email') {
        handleSendWelcomeEmail(req, res).catch((err) => {
            console.error('handleSendWelcomeEmail threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    // Manual access grant — same fulfilment as a purchase (phone-friendly).
    if (req.method === 'POST' && urlPath === '/api/admin/grant-access') {
        handleGrantAccess(req, res).catch((err) => {
            console.error('handleGrantAccess threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    if (req.method === 'GET' && urlPath === '/api/admin/tiers') {
        if (!checkCronSecret(req, res)) return;
        sendJson(res, 200, { tiers: GRANT_TIERS.map(({ key, label }) => ({ key, label })) });
        return;
    }

    if (req.method === 'GET' && urlPath === '/api/admin/status') {
        if (!checkCronSecret(req, res)) return;
        sendJson(res, 200, {
            ...fulfilment.status(),
            getcourse: { enabled: !!GETCOURSE_WEBHOOK_KEY },
            monobank: {
                enabled: mono.configured,
                plans: ['design-base', 'design-base-mk', 'design-pro'].map((k) => ({ plan: k, uah: mono.plan(k)?.uah ?? null })),
            },
        });
        return;
    }

    if (req.method === 'GET' && urlPath === '/api/admin/purchases') {
        handleAdminPurchases(req, res).catch((err) => {
            console.error('handleAdminPurchases threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    if (req.method === 'POST' && urlPath === '/api/admin/purchases/retry') {
        handleAdminRetry(req, res).catch((err) => {
            console.error('handleAdminRetry threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    // lava.top sales poll on demand; ?dryRun=1 only reports what it would do.
    if (req.method === 'POST' && urlPath === '/api/cron/reconcile') {
        if (!checkCronSecret(req, res)) return;
        const dryRun = /(?:^|[?&])dryRun=1(?:&|$)/.test(req.url.split('?')[1] || '');
        fulfilment.reconcile({ dryRun }).then(
            (r) => sendJson(res, 200, r),
            (err) => sendJson(res, 500, { error: err?.message || 'Internal error' })
        );
        return;
    }

    // GetCourse paid order -> access (Мила's "Вызвать URL").
    if ((req.method === 'GET' || req.method === 'POST') && urlPath === '/api/getcourse/order') {
        handleGetcourseOrder(req, res).catch((err) => {
            console.error('handleGetcourseOrder threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    // monobank «Покупка частинами»: plan for the page, new order, order
    // state (also confirms + grants once approved), monobank's callback.
    const monoPlanMatch = req.method === 'GET' && urlPath.match(/^\/api\/mono\/plan\/([a-z0-9-]{1,40})$/);
    if (monoPlanMatch) {
        const p = mono.configured ? mono.plan(monoPlanMatch[1]) : null;
        if (!p) sendJson(res, 404, { error: 'not for sale in parts' });
        else sendJson(res, 200, { title: p.title, uah: p.uah, parts: p.parts });
        return;
    }
    if (req.method === 'POST' && urlPath === '/api/mono/order') {
        handleMonoCreate(req, res).catch((err) => {
            console.error('handleMonoCreate threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }
    const monoOrderMatch = req.method === 'GET' && urlPath.match(/^\/api\/mono\/order\/([A-Za-z0-9-]{8,64})$/);
    if (monoOrderMatch) {
        mono.settle(monoOrderMatch[1], 'page').then(
            (r) => sendJson(res, r.state === 'UNKNOWN' ? 404 : 200, r),
            (err) => {
                console.error('monobank state failed:', err?.message || err);
                sendJson(res, 200, { state: 'IN_PROCESS', retry: true });
            }
        );
        return;
    }
    if (req.method === 'POST' && urlPath === '/api/mono/callback') {
        handleMonoCallback(req, res).catch((err) => {
            console.error('handleMonoCallback threw:', err);
            sendJson(res, 200, {});
        });
        return;
    }

    // monobank sweep on demand (it also runs on the reconcile timer).
    if (req.method === 'POST' && urlPath === '/api/cron/mono-sweep') {
        if (!checkCronSecret(req, res)) return;
        mono.sweep().then(
            (r) => sendJson(res, 200, r),
            (err) => sendJson(res, 500, { error: err?.message || 'Internal error' })
        );
        return;
    }

    // Tariff name + prices for the /buy page.
    const offerMatch = req.method === 'GET' && urlPath.match(/^\/api\/lava\/offer\/([0-9a-f-]{36})$/i);
    if (offerMatch) {
        fulfilment.offerInfo(offerMatch[1].toLowerCase()).then(
            (info) => (info ? sendJson(res, 200, info) : sendJson(res, 404, { error: 'unknown offer' })),
            (err) => {
                console.error('offer info failed:', err?.message || err);
                sendJson(res, 502, { error: 'catalog unavailable' });
            }
        );
        return;
    }

    // "Send me my login link" from /forgot-password.
    if (req.method === 'POST' && urlPath === '/api/access/request') {
        handleAccessRequest(req, res).catch((err) => {
            console.error('handleAccessRequest threw:', err);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }

    // Durable access link from the welcome email -> fresh recovery token ->
    // /update-password. HEAD (link preview / mail scanners) mints nothing.
    if ((req.method === 'GET' || req.method === 'HEAD') && urlPath === '/access') {
        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end();
            return;
        }
        const t = new URL(req.url, 'http://x').searchParams.get('t');
        fulfilment.accessRedirect(t).then(
            (location) => {
                res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
                res.end();
            },
            (err) => {
                console.error('access redirect failed:', err?.message || err);
                res.writeHead(302, { Location: '/forgot-password?failed=1', 'Cache-Control': 'no-store' });
                res.end();
            }
        );
        return;
    }

    // Admin console: grant access, see every payment and whether its email
    // went out. Served before the SPA fallback so it never touches the React
    // app. Harmless without the secret — the API validates it server-side.
    if (req.method === 'GET' && urlPath === '/grant') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(GRANT_PAGE_HTML);
        return;
    }

    // Health check. Also the frontend's clock reference: the browser reads the
    // `Date` response header off this endpoint to work out how far the user's
    // system clock is from real time (see src/lib/authDiagnostics.ts). A clock
    // more than an hour fast makes every access token look expired the instant
    // it is issued, which is why some laptops get thrown back to the login page
    // a second after logging in. Matched on the path so the cache-busting query
    // string the probe appends still lands here, and never cached.
    if (urlPath === '/health') {
        res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end('OK');
        return;
    }

    // Debug: List files in dist
    if (req.url === '/debug-files') {
        fs.readdir(distPath, (err, files) => {
            if (err) {
                res.writeHead(500);
                res.end(`Error listing files: ${err.message}`);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`Files in ${distPath}:\n${files.join('\n')}`);
            }
        });
        return;
    }

    // Default to index.html for root
    let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);

    // SPA Routing: If no extension, serve index.html
    if (!path.extname(req.url)) {
        filePath = path.join(distPath, 'index.html');
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.webmanifest': contentType = 'application/manifest+json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpg'; break;
        case '.svg': contentType = 'image/svg+xml'; break;
    }

    // Cache policy. index.html (and every SPA route that serves it) MUST be
    // revalidated every load — otherwise a returning user keeps a cached
    // index.html pointing at the OLD fingerprinted bundle and never receives
    // any deploy/fix until their browser cache randomly expires (this is why
    // RU customers kept reporting already-fixed bugs). Vite's /assets/* files
    // are content-hashed in the filename, so they're safe to cache forever.
    const isIndexHtml = filePath === path.join(distPath, 'index.html');
    function cacheControlFor() {
        if (isIndexHtml) return 'no-cache, no-store, must-revalidate';
        if (req.url.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
        return 'public, max-age=3600';
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                // A request for a real, extensioned asset (e.g. a hashed
                // /assets/index-<hash>.js) that no longer exists means the caller
                // is running a STALE cached index.html pointing at a bundle we
                // deleted on redeploy. Return a genuine 404 so it fails loudly and
                // the browser recovers on reload — do NOT hand back index.html,
                // which the browser would try to execute as JavaScript (SyntaxError,
                // blank page, "can't log in on my laptop"). Only extensionless SPA
                // routes fall through to index.html below.
                const reqPath = req.url.split('?')[0];
                const reqExt = path.extname(reqPath);
                if (reqPath.startsWith('/assets/') || (reqExt && reqExt !== '.html')) {
                    console.log(`Stale/missing asset requested: ${reqPath} -> 404`);
                    res.writeHead(404, {
                        'Content-Type': 'text/plain',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    });
                    res.end('Not found');
                    return;
                }
                console.log(`File not found: ${filePath}, falling back to index.html`);
                // Fallback to index.html for SPA routing
                fs.readFile(path.join(distPath, 'index.html'), (err, indexContent) => {
                    if (err) {
                        console.error('CRITICAL: index.html missing from dist folder!');
                        res.writeHead(500);
                        res.end('Error: index.html not found. Build failed or dist folder empty.');
                    } else {
                        res.writeHead(200, {
                            'Content-Type': 'text/html',
                            'Cache-Control': 'no-cache, no-store, must-revalidate'
                        });
                        res.end(indexContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': cacheControlFor()
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Serving files from ${distPath}`);
});

// lava.top sales poll. The service is always on (starter plan), so an
// in-process timer is enough. First run shortly after boot so a deploy
// catches up on anything sold while it was restarting.
if (RECONCILE_SINCE && LAVA_API_KEY && SUPABASE_SERVICE_ROLE_KEY) {
    const runReconcile = () =>
        fulfilment.reconcile().then(
            (r) => {
                if (r.skipped) return;
                console.log(
                    `reconcile: ${r.paidInvoices} paid invoices since ${RECONCILE_SINCE}, ` +
                    `${r.fulfilled.length} fulfilled, ${r.retried.length} retried, ${r.errors.length} errors`
                );
            },
            (err) => console.error('reconcile threw:', err)
        );
    setTimeout(runReconcile, 20 * 1000);
    setInterval(runReconcile, Math.max(1, RECONCILE_INTERVAL_MIN) * 60 * 1000);
} else {
    console.warn('lava.top sales poll is OFF (needs RECONCILE_SINCE, LAVA_API_KEY, SUPABASE_SERVICE_ROLE_KEY)');
}

// monobank orders whose callback never came and whose buyer closed the page.
if (mono.configured && SUPABASE_SERVICE_ROLE_KEY) {
    const runSweep = () =>
        mono.sweep().then(
            (r) => {
                if (r.granted?.length || r.errors?.length) console.log('monobank sweep:', JSON.stringify(r));
            },
            (err) => console.error('monobank sweep threw:', err)
        );
    setTimeout(runSweep, 30 * 1000);
    setInterval(runSweep, Math.max(1, RECONCILE_INTERVAL_MIN) * 60 * 1000);
}
