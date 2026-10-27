// Local stand-in for the three services server.js talks to, on one port:
//   /rest/v1/*  — a small PostgREST (eq / in / is / lt / gte / lte / order / limit,
//                 insert, upsert-ignore, patch) over in-memory tables
//   /auth/v1/*  — the GoTrue admin + user endpoints the server and SPA use
//   /api/v1/invoices, /api/v2/products — lava.top (shapes as observed live)
//   /mono/api/order/* — monobank «Покупка частинами» (signature checked)
//   /emails     — Resend
//   /__*        — test controls (seed, inspect, inject failures)
// Good enough to run the real server.js and the real built SPA against it.
// Not a faithful Postgres: no RLS, no joins in select.

import http from 'http';
import crypto from 'crypto';

const UNIQUE = {
    purchases: [['contract_id']],
    user_entitlements: [['user_id', 'course_id']],
    course_offers: [['course_id', 'lava_offer_id']],
    courses: [['slug']],
    profiles: [['id']],
    lava_invoices: [['contract_id']],
};

export function createFakeServices({ lavaApiKey = 'lava-test-key', monoStoreId = 'mono-store', monoSignKey = 'mono-sign-key' } = {}) {
    const db = { courses: [], course_offers: [], user_entitlements: [], profiles: [], purchases: [], lava_invoices: [] };
    const users = new Map(); // id -> user
    const tokens = new Map(); // hashed_token -> { userId, type }
    const sessions = new Map(); // access_token -> userId
    const invoices = []; // lava contracts of our API key, newest first
    const products = []; // lava catalog: { id, title, offers: [{ id, prices: [{currency, amount}] }] }
    const sent = [];
    // webhook: where the fake "lava checkout" delivers payment.success, as lava would.
    const control = { resendFailures: 0, lavaPageSize: Infinity, webhook: null };

    const uuid = () => crypto.randomUUID();
    const nowIso = () => new Date().toISOString();

    function b64url(obj) {
        return Buffer.from(JSON.stringify(obj)).toString('base64url');
    }
    function makeSession(user) {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const access_token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp, session_id: uuid() })}.sig`;
        sessions.set(access_token, user.id);
        return { access_token, refresh_token: uuid(), token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
    }

    // -------------------------------------------------------------- PostgREST
    function parseFilters(params) {
        const filters = [];
        for (const [k, v] of params) {
            if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
            const dot = v.indexOf('.');
            filters.push({ col: k, op: v.slice(0, dot), val: v.slice(dot + 1) });
        }
        return filters;
    }
    function cmp(a, b) {
        if (a == null || b == null) return NaN;
        const na = Number(a), nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'string') return na - nb;
        const da = Date.parse(a), dbb = Date.parse(b);
        if (!Number.isNaN(da) && !Number.isNaN(dbb) && /\d{4}-\d\d-\d\d/.test(String(a))) return da - dbb;
        return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    }
    function matches(row, f) {
        const v = row[f.col];
        switch (f.op) {
            case 'eq': return v != null && String(v) === f.val;
            case 'neq': return String(v) !== f.val;
            case 'is': return f.val === 'null' ? v == null : String(v) === f.val;
            case 'in': {
                const list = f.val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
                return v != null && list.includes(String(v));
            }
            case 'lt': return cmp(v, f.val) < 0;
            case 'lte': return cmp(v, f.val) <= 0;
            case 'gt': return cmp(v, f.val) > 0;
            case 'gte': return cmp(v, f.val) >= 0;
            case 'like': {
                const re = new RegExp(`^${f.val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`);
                return v != null && re.test(String(v));
            }
            default: throw new Error(`fake postgrest: unsupported op ${f.op}`);
        }
    }
    function selectRows(table, params) {
        let rows = (db[table] || []).filter((r) => parseFilters(params).every((f) => matches(r, f)));
        const order = params.get('order');
        if (order) {
            const [col, dir] = order.split('.');
            rows = [...rows].sort((a, b) => (dir === 'desc' ? -1 : 1) * (cmp(a[col], b[col]) || 0));
        }
        const limit = params.get('limit');
        if (limit) rows = rows.slice(0, Number(limit));
        // The one embed the SPA uses: `courses(...)` next to a course_id.
        const embedCourses = /(^|,)\s*courses(!inner)?\(/.test(params.get('select') || '');
        return rows.map((r) => (embedCourses && r.course_id ? { ...r, courses: db.courses.find((c) => c.id === r.course_id) || null } : { ...r }));
    }
    function violates(table, row, except) {
        for (const cols of UNIQUE[table] || []) {
            if ((db[table] || []).some((r) => r !== except && cols.every((c) => r[c] === row[c]))) return cols;
        }
        return null;
    }
    function withDefaults(table, row) {
        const r = { ...row };
        if (!('id' in r) && table !== 'purchases' && table !== 'lava_invoices') r.id = uuid();
        if (table === 'lava_invoices') r.created_at ??= nowIso();
        if (table === 'purchases') {
            r.attempts ??= 0; r.email_attempts ??= 0; r.lava_ids ??= [];
            r.created_at ??= nowIso(); r.updated_at ??= nowIso();
            for (const k of ['user_id', 'course_slugs', 'error', 'email_sent_at', 'email_id', 'email_error', 'matched_lava_id', 'amount', 'currency']) r[k] ??= null;
        }
        if (table === 'user_entitlements') { r.granted_at ??= nowIso(); r.expires_at ??= null; r.reminder_sent_at ??= null; }
        if (table === 'course_offers') { r.match_on ??= 'offer'; r.is_lifetime ??= false; r.access_months ??= null; }
        return r;
    }

    function rest(req, res, table, url, body) {
        const params = url.searchParams;
        const prefer = String(req.headers['prefer'] || '');
        const wantObject = String(req.headers['accept'] || '').includes('vnd.pgrst.object');
        // Tables the server never touches (weeks, days, …) read as empty so
        // the SPA renders; writing to an unknown table is still an error.
        if (!db[table] && req.method === 'GET') return send(res, 200, wantObject ? null : []);
        if (!db[table]) return send(res, 404, { message: `relation ${table} does not exist`, code: '42P01' });

        if (req.method === 'GET') {
            const rows = selectRows(table, params);
            if (wantObject) {
                if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', details: `The result contains ${rows.length} rows`, message: 'JSON object requested, multiple (or no) rows returned' });
                return send(res, 200, rows[0]);
            }
            return send(res, 200, rows);
        }
        if (req.method === 'POST') {
            const list = Array.isArray(body) ? body : [body];
            const ignoreDup = prefer.includes('resolution=ignore-duplicates');
            const inserted = [];
            for (const raw of list) {
                const row = withDefaults(table, raw);
                const v = violates(table, row);
                if (v) {
                    if (ignoreDup) continue;
                    return send(res, 409, { code: '23505', message: `duplicate key value violates unique constraint (${v.join(', ')})` });
                }
                db[table].push(row);
                inserted.push(row);
                if (table === 'profiles') continue;
            }
            return prefer.includes('return=representation') ? send(res, 201, inserted) : send(res, 201, null);
        }
        if (req.method === 'PATCH') {
            const filters = parseFilters(params);
            const rows = db[table].filter((r) => filters.every((f) => matches(r, f)));
            for (const r of rows) Object.assign(r, body);
            return prefer.includes('return=representation') ? send(res, 200, rows) : send(res, 204, null);
        }
        if (req.method === 'DELETE') {
            const filters = parseFilters(params);
            db[table] = db[table].filter((r) => !filters.every((f) => matches(r, f)));
            return send(res, 204, null);
        }
        return send(res, 405, { message: 'method' });
    }

    // ------------------------------------------------------------------ GoTrue
    function createUser(email, extra = {}) {
        const user = {
            id: uuid(), aud: 'authenticated', role: 'authenticated', email: email.toLowerCase(),
            email_confirmed_at: extra.confirmed === false ? null : nowIso(), last_sign_in_at: extra.last_sign_in_at || null,
            created_at: nowIso(), updated_at: nowIso(), app_metadata: { provider: 'email' }, user_metadata: {}, identities: [],
            password: extra.password || null,
        };
        users.set(user.id, user);
        db.profiles.push({ id: user.id, email: user.email, full_name: null, role: 'student' }); // handle_new_user trigger
        return user;
    }
    const pub = (u) => { const { password, ...rest } = u; return rest; };
    const byEmail = (email) => [...users.values()].find((u) => u.email === String(email).toLowerCase());
    function bearerUser(req) {
        const t = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        const id = sessions.get(t);
        return id ? users.get(id) : null;
    }

    function auth(req, res, p, url, body) {
        if (p === '/admin/users' && req.method === 'POST') {
            if (byEmail(body.email)) return send(res, 422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
            return send(res, 200, pub(createUser(body.email, { confirmed: !!body.email_confirm })));
        }
        if (p === '/admin/users' && req.method === 'GET') {
            const page = Number(url.searchParams.get('page') || 1), per = Number(url.searchParams.get('per_page') || 50);
            const all = [...users.values()].map(pub);
            return send(res, 200, { users: all.slice((page - 1) * per, page * per), aud: 'authenticated' }, { 'x-total-count': String(all.length) });
        }
        const m = p.match(/^\/admin\/users\/([^/]+)$/);
        if (m) {
            const u = users.get(m[1]);
            if (!u) return send(res, 404, { code: 404, msg: 'User not found' });
            if (req.method === 'GET') return send(res, 200, pub(u));
            if (req.method === 'PUT') {
                if (body.email_confirm && !u.email_confirmed_at) u.email_confirmed_at = nowIso();
                if (body.password) u.password = body.password;
                return send(res, 200, pub(u));
            }
        }
        if (p === '/admin/generate_link' && req.method === 'POST') {
            const u = byEmail(body.email);
            if (!u) return send(res, 404, { code: 404, msg: 'User with this email not found' });
            // One live recovery token per user, like GoTrue.
            for (const [k, v] of tokens) if (v.userId === u.id && v.type === body.type) tokens.delete(k);
            const hashed = crypto.randomBytes(28).toString('hex');
            tokens.set(hashed, { userId: u.id, type: body.type });
            return send(res, 200, { ...pub(u), action_link: `http://fake/verify?token=${hashed}`, email_otp: '123456', hashed_token: hashed, verification_type: body.type, redirect_to: '' });
        }
        if (p === '/verify' && req.method === 'POST') {
            const t = tokens.get(body.token_hash);
            if (!t || t.type !== body.type) return send(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' });
            tokens.delete(body.token_hash);
            const u = users.get(t.userId);
            u.email_confirmed_at ||= nowIso();
            u.last_sign_in_at = nowIso();
            return send(res, 200, makeSession(pub(u)));
        }
        if (p === '/token' && req.method === 'POST') {
            const grant = url.searchParams.get('grant_type');
            if (grant === 'password') {
                const u = byEmail(body.email);
                if (!u || !u.password || u.password !== body.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
                u.last_sign_in_at = nowIso();
                return send(res, 200, makeSession(pub(u)));
            }
            return send(res, 400, { msg: 'unsupported grant' });
        }
        if (p === '/user') {
            const u = bearerUser(req);
            if (!u) return send(res, 401, { code: 401, msg: 'invalid JWT' });
            if (req.method === 'PUT' && body.password) u.password = body.password;
            return send(res, 200, pub(u));
        }
        if (p === '/logout') return send(res, 204, null);
        if (p === '/recover' && req.method === 'POST') return send(res, 200, {});
        return send(res, 404, { msg: `fake gotrue: no route ${req.method} ${p}` });
    }

    // ------------------------------------------------------------------ lava
    function lavaInvoices(req, res, url) {
        if (req.headers['x-api-key'] !== lavaApiKey) return send(res, 401, { error: 'unauthorized' });
        const page = Number(url.searchParams.get('page') || 1); // 1-based, like lava
        const size = Math.min(Number(url.searchParams.get('size') || 20), control.lavaPageSize);
        const begin = url.searchParams.get('beginDate');
        if (begin && Number.isNaN(Date.parse(begin))) return send(res, 400, { error: 'Wrong beginDate field format' });
        const statuses = url.searchParams.getAll('invoiceStatuses');
        const all = invoices.filter((i) => (!begin || Date.parse(i.datetime) >= Date.parse(begin)) && (!statuses.length || statuses.includes(i.status)));
        return send(res, 200, { items: all.slice((page - 1) * size, page * size), page, size, total: all.length, pages: Math.ceil(all.length / size) });
    }
    // POST /api/v3/invoice — what /buy calls. The paymentUrl is a tiny fake
    // checkout (/__pay/<id>) whose "Оплатить" completes the contract and sends
    // the webhook the way lava does: product id only, no offer id.
    function lavaCreateInvoice(req, res, body) {
        if (req.headers['x-api-key'] !== lavaApiKey) return send(res, 401, { error: 'unauthorized' });
        control.lastInvoiceRequest = body;
        const product = products.find((p) => p.offers.some((o) => o.id === body.offerId));
        if (!product) return send(res, 404, { error: 'Offer not found' });
        const id = crypto.randomUUID();
        const price = product.offers.find((o) => o.id === body.offerId).prices.find((p) => p.currency === body.currency);
        invoices.unshift({ id, type: 'ONE_TIME', datetime: nowIso(), status: 'IN_PROGRESS', receipt: { amount: price?.amount ?? 0, currency: body.currency, fee: 0 }, buyer: { email: body.email }, product: { name: product.title, offer: product.title }, _productId: product.id });
        const host = req.headers.host;
        return send(res, 200, { id, status: 'in-progress', amountTotal: { currency: body.currency, amount: price?.amount }, paymentUrl: `http://${host}/__pay/${id}` });
    }
    async function fakeCheckout(req, res, id) {
        const inv = invoices.find((i) => i.id === id);
        if (!inv) return send(res, 404, { error: 'no such invoice' });
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(`<!doctype html><meta charset=utf-8><title>lava.top (fake)</title><body style="font-family:sans-serif;padding:40px"><h2>Фейковая оплата lava.top</h2><p>${inv.product.name}<br>${inv.receipt.amount} ${inv.receipt.currency} · ${inv.buyer.email}</p><form method=post><button style="font-size:18px;padding:12px 24px">Оплатить</button></form></body>`);
        }
        inv.status = 'COMPLETED';
        let delivered = 'no webhook configured';
        if (control.webhook) {
            const r = await fetch(control.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': control.webhook.key },
                body: JSON.stringify({ eventType: 'payment.success', product: { id: inv._productId, title: inv.product.name }, buyer: { email: inv.buyer.email }, contractId: inv.id, amount: inv.receipt.amount, currency: inv.receipt.currency, timestamp: nowIso(), status: 'completed', errorMessage: '' }),
            });
            delivered = `webhook ${r.status}`;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:40px"><h2>Оплачено ✓</h2><p id=delivered>${delivered}</p></body>`);
    }

    function lavaProducts(req, res) {
        if (req.headers['x-api-key'] !== lavaApiKey) return send(res, 401, { error: 'unauthorized' });
        return send(res, 200, { items: products, nextPage: null });
    }

    // -------------------------------------------------------------- monobank
    // What the buyer does in the app is up to the test: monoApprove / monoFail.
    const monoOrders = new Map(); // order_id -> order
    const monoSig = (raw) => crypto.createHmac('sha256', monoSignKey).update(raw, 'utf8').digest('base64');
    function monoApi(req, res, p, raw, body) {
        if (req.headers['store-id'] !== monoStoreId || req.headers['signature'] !== monoSig(raw)) {
            return send(res, 401, { message: 'Signature is not valid' });
        }
        if (p === '/api/order/create' && req.method === 'POST') {
            if (control.monoCreateFail) return send(res, 200, { state: 'FAIL', order_sub_state: control.monoCreateFail, message: 'fake refusal' });
            const same = [...monoOrders.values()].find((o) => o.store_order_id === body.store_order_id);
            if (same) return send(res, 201, { order_id: same.order_id });
            const order = { order_id: uuid(), ...body, state: 'IN_PROCESS', order_sub_state: 'WAITING_FOR_CLIENT', confirms: 0 };
            monoOrders.set(order.order_id, order);
            return send(res, 201, { order_id: order.order_id });
        }
        const order = monoOrders.get(body?.order_id);
        if (!order) return send(res, 404, { message: 'order not found' });
        if (p === '/api/order/state') return send(res, 200, { order_id: order.order_id, state: order.state, order_sub_state: order.order_sub_state });
        if (p === '/api/order/confirm') {
            if (order.order_sub_state !== 'WAITING_FOR_STORE_CONFIRM') return send(res, 400, { message: `can't confirm in ${order.order_sub_state}` });
            order.confirms += 1;
            order.state = 'SUCCESS';
            order.order_sub_state = 'ACTIVE';
            return send(res, 200, { order_id: order.order_id, state: order.state, order_sub_state: order.order_sub_state });
        }
        if (p === '/api/order/reject') {
            order.state = 'FAIL';
            order.order_sub_state = 'REJECTED_BY_STORE';
            return send(res, 200, { order_id: order.order_id, state: order.state, order_sub_state: order.order_sub_state });
        }
        return send(res, 404, { message: `fake mono: no route ${p}` });
    }
    // monobank's callback: signed JSON to the order's result_callback.
    async function monoCallback(order, signature) {
        const raw = JSON.stringify({ order_id: order.order_id, state: order.state, order_sub_state: order.order_sub_state });
        const r = await fetch(order.result_callback, { method: 'POST', headers: { 'Content-Type': 'application/json', signature: signature ?? monoSig(raw) }, body: raw });
        return r.status;
    }

    // ---------------------------------------------------------------- resend
    function resend(req, res, body) {
        if (control.resendFailures > 0) {
            control.resendFailures -= 1;
            return send(res, 500, { name: 'internal_server_error', message: 'fake outage' });
        }
        const id = uuid();
        sent.push({ id, ...body, idempotencyKey: req.headers['idempotency-key'] || null });
        return send(res, 200, { id });
    }

    // --------------------------------------------------------------- control
    const api = {
        db, users, sent, invoices, products, control, monoOrders,
        createUser,
        seed(table, rows) { for (const r of rows) db[table].push(withDefaults(table, r)); },
        // A contract created through /buy: lava's invoice + our lava_invoices row.
        addInvoice({ id = crypto.randomUUID(), email, offerId, status = 'COMPLETED', datetime = nowIso(), amount = 75000, currency = 'RUB', recorded = true }) {
            invoices.unshift({ id, type: 'ONE_TIME', datetime, status, receipt: { amount, currency, fee: 0 }, buyer: { email }, product: { name: 'x', offer: 'x' } });
            if (recorded && offerId) db.lava_invoices.push({ contract_id: id, offer_id: offerId, email, created_at: datetime });
            return id;
        },
        // The buyer approved in the monobank app. -> callback HTTP status, or null.
        async monoApprove(orderId, { callback = true, signature } = {}) {
            const o = monoOrders.get(orderId);
            o.state = 'IN_PROCESS';
            o.order_sub_state = 'WAITING_FOR_STORE_CONFIRM';
            return callback ? monoCallback(o, signature) : null;
        },
        async monoFail(orderId, subState, { callback = true } = {}) {
            const o = monoOrders.get(orderId);
            o.state = 'FAIL';
            o.order_sub_state = subState;
            return callback ? monoCallback(o) : null;
        },
    };

    function send(res, status, body, headers = {}) {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*', ...headers });
        res.end(body == null ? '' : JSON.stringify(body));
    }

    const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            if (req.method === 'OPTIONS') {
                res.writeHead(204, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                });
                return res.end();
            }
            let body = null;
            try { body = raw ? JSON.parse(raw) : null; } catch { return send(res, 400, { message: 'bad json' }); }
            const url = new URL(req.url, 'http://x');
            const p = url.pathname;
            try {
                if (p.startsWith('/rest/v1/')) return rest(req, res, p.slice('/rest/v1/'.length), url, body);
                if (p.startsWith('/mono/')) return monoApi(req, res, p.slice('/mono'.length), raw, body);
                if (p.startsWith('/auth/v1')) return auth(req, res, p.slice('/auth/v1'.length), url, body || {});
                if (p === '/api/v1/invoices') return lavaInvoices(req, res, url);
                if (p === '/api/v2/products') return lavaProducts(req, res);
                if (p === '/api/v3/invoice' && req.method === 'POST') return lavaCreateInvoice(req, res, body || {});
                const pay = p.match(/^\/__pay\/([^/]+)$/);
                if (pay) return fakeCheckout(req, res, pay[1]);
                if (p === '/emails' && req.method === 'POST') return resend(req, res, body);
                if (p === '/__state') return send(res, 200, { db, sent, users: [...users.values()].map(pub) });
                return send(res, 404, { message: `fake: no route ${req.method} ${p}` });
            } catch (err) {
                return send(res, 500, { message: String(err?.stack || err) });
            }
        });
    });

    api.listen = (port = 0) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server.address().port)));
    api.close = () => new Promise((resolve) => server.close(resolve));
    return api;
}

// `node test/fake-services.mjs` — standalone, for poking at the SPA by hand.
if (import.meta.url === `file://${process.argv[1]}`) {
    const fake = createFakeServices();
    const port = await fake.listen(Number(process.env.FAKE_PORT || 54329));
    console.log(`fake services on http://127.0.0.1:${port}`);
}
