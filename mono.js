// ---------------------------------------------------------------------------
// monobank «Покупка Частинами» — Anna's course in installments, in hryvnias,
// for buyers with a Ukrainian monobank card.
//
// Wording is monobank's rule, not taste (knowledge-base/chast/marketing/brand,
// 26 Mar 2026): the service is «Покупка Частинами» (or «… monobank»), never
// translated to «Покупка частями», never «Оплата частинами» or «кредит».
// And the price in parts must equal the normal price — no markup.
//
// How a sale goes (https://monobank.ua/api-docs/chast):
//   1. /buy/mono/<plan>: the buyer gives their email, the phone their monobank
//      app is on and the number of payments; we POST /api/order/create.
//   2. monobank pushes the agreement into their app; they approve it and the
//      first payment is taken. The order now waits in
//      IN_PROCESS / WAITING_FOR_STORE_CONFIRM.
//   3. We "hand over the goods": POST /api/order/confirm. Only that makes the
//      installment real and monobank pay us — so we confirm, then fulfil().
//
// Step 3 is reached three ways, all through settle(): monobank's signed
// callback, the buyer's page asking /api/mono/order/<id> every few seconds,
// and a sweep on a timer over the last two days' orders (a callback can get
// lost and the buyer can close the tab). Each order is remembered in
// lava_invoices as contract `mono-<order_id>` -> the tariff's lava product id,
// so fulfil() grants exactly what the same tariff bought on lava grants, and
// /grant lists the payment with every other one.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { EMAIL_RE, GRANT_TIERS, normEmail } from './fulfilment.js';

// What can be bought in parts. `tier` is a GRANT_TIERS key — the access it
// gives. Prices (hryvnias) come from MONO_PRICES_UAH, e.g.
// "design-base=38000,design-base-mk=28000,design-pro=88000", so they can be
// changed on Render without a deploy. A plan without a price is not for sale.
export const MONO_PLANS = {
    'design-base': { tier: 'design-base', title: '«Васту-дизайн» · тариф «Основной»' },
    'design-base-mk': { tier: 'design-base', title: '«Васту-дизайн» · тариф «Основной» для участниц мастер-класса' },
    'design-pro': { tier: 'design-pro', title: '«Васту-дизайн» · тариф «Наставничество»' },
};

// How many payments the buyer may choose (MONO_PARTS, e.g. "3,4,5,6"). The
// store pays monobank's fee, which grows with the count, and monobank refuses
// counts the store's agreement doesn't allow (PAY_PARTS_ARE_NOT_ACCEPTABLE).
const DEFAULT_PARTS = [3, 4, 5, 6];

export function parsePrices(raw) {
    const out = {};
    for (const pair of String(raw || '').split(',')) {
        const [k, v] = pair.split('=').map((s) => s && s.trim());
        const n = Number(String(v || '').replace(/[\s_]/g, ''));
        if (k && MONO_PLANS[k] && Number.isFinite(n) && n >= 2) out[k] = n;
    }
    return out;
}

export function parseParts(raw) {
    const list = String(raw || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 3 && n <= 25);
    return list.length ? [...new Set(list)].sort((a, b) => a - b) : DEFAULT_PARTS;
}

// +380XXXXXXXXX from what people actually type: "067 123 45 67",
// "+38 (067) 123-45-67", "380671234567". null if it can't be a UA mobile.
export function normPhone(raw) {
    let d = String(raw || '').replace(/[^\d]/g, '');
    if (d.length === 10 && d.startsWith('0')) d = `38${d}`;
    if (d.length === 9) d = `380${d}`;
    return /^380\d{9}$/.test(d) ? `+${d}` : null;
}

// signature = base64(HMAC-SHA256(raw body, sign key)) — both ways: on our
// requests and on monobank's callback.
export function monoSign(signKey, body) {
    return crypto.createHmac('sha256', String(signKey)).update(body, 'utf8').digest('base64');
}

export function monoSignatureOk(signKey, body, signature) {
    if (!signKey || !signature) return false;
    const expected = Buffer.from(monoSign(signKey, body));
    const got = Buffer.from(String(signature).trim());
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// What the buyer reads when monobank says no (order_sub_state of a FAIL).
const FAIL_TEXT = {
    CLIENT_NOT_FOUND: 'Этот номер не найден в monobank. Нужен номер, на который зарегистрировано приложение monobank.',
    EXCEEDED_SUM_LIMIT: 'Сумма больше вашего лимита «Покупки Частинами». Лимит виден в приложении monobank, раздел «Покупка Частинами».',
    EXISTS_OTHER_OPEN_ORDER: 'У вас уже есть незавершённая заявка «Покупки Частинами». Отмените её в приложении monobank или подождите 15 минут.',
    NOT_ENOUGH_MONEY_FOR_INIT_DEBIT: 'На карте не хватило денег на первый платёж. Пополните карту и попробуйте снова.',
    REJECTED_BY_CLIENT: 'Заявка отклонена в приложении monobank.',
    CLIENT_PUSH_TIMEOUT: 'Заявку не подтвердили в приложении за 15 минут. Попробуйте ещё раз.',
    REJECTED_BY_STORE: 'Заявка отменена.',
};
const FAIL_DEFAULT = 'monobank не одобрил заявку. Попробуйте позже или оплатите картой на странице тарифа.';
// FAIL reasons that mean our setup is wrong, not the buyer's situation.
const FAIL_ALERT = new Set(['PAY_PARTS_ARE_NOT_ACCEPTABLE', 'FAIL']);

export function failText(subState) {
    return FAIL_TEXT[subState] || FAIL_DEFAULT;
}

const SWEEP_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function createMono({ storeId, signKey, base = 'https://u2.monobank.com.ua', appUrl, prices, parts, getSupabase, fulfil, alert }) {
    const appBase = (appUrl || 'https://vastu-portal-app.onrender.com').replace(/\/$/, '');
    const configured = !!(storeId && signKey);
    const priceOf = parsePrices(prices);
    const partsList = parseParts(parts);

    function plan(key) {
        const p = MONO_PLANS[key];
        const tier = p && GRANT_TIERS.find((t) => t.key === p.tier);
        if (!p || !tier || !priceOf[key]) return null;
        return { key, title: p.title, uah: priceOf[key], parts: partsList, lavaId: tier.lavaId };
    }

    async function call(path, payload) {
        const body = JSON.stringify(payload);
        const resp = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'store-id': storeId, signature: monoSign(signKey, body) },
            body,
        });
        const text = await resp.text();
        let data = null;
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
        if (!resp.ok) {
            const err = new Error(`monobank ${resp.status} ${path}: ${data?.message || data?.raw || text.slice(0, 200)} (trace ${resp.headers.get('trace-id') || '—'})`);
            err.status = resp.status;
            throw err;
        }
        return data || {};
    }

    // -> { orderId } or { error, status } for the buyer's page.
    async function createOrder({ planKey, email, phone, parts: wantParts }) {
        if (!configured) return { status: 503, error: '«Покупка Частинами» временно недоступна.' };
        const p = plan(planKey);
        if (!p) return { status: 404, error: 'Этот тариф нельзя оформить через «Покупку Частинами».' };
        email = normEmail(email);
        if (!EMAIL_RE.test(email)) return { status: 400, error: 'Проверьте почту — на неё придёт доступ к курсу.' };
        const clientPhone = normPhone(phone);
        if (!clientPhone) return { status: 400, error: 'Нужен украинский номер в формате +380…, на который зарегистрировано приложение monobank.' };
        const n = Number(wantParts);
        if (!p.parts.includes(n)) return { status: 400, error: 'Выберите количество платежей.' };

        const storeOrderId = `vd-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }); // YYYY-MM-DD
        const created = await call('/api/order/create', {
            store_order_id: storeOrderId,
            client_phone: clientPhone,
            total_sum: p.uah,
            invoice: { date: today, number: storeOrderId, source: 'INTERNET' },
            available_programs: [{ type: 'payment_installments', available_parts_count: [n] }],
            products: [{ name: p.title, count: 1, sum: p.uah }],
            result_callback: `${appBase}/api/mono/callback`,
        });
        if (created.state === 'FAIL' || !created.order_id) {
            if (FAIL_ALERT.has(created.order_sub_state)) await alert(`monobank не принял заявку (${created.order_sub_state || 'без причины'})`, { email, plan: p.key, parts: n, created });
            return { status: 402, error: failText(created.order_sub_state) };
        }

        // Without this row the approval could not be turned into access, so
        // an order we can't remember is withdrawn before the buyer approves it.
        const { error } = await getSupabase()
            .from('lava_invoices')
            .insert({ contract_id: `mono-${created.order_id}`, offer_id: p.lavaId, email });
        if (error) {
            await call('/api/order/reject', { order_id: created.order_id }).catch(() => {});
            await alert('заявка monobank отменена: не удалось её сохранить', { email, orderId: created.order_id, error: error.message });
            return { status: 500, error: 'Не получилось создать заявку. Попробуйте ещё раз через минуту.' };
        }
        console.log(`monobank order ${created.order_id}: ${p.key}, ${p.uah} UAH in ${n} parts`);
        return { orderId: created.order_id };
    }

    // Orders that ended without a sale (FAIL, RETURNED): the sweep stops
    // asking about them. In memory — after a restart it asks once more.
    const finished = new Set();

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

    // Moves one order as far as it can go. Safe to call any number of times.
    // -> { state, subState, granted?, message? }
    async function settle(orderId, via = 'webhook') {
        return withLock(orderId, async () => {
            const supabase = getSupabase();
            const contractId = `mono-${orderId}`;
            const { data: row, error } = await supabase
                .from('lava_invoices')
                .select('contract_id, offer_id, email')
                .eq('contract_id', contractId)
                .maybeSingle();
            if (error) throw new Error(`lava_invoices lookup failed: ${error.message}`);
            if (!row) return { state: 'UNKNOWN' };

            const { data: done } = await supabase
                .from('purchases')
                .select('status')
                .eq('contract_id', contractId)
                .maybeSingle();
            if (done?.status === 'granted') return { state: 'SUCCESS', granted: true };

            const st = await call('/api/order/state', { order_id: orderId });
            let state = st.state;
            let sub = st.order_sub_state;

            if (state === 'IN_PROCESS' && sub === 'WAITING_FOR_STORE_CONFIRM') {
                const c = await call('/api/order/confirm', { order_id: orderId });
                if (c.state === 'FAIL') {
                    await alert('monobank не принял подтверждение заявки', { orderId, email: row.email, response: c });
                    return { state: 'FAIL', subState: c.order_sub_state, message: failText(c.order_sub_state) };
                }
                state = 'SUCCESS';
                sub = c.order_sub_state || 'ACTIVE';
            }

            if (state === 'SUCCESS' && (sub === 'ACTIVE' || sub === 'DONE')) {
                const r = await fulfil({
                    contractId,
                    email: row.email,
                    lavaIds: [row.offer_id],
                    source: via === 'sweep' ? 'poll' : 'webhook',
                    amount: st.total_sum ?? null,
                    currency: 'UAH',
                });
                return { state, subState: sub, granted: r.status === 'granted' };
            }
            if (state === 'FAIL') {
                if (!finished.has(orderId) && FAIL_ALERT.has(sub)) await alert(`monobank отказал по заявке (${sub})`, { orderId, email: row.email });
                finished.add(orderId);
                return { state, subState: sub, message: failText(sub) };
            }
            if (state === 'SUCCESS') {
                // RETURNED before we granted anything: nothing to give.
                finished.add(orderId);
                return { state, subState: sub };
            }
            return { state: state || 'IN_PROCESS', subState: sub || null };
        });
    }

    // POST /api/mono/callback. Answers 200 to anything signed, so monobank
    // doesn't retry what we can't use; the sweep picks up what we couldn't do.
    async function handleCallback(rawBody, signature) {
        if (!monoSignatureOk(signKey, rawBody, signature)) return { status: 401 };
        let payload;
        try { payload = JSON.parse(rawBody); } catch { return { status: 400 }; }
        const orderId = String(payload?.order_id || '');
        if (!orderId) return { status: 400 };
        try {
            const r = await settle(orderId, 'webhook');
            return { status: 200, result: r };
        } catch (err) {
            console.error(`monobank callback ${orderId} failed:`, err?.message || err);
            return { status: 200, result: { error: 'deferred to sweep' } };
        }
    }

    // Every order of the last two days that isn't granted yet.
    async function sweep() {
        if (!configured) return { skipped: 'monobank not configured' };
        const supabase = getSupabase();
        const since = new Date(Date.now() - SWEEP_WINDOW_MS).toISOString();
        const { data: rows, error } = await supabase
            .from('lava_invoices')
            .select('contract_id, created_at')
            .like('contract_id', 'mono-%')
            .gte('created_at', since);
        if (error) return { errors: [error.message] };
        const ids = (rows || []).map((r) => r.contract_id);
        if (!ids.length) return { checked: 0, granted: [] };
        const { data: known } = await supabase.from('purchases').select('contract_id, status').in('contract_id', ids);
        const granted = new Set((known || []).filter((p) => p.status === 'granted').map((p) => p.contract_id));
        const result = { checked: 0, granted: [], errors: [] };
        for (const id of ids) {
            if (granted.has(id) || finished.has(id.slice('mono-'.length))) continue;
            result.checked += 1;
            try {
                const r = await settle(id.slice('mono-'.length), 'sweep');
                if (r.granted) result.granted.push(id);
            } catch (err) {
                result.errors.push({ contractId: id, error: String(err?.message || err) });
            }
        }
        return result;
    }

    return { configured, plan, createOrder, settle, handleCallback, sweep };
}
