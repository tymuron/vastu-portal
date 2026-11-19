// A course whose access window has closed is sold as a recording: the months count from the grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeExpiresAt } from '../fulfilment.js';

const biz = { slug: 'vastu-2', starts_at: '2026-05-18T00:00:00+00:00', access_duration_months: 6 };
const design = { slug: 'vastu-design-2026', starts_at: '2026-11-09T00:00:00+00:00', access_duration_months: 6 };

test('window still open: access ends at course start + months, as before', () => {
    assert.equal(computeExpiresAt({ courses: biz }, '2026-11-17T12:00:00Z'), '2026-11-18T00:00:00.000Z');
    assert.equal(computeExpiresAt({ courses: design }, '2026-11-19T12:00:00Z'), '2027-05-09T00:00:00.000Z');
    assert.equal(computeExpiresAt({ courses: design, access_months: 12 }, '2026-11-19T12:00:00Z'), '2027-11-09T00:00:00.000Z');
});

test('window closed: access ends months after the grant, never already over', () => {
    assert.equal(computeExpiresAt({ courses: biz }, '2026-11-19T12:00:00Z'), '2027-05-19T12:00:00.000Z');
    assert.equal(computeExpiresAt({ courses: biz, access_months: 6 }, '2026-11-18T00:00:00Z'), '2027-05-18T00:00:00.000Z');
    const old = computeExpiresAt({ courses: { ...biz, starts_at: '2020-01-01T00:00:00Z' } });
    assert.ok(Date.parse(old) > Date.now());
});

test('lifetime, no start date or no months: unchanged', () => {
    assert.equal(computeExpiresAt({ courses: biz, is_lifetime: true }, '2026-11-19T12:00:00Z'), null);
    assert.equal(computeExpiresAt({ courses: { ...biz, starts_at: null } }, '2026-11-19T12:00:00Z'), null);
    assert.equal(computeExpiresAt({ courses: { ...biz, access_duration_months: null } }, '2026-11-19T12:00:00Z'), null);
    assert.equal(computeExpiresAt(null), null);
});
