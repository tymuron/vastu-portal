// What the bank is told about us (the rest of monobank is in fulfilment.e2e.test.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMono } from '../mono.js';

async function callbackGiven({ appUrl, callbackBase }) {
    const original = globalThis.fetch;
    let sent = null;
    globalThis.fetch = async (_url, init) => {
        sent = JSON.parse(init.body);
        return new Response(JSON.stringify({ state: 'FAIL', order_sub_state: 'TEST' }));
    };
    try {
        const mono = createMono({
            storeId: 'store', signKey: 'key', base: 'https://bank.test', appUrl, callbackBase,
            prices: 'design-base=38000', parts: '3,4,6', getSupabase: () => null, fulfil: async () => {}, alert: async () => {},
        });
        await mono.createOrder({ planKey: 'design-base', email: 'buyer@example.com', phone: '+380671234567', parts: 4 });
    } finally {
        globalThis.fetch = original;
    }
    return sent.result_callback;
}

test("the bank's callback skips the public address, which is a router for people", async () => {
    assert.equal(
        await callbackGiven({ appUrl: 'https://lk.annaromeovastu.com', callbackBase: 'https://vastu-portal-app.onrender.com' }),
        'https://vastu-portal-app.onrender.com/api/mono/callback',
    );
});

test('off Render, where there is no direct address, the callback uses the app address', async () => {
    assert.equal(await callbackGiven({ appUrl: 'http://127.0.0.1:3000/' }), 'http://127.0.0.1:3000/api/mono/callback');
});
