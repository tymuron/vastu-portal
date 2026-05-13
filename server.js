import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

async function findUserIdByEmail(supabase, email) {
    // Preferred: hit the profiles table (auto-populated by trigger).
    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

    if (profileErr) {
        console.error('profiles lookup error:', profileErr.message);
    }
    if (profile?.id) return profile.id;

    // Fallback: list users from auth and filter client-side.
    // Acceptable since traffic is low; paginates 1000 at a time.
    let page = 1;
    const perPage = 1000;
    // Cap iterations to avoid runaway loops.
    for (let i = 0; i < 10; i++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) {
            console.error('listUsers error:', error.message);
            return null;
        }
        const match = data?.users?.find(
            (u) => (u.email || '').toLowerCase() === email.toLowerCase()
        );
        if (match) return match.id;
        if (!data?.users || data.users.length < perPage) return null;
        page += 1;
    }
    return null;
}

// Compute expires_at for one course_offers row joined with its course.
// Returns an ISO string, or null for "lifetime" (no expiry).
//   - is_lifetime offer  -> null
//   - course not configured for time-limit -> null (default to lifetime)
//   - otherwise: starts_at + access_duration_months months
function computeExpiresAt(offerRow) {
    if (!offerRow) return null;
    if (offerRow.is_lifetime) return null;
    const course = offerRow.courses || null;
    const startsAt = course?.starts_at || null;
    const months = course?.access_duration_months;
    if (!startsAt || months == null) return null;
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCMonth(d.getUTCMonth() + Number(months));
    return d.toISOString();
}

// Manual per-row upsert into public.user_entitlements with VIP-aware merge.
// Merge rules:
//   - No existing row                  -> INSERT with computed expires_at
//   - Existing expires_at is null      -> keep null (lifetime stays lifetime)
//   - Incoming expires_at is null      -> UPDATE to null  (VIP/lifetime overrides standard)
//   - Both non-null                    -> UPDATE to GREATEST(existing, incoming)
// source / source_payment_id are NEVER overwritten on conflict — first record wins.
// Returns null on success, or a {message} error-shaped object on failure.
async function upsertEntitlement(supabase, userId, courseId, expiresAt, sourcePaymentId) {
    const { data: existing, error: selErr } = await supabase
        .from('user_entitlements')
        .select('id, expires_at')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .maybeSingle();

    if (selErr) return selErr;

    if (!existing) {
        const { error: insErr } = await supabase.from('user_entitlements').insert({
            user_id: userId,
            course_id: courseId,
            source: 'lava.top',
            source_payment_id: sourcePaymentId,
            expires_at: expiresAt
        });
        return insErr || null;
    }

    // Existing already lifetime -> nothing to change.
    if (existing.expires_at === null) return null;

    // Incoming is lifetime -> upgrade to lifetime.
    if (expiresAt === null) {
        const { error: updErr } = await supabase
            .from('user_entitlements')
            .update({ expires_at: null })
            .eq('id', existing.id);
        return updErr || null;
    }

    // Both non-null -> keep the latest expiry.
    const existingMs = new Date(existing.expires_at).getTime();
    const incomingMs = new Date(expiresAt).getTime();
    if (incomingMs > existingMs) {
        const { error: updErr } = await supabase
            .from('user_entitlements')
            .update({ expires_at: expiresAt })
            .eq('id', existing.id);
        return updErr || null;
    }
    return null;
}

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
        sendJson(res, 200, { ignored: true, reason: 'missing email or offer id' });
        return;
    }

    try {
        const supabase = getSupabaseAdmin();

        // 5. Look up the course(s) by lava offer id. One offer can map
        //    to multiple courses (e.g. a VIP offer grants access to both
        //    the base course and the VIP bonus course). Also pull
        //    is_lifetime from the offer + starts_at / access_duration_months
        //    from the joined course so we can compute expires_at per row.
        const { data: offerRows, error: offerErr } = await supabase
            .from('course_offers')
            .select('course_id, is_lifetime, courses(starts_at, access_duration_months)')
            .eq('lava_offer_id', offerId);

        if (offerErr) {
            console.error('course_offers lookup error:', offerErr.message);
            sendJson(res, 500, { error: 'course_offers lookup failed' });
            return;
        }
        if (!offerRows || offerRows.length === 0) {
            console.warn(`Lava webhook: unknown offer id ${offerId}`);
            sendJson(res, 200, { ignored: true, reason: 'unknown offer' });
            return;
        }
        const courseIds = offerRows.map((r) => r.course_id);

        // 6. Invite or look up the user
        let userId = null;
        let invited = false;
        const redirectTo = APP_URL ? `${APP_URL.replace(/\/$/, '')}/update-password` : undefined;
        const inviteOptions = redirectTo ? { redirectTo } : undefined;

        const { data: inviteData, error: inviteErr } =
            await supabase.auth.admin.inviteUserByEmail(email, inviteOptions);

        if (!inviteErr && inviteData?.user?.id) {
            userId = inviteData.user.id;
            invited = true;
        } else if (inviteErr) {
            const msg = (inviteErr.message || '').toLowerCase();
            const status = inviteErr.status;
            const alreadyExists =
                msg.includes('already registered') ||
                msg.includes('already been registered') ||
                msg.includes('already exists') ||
                status === 422;

            if (alreadyExists) {
                userId = await findUserIdByEmail(supabase, email);
                if (!userId) {
                    console.error(`Lava webhook: existing user not found for ${email}`);
                    sendJson(res, 500, { error: 'User exists but id not found' });
                    return;
                }
            } else {
                console.error('inviteUserByEmail error:', inviteErr.message);
                sendJson(res, 500, { error: inviteErr.message });
                return;
            }
        }

        if (!userId) {
            console.error('Lava webhook: failed to resolve user id');
            sendJson(res, 500, { error: 'Could not resolve user id' });
            return;
        }

        // 7. Compute expires_at per offer row and upsert one entitlement
        //    per mapped course. Merge rules are encoded in upsertEntitlement().
        const expiresAtPerCourse = [];
        for (const row of offerRows) {
            const expiresAt = computeExpiresAt(row);
            expiresAtPerCourse.push(expiresAt);
            const upsertErr = await upsertEntitlement(
                supabase,
                userId,
                row.course_id,
                expiresAt,
                paymentId
            );
            if (upsertErr) {
                console.error('user_entitlements upsert error:', upsertErr.message);
                sendJson(res, 500, { error: upsertErr.message });
                return;
            }
        }

        // 8. Done
        sendJson(res, 200, {
            success: true,
            user_id: userId,
            course_ids: courseIds,
            expires_at: expiresAtPerCourse,
            invited
        });
    } catch (err) {
        console.error('Lava webhook unexpected error:', err);
        sendJson(res, 500, { error: err?.message || 'Internal error' });
    }
}

// ---------------------------------------------------------------------------
// Lava invoice creation (server -> Lava /api/v3/invoice)
// ---------------------------------------------------------------------------

const ALLOWED_CURRENCIES = new Set(['RUB', 'EUR', 'USD']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

    try {
        const lavaResp = await fetch('https://gate.lava.top/api/v3/invoice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Api-Key': LAVA_API_KEY
            },
            body: JSON.stringify({ email, offerId, currency })
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

        sendJson(res, 200, { paymentUrl });
    } catch (err) {
        console.error('Lava invoice fetch threw:', err);
        sendJson(res, 502, { error: 'Failed to reach Lava' });
    }
}

// ---------------------------------------------------------------------------
// Community welcome email (Telegram channel + chat invite)
//
// Sent on top of the standard Supabase invite (the password-setup one) so
// buyers also get the curated Telegram links matching Anna's brand voice.
// Triggered manually for now via the /api/admin/welcome-email endpoint;
// we'll wire it into the webhook flow once both VIP and Standard variants
// are finalized with Anna.
// ---------------------------------------------------------------------------

// Verified sender for Resend (annaromeo.design DKIM/SPF/DMARC live since
// 2026-05-13). Anna doesn't need a real mailbox at hello@ — Resend just
// uses this string in the From header.
const RESEND_FROM = 'Anna Romeo <hello@annaromeo.design>';

// TODO: move these to env vars once Anna confirms they're stable.
const TG_VIP_CHANNEL_URL = 'https://t.me/+pMxLYn9BUac1Zjky';
const TG_VIP_CHAT_URL = 'https://t.me/+NOF9mWBLLSI2OWEy';
const TG_STANDARD_CHANNEL_URL = 'https://t.me/+Nql1v_FqMvpiMWYy';
// "Чат потока" for Standard = "Общий чат потока" for VIP — same Telegram chat.
const TG_GENERAL_CHAT_URL = 'https://t.me/+7I610xAqeeVjZmJi';

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
        const resp = await fetch('https://api.resend.com/emails', {
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
                const resp = await fetch('https://api.resend.com/emails', {
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

const server = http.createServer((req, res) => {
    console.log(`Request: ${req.method} ${req.url}`);

    // Lava.top payment webhook (must short-circuit before static logic)
    const urlPath = req.url.split('?')[0];
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

    // Health Check
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
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
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpg'; break;
        case '.svg': contentType = 'image/svg+xml'; break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                console.log(`File not found: ${filePath}, falling back to index.html`);
                // Fallback to index.html for SPA routing
                fs.readFile(path.join(distPath, 'index.html'), (err, indexContent) => {
                    if (err) {
                        console.error('CRITICAL: index.html missing from dist folder!');
                        res.writeHead(500);
                        res.end('Error: index.html not found. Build failed or dist folder empty.');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(indexContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Serving files from ${distPath}`);
});
