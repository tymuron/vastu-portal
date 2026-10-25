// ---------------------------------------------------------------------------
// Purchase fulfilment — the ONE path every buyer goes through.
//
// Lava only tells us about contracts created with OUR API key — i.e. checkouts
// started on /buy/<offerId>. A purchase made on lava's own storefront page
// (app.lava.top/products/...) fires no webhook and is missing from every API
// report (checked 2026-10-23: the key's 27 invoices = the whole "sales"
// report; storefront buyers of May were all granted by hand). So every buy
// link must point at /buy/<offerId>.
//
// From there a buyer reaches us three ways: the lava webhook (instant), the
// invoice poll (safety net for a missed webhook), or a manual grant from
// /grant. All three call fulfil(), which:
//   1. records the purchase in public.purchases (idempotent by contract id),
//   2. maps the lava product/offer to our courses (public.course_offers),
//   3. makes sure the account exists — WITHOUT Supabase's own mailer,
//   4. grants one entitlement per course (VIP-aware merge),
//   5. sends ONE branded email through Resend: a durable access link plus the
//      Telegram channel/chat links of every course that was granted — but
//      only when this payment unlocked something new. Installments are
//      separate one-time purchases of the same product, so payments 2–4 (or
//      a double purchase) are logged without a second welcome email.
//
// Why not Supabase's invite email: it is rate-limited, lands in spam on
// mail.ru/yandex, its one-shot verify link gets eaten by mail scanners, and it
// is never sent at all to someone who already has an account (returning
// students bought a second course and heard nothing).
//
// Failures are written to public.purchases and emailed to ALERT_EMAIL, and the
// poll retries them, so a paid buyer can't silently fall through.
// ---------------------------------------------------------------------------

import crypto from 'crypto';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Telegram links of the «Васту для бизнеса» stream (were constants in
// server.js; the manual business welcome email still uses them).
export const TG_VIP_CHANNEL_URL = 'https://t.me/+pMxLYn9BUac1Zjky';
export const TG_VIP_CHAT_URL = 'https://t.me/+NOF9mWBLLSI2OWEy';
export const TG_STANDARD_CHANNEL_URL = 'https://t.me/+Nql1v_FqMvpiMWYy';
// "Чат потока" for Standard = "Общий чат потока" for VIP — same Telegram chat.
export const TG_GENERAL_CHAT_URL = 'https://t.me/+7I610xAqeeVjZmJi';

// ---------------------------------------------------------------------------
// What the welcome email says, per course (keyed by courses.slug).
//   name      — course name for the greeting (the base course of a tier)
//   tier      — tariff name, set on the bonus course a higher tier adds
//   start     — human start date, shown when present
//   links     — Telegram buttons; every granted course adds its own
//   exclusive — this course's links replace everyone else's (VIP has its
//               own channel instead of the standard one)
// A link with an empty url is skipped and reported by /api/admin/status, so
// fill them in before selling.
// ---------------------------------------------------------------------------
export const COURSE_WELCOME = {
    'vastu-design-2026': {
        name: '«Васту-дизайн»',
        start: '9 ноября',
        links: [
            { label: 'Канал курса', url: 'https://t.me/+hphCpJ038x81MzU0' },
            { label: 'Чат курса', url: 'https://t.me/+HTc2SwoPYRkwYTBk' },
        ],
    },
    // Наставничество uses the same channel and chat as Основной (Anna, 2026-10-23).
    'vastu-design-2026-pro': {
        tier: 'Наставничество',
        links: [],
    },
    'vastu-2': {
        name: '«Васту для бизнеса»',
        links: [
            { label: 'Канал потока', url: TG_STANDARD_CHANNEL_URL },
            { label: 'Чат потока', url: TG_GENERAL_CHAT_URL },
        ],
    },
    'vastu-2-vip': {
        tier: 'VIP',
        exclusive: true,
        links: [
            { label: 'VIP-канал', url: TG_VIP_CHANNEL_URL },
            { label: 'VIP-чат', url: TG_VIP_CHAT_URL },
            { label: 'Общий чат потока', url: TG_GENERAL_CHAT_URL },
        ],
    },
};

// Tiers offered on /grant. Each points at the lava product/offer id a real
// purchase would carry, so a manual grant gives exactly what a purchase gives
// (same courses, same expiry) through the same course_offers mapping.
export const GRANT_TIERS = [
    { key: 'design-base', label: 'Васту-дизайн · Основной', lavaId: 'ed760ac8-79d2-4f9e-9255-baeba0bdd1ac' },
    { key: 'design-pro', label: 'Васту-дизайн · Наставничество', lavaId: '34229951-b58e-424a-b1d1-d26823fd0373' },
    { key: 'standard', label: 'Васту для бизнеса · Стандарт', lavaId: 'caa3c132-dca3-438d-b424-eafff3dd3033' },
    { key: 'vip', label: 'Васту для бизнеса · VIP', lavaId: '1daaffb0-e3aa-44a9-98f6-5e1a986a79b3' },
];

export function missingWelcomeLinks() {
    const missing = [];
    for (const [slug, cfg] of Object.entries(COURSE_WELCOME)) {
        for (const link of cfg.links || []) {
            if (!link.url) missing.push(`${slug}: ${link.label}`);
        }
    }
    return missing;
}

export function normEmail(email) {
    return String(email || '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Durable access link: /access?t=<signed email + expiry>. The token itself
// logs nobody in. Clicking it makes the server mint a fresh Supabase recovery
// token and redirect to /update-password, so the link in the email keeps
// working for weeks and a mail scanner opening it first doesn't burn it.
// ---------------------------------------------------------------------------
const ACCESS_LINK_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days — covers buying weeks before the start

function sign(secret, payload) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 32);
}

export function makeAccessToken(secret, email, now = Date.now()) {
    const payload = Buffer.from(
        JSON.stringify({ e: normEmail(email), x: Math.floor((now + ACCESS_LINK_TTL_MS) / 1000) })
    ).toString('base64url');
    return `${payload}.${sign(secret, payload)}`;
}

// -> { email } when valid, { email, expired: true } when signed but stale,
//    null when forged or garbled.
export function readAccessToken(secret, token, now = Date.now()) {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = sign(secret, payload);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    let data;
    try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!data?.e || !EMAIL_RE.test(data.e)) return null;
    if (!data.x || data.x * 1000 < now) return { email: data.e, expired: true };
    return { email: data.e };
}

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

// expires_at for one course_offers row with its course attached as
// row.courses. null = lifetime.
//   - is_lifetime offer                    -> null
//   - access_months on the offer           -> starts_at + that many months
//   - else access_duration_months of course -> starts_at + that many months
//   - course without starts_at / months    -> null (lifetime)
export function computeExpiresAt(offerRow) {
    if (!offerRow) return null;
    if (offerRow.is_lifetime) return null;
    const course = offerRow.courses || null;
    const startsAt = course?.starts_at || null;
    const months = offerRow.access_months ?? course?.access_duration_months;
    if (!startsAt || months == null) return null;
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCMonth(d.getUTCMonth() + Number(months));
    return d.toISOString();
}

// Manual per-row upsert into public.user_entitlements with VIP-aware merge.
//   - No existing row                  -> INSERT with computed expires_at
//   - Existing expires_at is null      -> keep null (lifetime stays lifetime)
//   - Incoming expires_at is null      -> UPDATE to null  (VIP/lifetime overrides standard)
//   - Both non-null                    -> UPDATE to GREATEST(existing, incoming)
// source / source_payment_id are NEVER overwritten on conflict — first record wins.
// Returns null on success, or a {message} error-shaped object on failure.
export async function upsertEntitlement(supabase, userId, courseId, expiresAt, sourcePaymentId, source = 'lava.top') {
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
            source,
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

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function findUserByEmail(supabase, email) {
    email = normEmail(email);

    // Preferred: the profiles table (auto-populated by the auth trigger).
    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
    if (profileErr) console.error('profiles lookup error:', profileErr.message);
    if (profile?.id) {
        const { data, error } = await supabase.auth.admin.getUserById(profile.id);
        if (!error && data?.user) return data.user;
    }

    // Fallback: page through auth users (traffic is low; capped at 10k).
    for (let page = 1; page <= 10; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) {
            console.error('listUsers error:', error.message);
            return null;
        }
        const match = data?.users?.find((u) => normEmail(u.email) === email);
        if (match) return match;
        if (!data?.users || data.users.length < 1000) return null;
    }
    return null;
}

function isAlreadyRegistered(err) {
    const msg = (err?.message || '').toLowerCase();
    return (
        msg.includes('already registered') ||
        msg.includes('already been registered') ||
        msg.includes('already exists') ||
        err?.status === 422
    );
}

// -> { user, created }. Creates a confirmed, password-less account; nothing
// is emailed by Supabase. The buyer sets the password through our link.
export async function ensureUser(supabase, email) {
    let user = await findUserByEmail(supabase, email);
    if (user) {
        // Invited-but-never-accepted accounts from the old flow: confirm them
        // so the recovery link we mint later is accepted.
        if (!user.email_confirmed_at) {
            const { data } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
            if (data?.user) user = data.user;
        }
        return { user, created: false };
    }

    const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
    if (!error && data?.user) return { user: data.user, created: true };
    if (error && isAlreadyRegistered(error)) {
        user = await findUserByEmail(supabase, email);
        if (user) return { user, created: false };
    }
    throw new Error(`createUser failed for ${email}: ${error?.message || 'no user returned'}`);
}

// ---------------------------------------------------------------------------
// Welcome email
// ---------------------------------------------------------------------------

// Every email is designed light (cream + burgundy). Without this, the Gmail
// apps' dark mode repaints it themselves: cream turns olive, burgundy text
// pink, the button inverts. "light only" makes Gmail iOS/Android (since
// Oct 2026) and Apple Mail show it as designed.
export const EMAIL_LIGHT_ONLY_HEAD = `<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>`;

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Merge the welcome config of every granted course into one email's content.
export function welcomeContent(courses) {
    const cfgs = courses.map((c) => ({ course: c, cfg: COURSE_WELCOME[c.slug] || {} }));
    const primary = cfgs.find((x) => x.cfg.name) || cfgs[0] || null;
    const tier = cfgs.find((x) => x.cfg.tier)?.cfg.tier || null;
    const exclusive = cfgs.find((x) => x.cfg.exclusive);
    const source = exclusive ? [exclusive] : cfgs;
    const seen = new Set();
    const links = [];
    for (const { cfg } of source) {
        for (const link of cfg.links || []) {
            if (!link.url || seen.has(link.url)) continue;
            seen.add(link.url);
            links.push(link);
        }
    }
    return {
        name: primary ? primary.cfg.name || `«${primary.course.title}»` : null,
        tier,
        start: primary?.cfg.start || null,
        links,
    };
}

// reason: 'purchase' (just bought) | 'request' (asked for a login link)
// returning: true when the account has logged in before (knows its password)
export function buildWelcomeEmail({ email, courses, accessUrl, loginUrl, returning, reason = 'purchase' }) {
    const c = welcomeContent(courses);
    const loginHost = loginUrl.replace(/^https?:\/\//, '').replace(/\/login$/, '');
    const courseLine = c.name
        ? `${c.name}${c.tier ? ` — тариф «${c.tier}»` : ''}`
        : null;

    const subject =
        reason === 'request'
            ? 'Ссылка для входа в личный кабинет'
            : courseLine
                ? `Добро пожаловать на курс ${c.name}`
                : 'Доступ к личному кабинету';

    const intro =
        reason === 'request'
            ? 'Вы запросили ссылку для входа в личный кабинет.'
            : courseLine
                ? `Добро пожаловать на курс ${courseLine}. Очень рада, что вы с нами.`
                : 'Ваш доступ к курсу открыт.';

    // Access block: new accounts set a password first; returning students
    // just log in, with the link as the "forgot password" escape hatch.
    const accessText = returning
        ? `Курс уже добавлен в ваш личный кабинет. Входите как обычно — почта <strong>${esc(email)}</strong> и ваш пароль.`
        : `Нажмите кнопку — откроется страница, где вы придумаете пароль. Дальше входите на <strong>${esc(loginHost)}</strong> с почтой <strong>${esc(email)}</strong> и этим паролем.`;
    const primaryBtn = returning
        ? { href: loginUrl, label: 'Войти в личный кабинет' }
        : { href: accessUrl, label: 'Задать пароль и войти' };

    const btn = (href, label, dark = true) =>
        `<a href="${esc(href)}" style="display:inline-block;background-color:${dark ? '#422326' : '#F2EDE2'};color:${dark ? '#F2EDE2' : '#422326'};text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;padding:13px 24px;border:1px solid #422326;margin:6px 4px;">${esc(label)}</a>`;

    const tgBlock = c.links.length
        ? `<tr><td style="padding:16px 24px 0 24px;font-size:16px;line-height:1.75;color:#422326;">
              <p style="margin:0 0 8px 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:20px;">Наше пространство в Telegram</p>
              <p style="margin:0;">${reason === 'request' ? 'И на всякий случай ссылки на канал и чат:' : 'Делюсь ссылками — вступайте сразу, все объявления будут там:'}</p>
           </td></tr>
           <tr><td align="center" style="padding:8px 24px 8px 24px;">${c.links.map((l) => btn(l.url, l.label)).join('\n')}</td></tr>`
        : '';

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
${EMAIL_LIGHT_ONLY_HEAD}
<title>${esc(subject)}</title>
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
          <tr><td style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" /></td></tr>
          <tr>
            <td align="center" style="padding:8px 24px;">
              <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;font-size:30px;color:#422326;margin:0 0 16px 0;">Здравствуйте 🤍</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 0 24px;font-size:16px;line-height:1.75;color:#422326;">
              <p style="margin:0 0 20px 0;">${esc(intro)}</p>
              <p style="margin:0 0 8px 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:20px;">Личный кабинет</p>
              <p style="margin:0;">${accessText}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 4px 24px;">
              ${btn(primaryBtn.href, primaryBtn.label)}
            </td>
          </tr>
          ${returning ? `<tr><td align="center" style="padding:0 24px 8px 24px;font-size:14px;color:#7a5a3a;"><a href="${esc(accessUrl)}" style="color:#8a6a3b;">Не помню пароль — задать новый</a></td></tr>` : ''}
          ${tgBlock}
          <tr>
            <td style="padding:16px 24px;font-size:15px;line-height:1.7;color:#422326;">
              ${c.start && reason === 'purchase' ? `<p style="margin:0 0 12px 0;"><strong>Старт потока — ${esc(c.start)}.</strong> Очень жду 🙌</p>` : ''}
              <p style="margin:0;">Если кнопка не открывается или что-то пошло не так — напишите <a href="https://t.me/tymuron" style="color:#8a6a3b;">@tymuron</a> в Telegram, поможем.</p>
            </td>
          </tr>
          <tr><td style="padding:24px 24px 8px 24px;"><hr style="border:none;border-top:1px solid #d9c9a8;margin:24px 0;" /></td></tr>
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

    // Plain-text twin: mail.ru / yandex score HTML-only mail as spam-like.
    const text = [
        'Здравствуйте!',
        '',
        intro,
        '',
        returning
            ? `Курс уже добавлен в ваш личный кабинет. Входите как обычно — почта ${email} и ваш пароль: ${loginUrl}`
            : `Задайте пароль и войдите по ссылке: ${accessUrl}`,
        returning ? `Не помните пароль — задайте новый: ${accessUrl}` : `Дальше входите на ${loginHost} с почтой ${email} и этим паролем.`,
        ...(c.links.length ? ['', 'Telegram:', ...c.links.map((l) => `${l.label}: ${l.url}`)] : []),
        ...(c.start && reason === 'purchase' ? ['', `Старт потока — ${c.start}.`] : []),
        '',
        'Если что-то не открывается — напишите @tymuron в Telegram (https://t.me/tymuron).',
        '',
        'Anna Romeo',
    ].join('\n');

    return { subject, html, text };
}

export function makeResendSender({ apiKey, from, base = 'https://api.resend.com' }) {
    return async function sendEmail({ to, subject, html, text, idempotencyKey }) {
        if (!apiKey) throw new Error('RESEND_API_KEY not configured');
        const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
        const resp = await fetch(`${base}/emails`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ from, to, subject, html, text })
        });
        const body = await resp.text().catch(() => '');
        if (!resp.ok) throw new Error(`Resend ${resp.status}: ${body.slice(0, 300)}`);
        try {
            return JSON.parse(body)?.id || null;
        } catch {
            return null;
        }
    };
}

// ---------------------------------------------------------------------------
// The fulfilment service
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 8;

export function createFulfilment({
    getSupabase,
    sendEmail,
    appUrl,
    accessSecret,
    alertEmail,
    lavaApiKey,
    lavaBase = 'https://gate.lava.top',
    reconcileSince,
}) {
    const appBase = (appUrl || 'https://vastu-portal-app.onrender.com').replace(/\/$/, '');
    const loginUrl = `${appBase}/login`;

    // Serialize work per contract id: the webhook and the poll can land on the
    // same purchase at the same moment, and only one of them may send the email.
    const inflight = new Map();
    function withLock(key, fn) {
        const prev = inflight.get(key) || Promise.resolve();
        const run = prev.catch(() => {}).then(fn);
        const tail = run.catch(() => {});
        inflight.set(key, tail);
        tail.then(() => {
            if (inflight.get(key) === tail) inflight.delete(key);
        });
        return run;
    }

    // Alerts to Tymur: one email per distinct problem per 30 minutes.
    const recentAlerts = new Map();
    async function alert(subject, details) {
        console.error(`[ALERT] ${subject}`, details || '');
        if (!alertEmail) return;
        const last = recentAlerts.get(subject);
        if (last && Date.now() - last < 30 * 60 * 1000) return;
        recentAlerts.set(subject, Date.now());
        try {
            await sendEmail({
                to: alertEmail,
                subject: `⚠ Васту-платформа: ${subject}`,
                text: `${subject}\n\n${typeof details === 'string' ? details : JSON.stringify(details, null, 2)}\n\nВсе оплаты: ${appBase}/grant`,
                html: `<pre style="font-family:Menlo,monospace;font-size:13px;white-space:pre-wrap;">${esc(subject)}\n\n${esc(typeof details === 'string' ? details : JSON.stringify(details, null, 2))}</pre><p><a href="${appBase}/grant">Все оплаты</a></p>`,
            });
        } catch (err) {
            console.error('alert email failed:', err?.message || err);
        }
    }

    function accessUrlFor(email) {
        return `${appBase}/access?t=${makeAccessToken(accessSecret, email)}`;
    }

    // course_offers rows (+ their course) for the first id that maps to any.
    // Order matters: the invoice-resolved offer id beats the bare product id.
    async function resolveOfferRows(supabase, lavaIds) {
        for (const id of lavaIds.filter(Boolean)) {
            const { data: rows, error } = await supabase
                .from('course_offers')
                .select('course_id, is_lifetime, access_months')
                .eq('lava_offer_id', id);
            if (error) throw new Error(`course_offers lookup failed: ${error.message}`);
            if (!rows || rows.length === 0) continue;
            const { data: courses, error: cErr } = await supabase
                .from('courses')
                .select('id, slug, title, starts_at, access_duration_months')
                .in('id', rows.map((r) => r.course_id));
            if (cErr) throw new Error(`courses lookup failed: ${cErr.message}`);
            const byId = new Map((courses || []).map((c) => [c.id, c]));
            return { matchedId: id, rows: rows.map((r) => ({ ...r, courses: byId.get(r.course_id) || null })) };
        }
        return { matchedId: null, rows: [] };
    }

    async function updatePurchase(supabase, contractId, patch) {
        const { error } = await supabase
            .from('purchases')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('contract_id', contractId);
        if (error) console.error(`purchases update failed for ${contractId}:`, error.message);
    }

    // Courses the user can open right now (for the "send me my link" email).
    async function activeCourses(supabase, userId) {
        const { data: ents, error } = await supabase
            .from('user_entitlements')
            .select('course_id, expires_at')
            .eq('user_id', userId);
        if (error || !ents?.length) return [];
        const now = Date.now();
        const ids = ents.filter((e) => !e.expires_at || new Date(e.expires_at).getTime() > now).map((e) => e.course_id);
        if (!ids.length) return [];
        const { data: courses } = await supabase.from('courses').select('id, slug, title').in('id', ids);
        return courses || [];
    }

    async function sendWelcome(supabase, { contractId, user, courses, reason, idempotencyKey }) {
        const email = normEmail(user.email);
        const { subject, html, text } = buildWelcomeEmail({
            email,
            courses,
            accessUrl: accessUrlFor(email),
            loginUrl,
            returning: !!user.last_sign_in_at,
            reason,
        });
        return sendEmail({ to: email, subject, html, text, idempotencyKey });
    }

    // The single entry point. Safe to call any number of times for the same
    // contract: entitlements merge, and the email goes out once.
    //   lavaIds   — ids to map, most specific first ([offerId, productId])
    //   sendEmail — false for a silent manual grant
    //   resend    — true to send the welcome email again even if it went out
    async function fulfil({ contractId, email, lavaIds, source, amount = null, currency = null, sendEmail: wantEmail = true, resend = false }) {
        return withLock(contractId, async () => {
            const supabase = getSupabase();
            email = normEmail(email);

            const { data: existing, error: exErr } = await supabase
                .from('purchases')
                .select('*')
                .eq('contract_id', contractId)
                .maybeSingle();
            if (exErr) throw new Error(`purchases lookup failed: ${exErr.message}`);

            if (existing?.status === 'granted' && (existing.email_sent_at || existing.email_skipped_reason || !wantEmail) && !resend) {
                return { status: 'granted', already: true, userId: existing.user_id, courseSlugs: existing.course_slugs };
            }

            const ids = (lavaIds || []).filter(Boolean);
            if (!existing) {
                const { error: insErr } = await supabase.from('purchases').insert({
                    contract_id: contractId,
                    email,
                    lava_ids: ids,
                    source,
                    status: 'processing',
                    amount,
                    currency,
                });
                if (insErr) throw new Error(`purchases insert failed: ${insErr.message}`);
            }
            const attempts = (existing?.attempts || 0) + 1;

            if (!EMAIL_RE.test(email)) {
                await updatePurchase(supabase, contractId, { status: 'error', error: 'invalid email', attempts: MAX_ATTEMPTS });
                await alert(`оплата с неверной почтой «${email}»`, { contractId, source, lavaIds: ids });
                return { status: 'error', error: 'invalid email' };
            }

            try {
                const { matchedId, rows } = await resolveOfferRows(supabase, ids);
                if (!rows.length) {
                    await updatePurchase(supabase, contractId, { status: 'unmapped', attempts, error: `no course_offers row for ${ids.join(', ') || '(no id)'}` });
                    await alert(`оплата не привязана ни к одному курсу (${ids.join(', ')})`, { contractId, email, source });
                    return { status: 'unmapped' };
                }

                const { user, created } = await ensureUser(supabase, email);

                for (const row of rows) {
                    const err = await upsertEntitlement(
                        supabase,
                        user.id,
                        row.course_id,
                        computeExpiresAt(row),
                        contractId,
                        source === 'manual' ? 'manual' : 'lava.top'
                    );
                    if (err) throw new Error(`user_entitlements upsert failed: ${err.message}`);
                }

                const courses = rows.map((r) => r.courses).filter(Boolean);
                const courseSlugs = courses.map((c) => c.slug);

                // Did this payment unlock anything? An entitlement remembers the
                // contract that created it (source_payment_id, first record wins),
                // so this also holds when an earlier attempt of this same contract
                // crashed after granting. Decided once, on the first grant.
                let unlockedSomething = true;
                if (existing?.status !== 'granted' && source !== 'manual') {
                    const { data: ents, error: entErr } = await supabase
                        .from('user_entitlements')
                        .select('source_payment_id')
                        .eq('user_id', user.id)
                        .in('course_id', rows.map((r) => r.course_id));
                    if (entErr) throw new Error(`user_entitlements lookup failed: ${entErr.message}`);
                    unlockedSomething = (ents || []).some((e) => e.source_payment_id === contractId);
                }

                await updatePurchase(supabase, contractId, {
                    status: 'granted',
                    user_id: user.id,
                    course_slugs: courseSlugs,
                    matched_lava_id: matchedId,
                    attempts,
                    error: null,
                    ...(unlockedSomething ? {} : { email_skipped_reason: 'повторная оплата — доступ уже был' }),
                });

                let emailResult = { sent: false, skipped: !wantEmail || !unlockedSomething };
                if (wantEmail && unlockedSomething && (resend || !existing?.email_sent_at)) {
                    const emailAttempts = (existing?.email_attempts || 0) + 1;
                    try {
                        const id = await sendWelcome(supabase, {
                            contractId,
                            user,
                            courses,
                            reason: 'purchase',
                            idempotencyKey: `welcome/${contractId}/${emailAttempts}`,
                        });
                        await updatePurchase(supabase, contractId, {
                            email_sent_at: new Date().toISOString(),
                            email_id: id,
                            email_attempts: emailAttempts,
                            email_error: null,
                        });
                        emailResult = { sent: true, id };
                    } catch (err) {
                        await updatePurchase(supabase, contractId, { email_attempts: emailAttempts, email_error: String(err?.message || err) });
                        await alert(`письмо покупателю не ушло (${email})`, { contractId, error: String(err?.message || err) });
                        emailResult = { sent: false, error: String(err?.message || err) };
                    }
                }

                return { status: 'granted', userId: user.id, created, courseSlugs, email: emailResult, accessUrl: accessUrlFor(email) };
            } catch (err) {
                await updatePurchase(supabase, contractId, { status: 'error', attempts, error: String(err?.message || err) });
                await alert(`оплата не обработана (${email})`, { contractId, source, error: String(err?.message || err) });
                throw err;
            }
        });
    }

    // "Send me my link" — for someone who lost the email or the password.
    // Says nothing about whether the address exists.
    async function requestAccessEmail(email) {
        email = normEmail(email);
        if (!EMAIL_RE.test(email)) return { sent: false };
        const supabase = getSupabase();
        const user = await findUserByEmail(supabase, email);
        if (!user) return { sent: false };
        if (!user.email_confirmed_at) {
            await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
        }
        const courses = await activeCourses(supabase, user.id);
        await sendWelcome(supabase, { user: { ...user, last_sign_in_at: null }, courses, reason: 'request' });
        return { sent: true };
    }

    // GET /access?t=... -> fresh recovery token -> /update-password.
    async function accessRedirect(token) {
        const info = readAccessToken(accessSecret, token);
        if (!info) return `${appBase}/forgot-password?invalid=1`;
        const emailQ = encodeURIComponent(info.email);
        if (info.expired) return `${appBase}/forgot-password?expired=1&email=${emailQ}`;
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email: info.email });
        const hashed = data?.properties?.hashed_token;
        if (error || !hashed) {
            console.error('access link: generateLink failed:', error?.message || 'no hashed_token');
            return `${appBase}/forgot-password?failed=1&email=${emailQ}`;
        }
        return `${appBase}/update-password?token_hash=${encodeURIComponent(hashed)}&type=recovery`;
    }

    // ------------------------------------------------------------------
    // Invoice poll: every COMPLETED contract of our API key must end up as a
    // granted purchase with its email sent — in case a webhook never arrived.
    // Lava's invoice list carries the contract id the webhook uses (so the two
    // never double up) but no product/offer id; lava_invoices, written by
    // /buy when the checkout started, says which offer it was. Also retries
    // anything that failed earlier.
    // ------------------------------------------------------------------
    async function lavaGet(pathAndQuery) {
        const resp = await fetch(`${lavaBase}${pathAndQuery}`, {
            headers: { 'X-Api-Key': lavaApiKey, Accept: 'application/json' }
        });
        const text = await resp.text();
        if (!resp.ok) {
            const err = new Error(`lava ${resp.status} ${pathAndQuery}: ${text.slice(0, 200)}`);
            err.status = resp.status;
            throw err;
        }
        return text ? JSON.parse(text) : null;
    }

    // Pages count from 1; `pages` is the page count (observed 2026-10-23).
    async function listCompletedInvoices(sinceMs) {
        const beginDate = new Date(sinceMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
        const out = new Map();
        for (let page = 1; page <= 50; page++) {
            const q = new URLSearchParams({ page: String(page), size: '100', beginDate, invoiceStatuses: 'COMPLETED' });
            const body = await lavaGet(`/api/v1/invoices?${q}`);
            const items = body?.items || [];
            for (const it of items) {
                if (!it?.id || String(it.status).toUpperCase() !== 'COMPLETED') continue;
                const at = Date.parse(it.datetime || '');
                if (at && at < sinceMs) continue;
                out.set(it.id, {
                    contractId: it.id,
                    email: it.buyer?.email || '',
                    createdAt: it.datetime || null,
                    amount: it.receipt?.amount ?? null,
                    currency: it.receipt?.currency ?? null,
                    productName: it.product?.name || null,
                });
            }
            const pages = Number(body?.pages ?? body?.totalPages ?? 0);
            if (!items.length || page >= pages) break;
        }
        return [...out.values()];
    }

    // Tariff name + prices for /buy/<offerId>, from lava's product list
    // (cached 10 min). Hidden products included — the installment and
    // discount tariffs aren't public on lava.
    let catalog = { at: 0, offers: new Map() };
    async function offerInfo(offerId) {
        if (Date.now() - catalog.at > 10 * 60 * 1000 || !catalog.offers.size) {
            const offers = new Map();
            let next = '/api/v2/products?feedVisibility=ALL';
            for (let guard = 0; next && guard < 10; guard++) {
                const body = await lavaGet(next);
                for (const item of body?.items || []) {
                    const product = item?.data || item;
                    for (const offer of product?.offers || []) {
                        const prices = {};
                        for (const pr of offer.prices || []) prices[pr.currency] = pr.amount;
                        offers.set(offer.id, { offerId: offer.id, productId: product.id, title: product.title || offer.name || '', prices });
                    }
                }
                next = body?.nextPage ? body.nextPage.replace(/^https?:\/\/[^/]+/, '') : null;
            }
            catalog = { at: Date.now(), offers };
        }
        return catalog.offers.get(offerId) || null;
    }

    let lastReconcile = null;
    let reconcileRunning = false;

    async function reconcile({ dryRun = false } = {}) {
        if (!lavaApiKey) return { skipped: 'LAVA_API_KEY not configured' };
        const sinceMs = reconcileSince ? Date.parse(reconcileSince) : NaN;
        if (Number.isNaN(sinceMs)) return { skipped: 'RECONCILE_SINCE not configured' };
        if (reconcileRunning) return { skipped: 'already running' };
        reconcileRunning = true;
        const startedAt = new Date().toISOString();
        const result = { startedAt, dryRun, paidInvoices: 0, pending: [], fulfilled: [], retried: [], errors: [] };
        try {
            const supabase = getSupabase();
            let invoices = [];
            try {
                invoices = await listCompletedInvoices(sinceMs);
            } catch (err) {
                result.errors.push({ error: String(err?.message || err) });
            }
            result.paidInvoices = invoices.length;

            if (invoices.length) {
                const ids = invoices.map((i) => i.contractId);
                const [{ data: known, error: kErr }, { data: started, error: sErr }] = await Promise.all([
                    supabase.from('purchases').select('contract_id, status, email_sent_at, email_skipped_reason').in('contract_id', ids),
                    supabase.from('lava_invoices').select('contract_id, offer_id').in('contract_id', ids),
                ]);
                if (kErr || sErr) throw new Error(`lookup failed: ${(kErr || sErr).message}`);
                const knownBy = new Map((known || []).map((p) => [p.contract_id, p]));
                const offerBy = new Map((started || []).map((r) => [r.contract_id, r.offer_id]));

                for (const inv of invoices) {
                    const k = knownBy.get(inv.contractId);
                    if (k && k.status === 'granted' && (k.email_sent_at || k.email_skipped_reason)) continue;
                    // Known but not granted: the retry pass below owns it (attempt-capped).
                    if (k && k.status !== 'granted') continue;
                    const offerId = offerBy.get(inv.contractId) || null;
                    result.pending.push({ ...inv, offerId });
                    if (dryRun) continue;
                    try {
                        const r = await fulfil({
                            contractId: inv.contractId,
                            email: inv.email,
                            lavaIds: [offerId],
                            source: 'poll',
                            amount: inv.amount,
                            currency: inv.currency,
                        });
                        result.fulfilled.push({ contractId: inv.contractId, email: inv.email, status: r.status, emailSent: !!r.email?.sent });
                    } catch (err) {
                        result.errors.push({ contractId: inv.contractId, error: String(err?.message || err) });
                    }
                }
            }

            // Retry anything that failed earlier, whatever its source.
            const { data: stuck } = await supabase
                .from('purchases')
                .select('contract_id, email, lava_ids, source, status, email_sent_at, attempts, email_attempts, updated_at')
                .in('status', ['error', 'processing', 'granted'])
                .is('email_sent_at', null)
                .is('email_skipped_reason', null)
                .lt('attempts', MAX_ATTEMPTS)
                .limit(50);
            for (const p of stuck || []) {
                if (p.source === 'manual' && p.status === 'granted') continue; // silent grants stay silent
                if ((p.email_attempts || 0) >= MAX_ATTEMPTS) continue;
                // A row still 'processing' may be a webhook that is running right now.
                if (p.status === 'processing' && Date.now() - Date.parse(p.updated_at || 0) < 10 * 60 * 1000) continue;
                if (dryRun) {
                    result.retried.push({ contractId: p.contract_id, email: p.email, status: p.status, dryRun: true });
                    continue;
                }
                try {
                    const r = await fulfil({ contractId: p.contract_id, email: p.email, lavaIds: p.lava_ids || [], source: p.source });
                    result.retried.push({ contractId: p.contract_id, email: p.email, status: r.status, emailSent: !!r.email?.sent });
                } catch (err) {
                    result.errors.push({ contractId: p.contract_id, error: String(err?.message || err) });
                }
            }
        } catch (err) {
            result.errors.push({ error: String(err?.message || err) });
        } finally {
            reconcileRunning = false;
        }
        result.finishedAt = new Date().toISOString();
        if (!dryRun) {
            lastReconcile = result;
            if (result.errors.length) await alert('сверка оплат с lava.top завершилась с ошибками', result.errors);
        }
        return result;
    }

    function status() {
        return {
            reconcile: {
                enabled: !!lavaApiKey && !Number.isNaN(reconcileSince ? Date.parse(reconcileSince) : NaN),
                since: reconcileSince || null,
                last: lastReconcile,
            },
            alertEmail: !!alertEmail,
            missingWelcomeLinks: missingWelcomeLinks(),
        };
    }

    return { fulfil, requestAccessEmail, accessRedirect, accessUrlFor, reconcile, status, alert, offerInfo };
}
