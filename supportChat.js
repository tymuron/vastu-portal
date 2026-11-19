// ---------------------------------------------------------------------------
// Support chat Telegram bot for «Васту для бизнеса» (50 000 ₽ tariff).
//
// Runs inside the portal's own Node server (server.js) — no separate service:
//   - POST /api/telegram/support-bot  — Telegram webhook (secret header checked)
//   - POST /api/cron/support-chat     — hourly cron: T-7d reminder + expiry removal
//   - GET  /api/admin/support-chat    — counts and next 20 expiries (no tokens)
//   - POST /api/admin/support-chat/set-webhook — one-time admin webhook setup
//
// SUPPORT_CHAT = off (default) | dry-run | live.
// ---------------------------------------------------------------------------

import { formatDateRu } from './fulfilment.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_TTL_SEC = 24 * 60 * 60;
const REMINDER_WINDOW_MS = 7 * DAY_MS;

// ---------------------------------------------------------------------------
// Messages — kept in one place so the producer can edit wording easily.
// Polite Russian, «вы», from Anna Romeo's school.
// ---------------------------------------------------------------------------

export const SUPPORT_CHAT_MESSAGES = {
    welcome: (expiresDate) =>
        `Здравствуйте 🤍\n\nДобро пожаловать в чат поддержки курса «Васту для бизнеса» школы Анны Ромео!\n\nНажмите кнопку ниже, чтобы войти в чат. Ссылка одноразовая и действует сутки.` +
        (expiresDate ? `\n\nПоддержка в чате открыта до ${expiresDate}.` : ''),
    buttonJoin: 'Войти в чат',
    reminder: (expiresDate) =>
        `Через неделю, ${expiresDate}, заканчиваются 6 месяцев поддержки в чате курса «Васту для бизнеса». Если остались вопросы, задайте их в чате до этой даты.`,
    goodbye:
        'Сегодня закончились 6 месяцев поддержки в чате курса «Васту для бизнеса», поэтому бот выводит вас из чата. Спасибо, что были с нами 💛',
    notFound:
        'Ссылка не найдена или больше не действует. Пожалуйста, проверьте письмо с доступом к курсу или напишите нам в поддержку @tymuron — мы поможем.',
    expired: (expiresDate) =>
        `Поддержка в чате курса «Васту для бизнеса» закончилась ${expiresDate}. Если вы хотите продлить участие или у вас есть вопросы, напишите нам в поддержку @tymuron.`,
    otherAccount:
        'Эта ссылка уже привязана к другому аккаунту Telegram. Пожалуйста, откройте её с того аккаунта, с которого вы переходили ранее, или напишите в поддержку @tymuron — мы поможем.',
    technicalError:
        'Сейчас не удалось создать ссылку для входа в чат. Пожалуйста, попробуйте чуть позже или напишите в поддержку @tymuron.',
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function readSupportChatConfig(env = process.env) {
    const problems = [];

    const rawMode = String(env.SUPPORT_CHAT ?? '').trim().toLowerCase().replace('_', '-');
    let mode = 'off';
    if (['dry-run', 'dryrun'].includes(rawMode)) mode = 'dry-run';
    else if (rawMode === 'live') mode = 'live';
    else if (rawMode && rawMode !== 'off') {
        problems.push(`SUPPORT_CHAT=«${env.SUPPORT_CHAT}» не понят (нужно off, dry-run или live) — бот выключен`);
    }

    const botToken = String(env.SUPPORT_CHAT_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '').trim() || null;
    const botUsername = String(env.SUPPORT_CHAT_BOT_USERNAME || '').trim().replace(/^@+/, '') || null;
    const chatId = String(env.SUPPORT_CHAT_ID || '').trim() || null;
    const webhookSecret = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim() || null;

    if (mode !== 'off') {
        if (!botToken) problems.push('Не задан SUPPORT_CHAT_BOT_TOKEN (и TELEGRAM_BOT_TOKEN)');
        if (!botUsername) problems.push('Не задан SUPPORT_CHAT_BOT_USERNAME — в письмах не будет кнопки чата поддержки');
        if (!chatId) problems.push('Не задан SUPPORT_CHAT_ID — бот не знает id закрытого чата');
        if (!webhookSecret) problems.push('Не задан TELEGRAM_WEBHOOK_SECRET — вебхук Telegram будет отклонять все запросы');
    }

    return {
        mode,
        botToken,
        botUsername,
        chatId,
        webhookSecret,
        problems,
    };
}

// ---------------------------------------------------------------------------
// Telegram Bot API client (errors never leak the token)
// ---------------------------------------------------------------------------

export function makeSupportTelegramClient({ token, base = 'https://api.telegram.org', fetchFn = fetch }) {
    if (!token) return null;
    const endpoint = (method) => `${base.replace(/\/$/, '')}/bot${token}/${method}`;

    async function call(method, payload = {}) {
        const resp = await fetchFn(endpoint(method), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await resp.json().catch(() => null);
        if (!resp.ok || !body?.ok) {
            const err = new Error(`Telegram ${method} ${resp.status}: ${body?.description || 'no answer'}`);
            err.status = resp.status;
            err.description = body?.description || null;
            throw err;
        }
        return body.result;
    }

    return {
        sendMessage(chatId, { text, reply_markup } = {}) {
            return call('sendMessage', {
                chat_id: chatId,
                text,
                link_preview_options: { is_disabled: true },
                ...(reply_markup ? { reply_markup } : {}),
            });
        },
        createChatInviteLink(chatId, { name, member_limit = 1, expire_date } = {}) {
            return call('createChatInviteLink', {
                chat_id: chatId,
                name,
                member_limit,
                expire_date,
            });
        },
        revokeChatInviteLink(chatId, inviteLink) {
            return call('revokeChatInviteLink', {
                chat_id: chatId,
                invite_link: inviteLink,
            });
        },
        getChatMember(chatId, userId) {
            return call('getChatMember', {
                chat_id: chatId,
                user_id: userId,
            });
        },
        banChatMember(chatId, userId) {
            return call('banChatMember', {
                chat_id: chatId,
                user_id: userId,
            });
        },
        unbanChatMember(chatId, userId, { only_if_banned = true } = {}) {
            return call('unbanChatMember', {
                chat_id: chatId,
                user_id: userId,
                only_if_banned,
            });
        },
        setWebhook({ url, secret_token, allowed_updates = ['message', 'chat_member'] }) {
            return call('setWebhook', {
                url,
                secret_token,
                allowed_updates,
            });
        },
        getWebhookInfo() {
            return call('getWebhookInfo', {});
        },
    };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const PROTECTED_ROLES = new Set(['creator', 'administrator']);
const JOINED_STATUSES = new Set(['member', 'restricted']);
const ABSENT_STATUSES = new Set(['left', 'kicked']);
const SAFE_SELECT = 'id, email, user_id, contract_id, starts_at, expires_at, telegram_user_id, invited_at, joined_at, reminder_sent_at, removed_at, removed_note, created_at';

export function createSupportChat({
    getSupabase,
    telegram,
    config,
    appUrl,
    webhookBaseUrl,
    alert = async () => {},
    log = console,
    now = () => Date.now(),
}) {
    const baseUrl = (webhookBaseUrl || appUrl || 'https://vastu-portal-app.onrender.com').replace(/\/$/, '');

    // Serialize /start handling per token so a quick double-tap can't issue two
    // live invite links at once.
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

    async function safeReply(chatId, payload) {
        if (!telegram) return;
        try {
            await telegram.sendMessage(chatId, payload);
        } catch (err) {
            log.error(`support-chat: sendMessage failed for chat ${chatId}:`, err?.message || err);
        }
    }

    // Parse `/start <token>` (or `/start@BotName <token>`) in a private chat.
    function parseStartCommand(text) {
        const m = String(text || '').trim().match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?$/i);
        if (!m) return null;
        return { token: (m[1] || '').trim() };
    }

    async function handleStart(message) {
        const fromId = message?.from?.id;
        const chatId = message?.chat?.id;
        if (!fromId || !chatId) return { ok: true, ignored: 'missing-sender' };

        const parsed = parseStartCommand(message.text);
        if (!parsed) return { ok: true, ignored: 'not-start' };

        const lockKey = parsed.token ? `token:${parsed.token}` : `user:${fromId}`;
        return withLock(lockKey, async () => {
            const dryRun = config.mode !== 'live';

            if (!parsed.token) {
                if (dryRun) {
                    log.log(`support-chat [dry-run]: /start without token from ${fromId} -> notFound`);
                    return { ok: true, action: 'not-found', dryRun: true };
                }
                await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.notFound });
                return { ok: true, action: 'not-found' };
            }

            const supabase = getSupabase();
            const { data: row, error } = await supabase
                .from('support_chat_access')
                .select('*')
                .eq('join_token', parsed.token)
                .maybeSingle();

            if (error) {
                log.error('support-chat: join_token lookup failed:', error.message);
                if (!dryRun) await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.technicalError });
                return { ok: true, action: 'error' };
            }

            if (!row) {
                if (dryRun) {
                    log.log(`support-chat [dry-run]: unknown token from ${fromId} -> notFound`);
                    return { ok: true, action: 'not-found', dryRun: true };
                }
                await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.notFound });
                return { ok: true, action: 'not-found' };
            }

            // Already bound to a different Telegram account -> refuse politely.
            if (row.telegram_user_id != null && String(row.telegram_user_id) !== String(fromId)) {
                if (dryRun) {
                    log.log(`support-chat [dry-run]: row ${row.id} bound to another user -> otherAccount`);
                    return { ok: true, action: 'other-account', dryRun: true };
                }
                await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.otherAccount });
                return { ok: true, action: 'other-account' };
            }

            const nowMs = now();
            const expiresMs = Date.parse(row.expires_at);
            if (!Number.isNaN(expiresMs) && expiresMs <= nowMs) {
                const dateStr = formatDateRu(row.expires_at);
                if (dryRun) {
                    log.log(`support-chat [dry-run]: row ${row.id} expired ${dateStr} -> expired`);
                    return { ok: true, action: 'expired', dryRun: true };
                }
                await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.expired(dateStr) });
                return { ok: true, action: 'expired' };
            }

            // Closed/revoked before expires_at -> treat as used-up/not found.
            if (row.removed_at != null) {
                if (dryRun) {
                    log.log(`support-chat [dry-run]: row ${row.id} already removed -> notFound`);
                    return { ok: true, action: 'not-found', dryRun: true };
                }
                await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.notFound });
                return { ok: true, action: 'not-found' };
            }

            if (dryRun) {
                log.log(`support-chat [dry-run]: would bind user ${fromId} to row ${row.id} and issue invite link`);
                return { ok: true, action: 'invite', rowId: row.id, dryRun: true };
            }

            if (!telegram || !config.chatId) {
                log.error('support-chat: bot token or SUPPORT_CHAT_ID missing');
                await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.technicalError });
                return { ok: true, action: 'misconfigured' };
            }

            // Never more than one live invite link per row: revoke previous first.
            if (row.invite_link) {
                try {
                    await telegram.revokeChatInviteLink(config.chatId, row.invite_link);
                } catch (revErr) {
                    log.warn(`support-chat: revokeChatInviteLink failed for row ${row.id}:`, revErr?.message || revErr);
                }
            }

            const expireDate = Math.floor(nowMs / 1000) + INVITE_TTL_SEC;
            let invite;
            try {
                invite = await telegram.createChatInviteLink(config.chatId, {
                    name: `support-${row.id}`,
                    member_limit: 1,
                    expire_date: expireDate,
                });
            } catch (invErr) {
                log.error(`support-chat: createChatInviteLink failed for row ${row.id}:`, invErr?.message || invErr);
                await alert('бот чата поддержки: не удалось создать ссылку-приглашение', { rowId: row.id, error: String(invErr?.message || invErr) });
                await safeReply(chatId, { text: SUPPORT_CHAT_MESSAGES.technicalError });
                return { ok: true, action: 'error' };
            }

            const inviteLink = invite?.invite_link;
            const nowIso = new Date(nowMs).toISOString();
            const { error: updErr } = await supabase
                .from('support_chat_access')
                .update({
                    telegram_user_id: fromId,
                    invite_link: inviteLink,
                    invited_at: nowIso,
                })
                .eq('id', row.id);
            if (updErr) {
                log.error(`support-chat: failed to save invite for row ${row.id}:`, updErr.message);
            }

            await safeReply(chatId, {
                text: SUPPORT_CHAT_MESSAGES.welcome(formatDateRu(row.expires_at)),
                reply_markup: {
                    inline_keyboard: [[{ text: SUPPORT_CHAT_MESSAGES.buttonJoin, url: inviteLink }]],
                },
            });

            return { ok: true, action: 'invited', rowId: row.id };
        });
    }

    async function handleChatMember(cm) {
        if (!cm) return { ok: true, ignored: 'empty-chat-member' };
        if (config.chatId && String(cm.chat?.id) !== String(config.chatId)) {
            return { ok: true, ignored: 'other-chat' };
        }
        const newStatus = cm.new_chat_member?.status;
        if (!JOINED_STATUSES.has(newStatus)) {
            return { ok: true, ignored: 'not-join' };
        }
        const linkName = String(cm.invite_link?.name || '');
        if (!linkName.startsWith('support-')) {
            return { ok: true, ignored: 'other-invite' };
        }
        const rowId = linkName.slice('support-'.length).trim();
        if (!rowId) return { ok: true, ignored: 'empty-row-id' };

        if (config.mode !== 'live') {
            log.log(`support-chat [dry-run]: chat_member join via ${linkName} -> would set joined_at`);
            return { ok: true, action: 'joined', rowId, dryRun: true };
        }

        const supabase = getSupabase();
        const { data: row, error } = await supabase
            .from('support_chat_access')
            .select('id, joined_at, telegram_user_id')
            .eq('id', rowId)
            .maybeSingle();

        if (error) {
            log.error(`support-chat: chat_member lookup failed for ${rowId}:`, error.message);
            return { ok: true, action: 'error' };
        }
        if (!row) return { ok: true, ignored: 'row-not-found' };
        if (row.joined_at) return { ok: true, action: 'already-joined', rowId };

        const joinedAtIso = new Date(cm.date ? Number(cm.date) * 1000 : now()).toISOString();
        const patch = { joined_at: joinedAtIso };
        const joinedUserId = cm.new_chat_member?.user?.id;
        if (row.telegram_user_id == null && joinedUserId != null) {
            patch.telegram_user_id = joinedUserId;
        }
        const { error: updErr } = await supabase
            .from('support_chat_access')
            .update(patch)
            .eq('id', row.id);
        if (updErr) {
            log.error(`support-chat: joined_at update failed for ${row.id}:`, updErr.message);
        }
        return { ok: true, action: 'joined', rowId };
    }

    // Entry point for POST /api/telegram/support-bot. Never throws.
    async function handleUpdate(update) {
        if (config.mode === 'off') {
            return { ok: true, ignored: 'off' };
        }
        try {
            if (update?.message && update.message.chat?.type === 'private' && typeof update.message.text === 'string') {
                return await handleStart(update.message);
            }
            if (update?.chat_member) {
                return await handleChatMember(update.chat_member);
            }
            return { ok: true, ignored: 'unhandled' };
        } catch (err) {
            log.error('support-chat: handleUpdate unexpected error:', err?.message || err);
            return { ok: true, error: String(err?.message || err) };
        }
    }

    // Explicit admin-only helper: registers the Telegram webhook with
    // allowed_updates = ['message', 'chat_member']. Never called automatically.
    async function setWebhook({ url } = {}) {
        if (!telegram) throw new Error('SUPPORT_CHAT_BOT_TOKEN / TELEGRAM_BOT_TOKEN not configured');
        if (!config.webhookSecret) throw new Error('TELEGRAM_WEBHOOK_SECRET not configured');
        const webhookUrl = String(url || `${baseUrl}/api/telegram/support-bot`).trim();
        const allowed_updates = ['message', 'chat_member'];
        const ok = await telegram.setWebhook({
            url: webhookUrl,
            secret_token: config.webhookSecret,
            allowed_updates,
        });
        return { ok: !!ok, url: webhookUrl, allowed_updates };
    }

    // Hourly cron: T-7d DM reminders + expiry removals.
    async function run({ dryRun: forceDryRun = false } = {}) {
        const result = {
            mode: config.mode,
            dryRun: false,
            skipped: false,
            reminders: [],
            removals: [],
            skippedAdmin: [],
            skippedNeverJoined: [],
            errors: [],
        };

        if (config.mode === 'off') {
            result.skipped = true;
            return result;
        }

        const dryRun = forceDryRun || config.mode !== 'live';
        result.dryRun = dryRun;

        if (!dryRun && (!telegram || !config.chatId)) {
            result.skipped = true;
            result.errors.push('SUPPORT_CHAT_BOT_TOKEN or SUPPORT_CHAT_ID not configured');
            return result;
        }

        const supabase = getSupabase();
        const nowMs = now();
        const nowIso = new Date(nowMs).toISOString();
        const reminderCutoffIso = new Date(nowMs + REMINDER_WINDOW_MS).toISOString();

        // Load all non-removed rows once so we can accurately see renewals
        // (another active row for the same telegram_user_id).
        const { data: openRows, error: qErr } = await supabase
            .from('support_chat_access')
            .select(SAFE_SELECT)
            .is('removed_at', null);
        if (qErr) throw new Error(`support_chat_access query failed: ${qErr.message}`);

        const rows = openRows || [];
        const activeByTgUser = new Map();
        for (const r of rows) {
            if (r.telegram_user_id == null) continue;
            const expMs = Date.parse(r.expires_at);
            if (!Number.isNaN(expMs) && expMs > nowMs) {
                const key = String(r.telegram_user_id);
                const prev = activeByTgUser.get(key) || [];
                prev.push(r);
                activeByTgUser.set(key, prev);
            }
        }

        // 1. T-7 days reminders (expires_at > now && expires_at <= now + 7d, reminder_sent_at is null)
        for (const row of rows) {
            if (row.reminder_sent_at != null) continue;
            if (row.telegram_user_id == null) continue;
            const expMs = Date.parse(row.expires_at);
            if (Number.isNaN(expMs) || expMs <= nowMs || expMs > nowMs + REMINDER_WINDOW_MS) continue;

            // Skip reminder if the user already has another active row extending past the reminder window.
            const peers = activeByTgUser.get(String(row.telegram_user_id)) || [];
            if (peers.some((p) => p.id !== row.id && Date.parse(p.expires_at) > Date.parse(reminderCutoffIso))) {
                continue;
            }

            if (dryRun) {
                log.log(`support-chat [dry-run]: would remind ${row.email} (tg ${row.telegram_user_id}), expires ${row.expires_at}`);
                result.reminders.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, expires_at: row.expires_at, dryRun: true });
                continue;
            }

            try {
                await telegram.sendMessage(row.telegram_user_id, {
                    text: SUPPORT_CHAT_MESSAGES.reminder(formatDateRu(row.expires_at)),
                });
                const { error: updErr } = await supabase
                    .from('support_chat_access')
                    .update({ reminder_sent_at: nowIso })
                    .eq('id', row.id);
                if (updErr) throw new Error(updErr.message);
                result.reminders.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, expires_at: row.expires_at });
            } catch (err) {
                log.error(`support-chat: reminder failed for row ${row.id}:`, err?.message || err);
                result.errors.push({ id: row.id, stage: 'reminder', error: String(err?.message || err) });
            }
        }

        // 2. Expired rows (expires_at <= now && removed_at is null)
        for (const row of rows) {
            const expMs = Date.parse(row.expires_at);
            if (Number.isNaN(expMs) || expMs > nowMs) continue;

            // Never bound / never joined -> just close the row with a note.
            if (row.telegram_user_id == null) {
                if (dryRun) {
                    log.log(`support-chat [dry-run]: row ${row.id} (${row.email}) never joined -> would mark removed_at`);
                    result.skippedNeverJoined.push({ id: row.id, email: row.email, note: 'never joined', dryRun: true });
                    continue;
                }
                const { error: updErr } = await supabase
                    .from('support_chat_access')
                    .update({ removed_at: nowIso, removed_note: 'never joined' })
                    .eq('id', row.id);
                if (updErr) {
                    result.errors.push({ id: row.id, stage: 'never-joined', error: updErr.message });
                } else {
                    result.skippedNeverJoined.push({ id: row.id, email: row.email, note: 'never joined' });
                }
                continue;
            }

            // If the same Telegram user bought again and has a still-active row,
            // close the old row without kicking them from the chat.
            const activePeers = (activeByTgUser.get(String(row.telegram_user_id)) || []).filter((p) => p.id !== row.id);
            if (activePeers.length > 0) {
                if (dryRun) {
                    log.log(`support-chat [dry-run]: row ${row.id} superseded by newer active access -> would mark removed_at without kick`);
                    result.removals.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, note: 'superseded by newer active access', dryRun: true });
                    continue;
                }
                const { error: updErr } = await supabase
                    .from('support_chat_access')
                    .update({ removed_at: nowIso, removed_note: 'superseded by newer active access' })
                    .eq('id', row.id);
                if (updErr) {
                    result.errors.push({ id: row.id, stage: 'superseded', error: updErr.message });
                } else {
                    result.removals.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, note: 'superseded by newer active access' });
                }
                continue;
            }

            if (dryRun) {
                log.log(`support-chat [dry-run]: would remove ${row.email} (tg ${row.telegram_user_id}) after expiry ${row.expires_at}`);
                result.removals.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, expires_at: row.expires_at, dryRun: true });
                continue;
            }

            try {
                // Never touch the chat's owner or admins.
                const member = await telegram.getChatMember(config.chatId, row.telegram_user_id);
                const status = member?.status;
                if (PROTECTED_ROLES.has(status)) {
                    log.warn(`support-chat: skipping ${status} (tg ${row.telegram_user_id}, row ${row.id})`);
                    result.skippedAdmin.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, status });
                    continue;
                }

                // Already left or never used the invite link -> mark removed with note, no ban needed.
                if (ABSENT_STATUSES.has(status)) {
                    const note = row.joined_at ? 'already left' : 'never joined';
                    const { error: updErr } = await supabase
                        .from('support_chat_access')
                        .update({ removed_at: nowIso, removed_note: note })
                        .eq('id', row.id);
                    if (updErr) throw new Error(updErr.message);
                    if (row.joined_at) {
                        result.removals.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, note });
                    } else {
                        result.skippedNeverJoined.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, note });
                    }
                    continue;
                }

                // Send goodbye DM first (best-effort: if user blocked bot, still remove from chat).
                try {
                    await telegram.sendMessage(row.telegram_user_id, { text: SUPPORT_CHAT_MESSAGES.goodbye });
                } catch (dmErr) {
                    log.warn(`support-chat: goodbye DM failed for tg ${row.telegram_user_id}:`, dmErr?.message || dmErr);
                }

                // Ban then immediately unban (only_if_banned: true) so they leave
                // cleanly and can rejoin if they purchase again in the future.
                await telegram.banChatMember(config.chatId, row.telegram_user_id);
                await telegram.unbanChatMember(config.chatId, row.telegram_user_id, { only_if_banned: true });

                const { error: updErr } = await supabase
                    .from('support_chat_access')
                    .update({ removed_at: nowIso, removed_note: 'expired' })
                    .eq('id', row.id);
                if (updErr) throw new Error(updErr.message);

                result.removals.push({ id: row.id, email: row.email, telegram_user_id: row.telegram_user_id, expires_at: row.expires_at });
            } catch (err) {
                log.error(`support-chat: removal failed for row ${row.id}:`, err?.message || err);
                result.errors.push({ id: row.id, stage: 'removal', error: String(err?.message || err) });
            }
        }

        return result;
    }

    function summaryStatus() {
        return {
            mode: config.mode,
            configured: {
                botToken: !!config.botToken,
                botUsername: config.botUsername || null,
                chatId: !!config.chatId,
                webhookSecret: !!config.webhookSecret,
            },
            problems: config.problems,
        };
    }

    // Admin status (GET /api/admin/support-chat): counts and next 20 expiries.
    // Never exposes join_token or invite_link.
    async function adminStatus() {
        const base = summaryStatus();
        const supabase = getSupabase();
        const { data: rows, error } = await supabase
            .from('support_chat_access')
            .select(SAFE_SELECT)
            .order('expires_at', { ascending: true });

        if (error) {
            return { ...base, error: error.message, counts: null, nextExpiries: [] };
        }

        const all = rows || [];
        const nowMs = now();
        const soonMs = nowMs + REMINDER_WINDOW_MS;

        let active = 0;
        let joined = 0;
        let pendingJoin = 0;
        let expiringSoon = 0;
        let expiredPendingRemoval = 0;
        let removed = 0;
        const upcoming = [];

        for (const r of all) {
            if (r.removed_at != null) {
                removed += 1;
                continue;
            }
            const expMs = Date.parse(r.expires_at);
            if (!Number.isNaN(expMs) && expMs <= nowMs) {
                expiredPendingRemoval += 1;
            } else {
                active += 1;
                if (r.joined_at) joined += 1;
                else pendingJoin += 1;
                if (!Number.isNaN(expMs) && expMs <= soonMs) expiringSoon += 1;
            }
            if (upcoming.length < 20) {
                upcoming.push({
                    id: r.id,
                    email: r.email,
                    contract_id: r.contract_id,
                    starts_at: r.starts_at,
                    expires_at: r.expires_at,
                    telegram_user_id: r.telegram_user_id,
                    invited_at: r.invited_at,
                    joined_at: r.joined_at,
                    reminder_sent_at: r.reminder_sent_at,
                });
            }
        }

        return {
            ...base,
            counts: {
                total: all.length,
                active,
                joined,
                pendingJoin,
                expiringSoon,
                expiredPendingRemoval,
                removed,
            },
            nextExpiries: upcoming,
        };
    }

    return {
        handleUpdate,
        setWebhook,
        run,
        adminStatus,
        summaryStatus,
    };
}
