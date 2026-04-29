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
const APP_URL = process.env.APP_URL;

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
        //    the base course and the VIP bonus course).
        const { data: offerRows, error: offerErr } = await supabase
            .from('course_offers')
            .select('course_id')
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

        // 7. Upsert one entitlement per mapped course (idempotent on user_id+course_id)
        const rows = courseIds.map((cid) => ({
            user_id: userId,
            course_id: cid,
            source: 'lava.top',
            source_payment_id: paymentId
        }));

        const { error: entErr } = await supabase
            .from('user_entitlements')
            .upsert(rows, { onConflict: 'user_id,course_id', ignoreDuplicates: true });

        if (entErr) {
            console.error('user_entitlements upsert error:', entErr.message);
            sendJson(res, 500, { error: entErr.message });
            return;
        }

        // 8. Done
        sendJson(res, 200, {
            success: true,
            user_id: userId,
            course_ids: courseIds,
            invited
        });
    } catch (err) {
        console.error('Lava webhook unexpected error:', err);
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
