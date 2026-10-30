// The public-endpoint rate limits (ratelimit.js), on a fake clock.
// End-to-end checks of the same limits are at the end of fulfilment.e2e.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, createRateLimiter } from '../ratelimit.js';

const MINUTE = 60 * 1000;
function clock() {
    let t = 1_000_000;
    const now = () => t;
    now.advance = (ms) => { t += ms; };
    return now;
}
const req = (headers, remoteAddress = '10.9.9.9') => ({ headers, socket: { remoteAddress } });

test('the sender is the address Cloudflare saw, not what the client wrote into X-Forwarded-For', () => {
    assert.equal(clientIp(req({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '1.2.3.4, 203.0.113.5' })), '203.0.113.5');
    assert.equal(clientIp(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })), '198.51.100.7', 'no Cloudflare (local, tests): first entry');
    assert.equal(clientIp(req({})), '10.9.9.9');
});

test('a key takes max hits per window, then refuses until the oldest hit ages out', () => {
    const now = clock();
    const limits = createRateLimiter({ now });
    const rule = [['e:a@example.com', 3, 15 * MINUTE]];
    assert.deepEqual([limits.take(rule), limits.take(rule), limits.take(rule), limits.take(rule)], [null, null, null, 'e:a@example.com']);
    now.advance(15 * MINUTE - 1);
    assert.equal(limits.take(rule), 'e:a@example.com');
    now.advance(1);
    assert.equal(limits.take(rule), null);
});

test('a refused request counts against none of its rules', () => {
    const now = clock();
    const limits = createRateLimiter({ now });
    const ask = (email) => limits.take([['i:203.0.113.9', 5, 60 * MINUTE], [`e:${email}`, 1, 15 * MINUTE]]);
    assert.equal(ask('x@example.com'), null);
    for (let i = 0; i < 10; i++) assert.equal(ask('x@example.com'), 'e:x@example.com');
    // The sender's budget is still 4 of 5: the refusals cost it nothing.
    assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map((p) => ask(`${p}@example.com`)), [null, null, null, null, 'i:203.0.113.9']);
});

test('a flood of other keys never resets a full key (the old limiter wiped its table at 5,000 keys)', () => {
    const now = clock();
    const limits = createRateLimiter({ now, maxKeys: 100 });
    const student = [['e:student@example.com', 3, 15 * MINUTE]];
    for (let i = 0; i < 3; i++) limits.take(student);
    for (let i = 0; i < 2600; i++) limits.take([[`e:junk${i}@example.com`, 3, 15 * MINUTE]]);
    assert.equal(limits.take(student), 'e:student@example.com');
    assert.ok(limits.size() <= 100);
});

test('a table full of live keys lets new keys through uncounted and says so, rather than refusing anyone', () => {
    const now = clock();
    let full = 0;
    const limits = createRateLimiter({ now, maxKeys: 10, onFull: () => { full += 1; } });
    for (let i = 0; i < 10; i++) assert.equal(limits.take([[`k${i}`, 5, MINUTE]]), null);
    assert.equal(limits.take([['new', 1, MINUTE]]), null);
    assert.equal(limits.take([['new', 1, MINUTE]]), null, 'not counted, so not refused either');
    assert.equal(full, 2);
    assert.equal(limits.take([['k0', 5, MINUTE]]), null, 'keys it already holds keep counting');
    now.advance(MINUTE);
    assert.equal(limits.take([['new', 1, MINUTE]]), null);
    assert.equal(limits.take([['new', 1, MINUTE]]), 'new', 'expired keys made room, so it counts again');
});

test('totals only count: they never refuse, and old hits age out', () => {
    const now = clock();
    const limits = createRateLimiter({ now });
    assert.deepEqual(Array.from({ length: 5 }, () => limits.count('access-all', 60 * MINUTE)), [1, 2, 3, 4, 5]);
    now.advance(60 * MINUTE);
    assert.equal(limits.count('access-all', 60 * MINUTE), 1);
});
