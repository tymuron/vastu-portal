// Teacher access check and manual grant (fulfilment.js + server.js):
// verifies teacher Bearer token via /auth/v1/user + profiles.role === 'teacher',
// rejects missing/invalid tokens (401) and student tokens (403), reads student
// access/purchases, supports dryRun preview, and grants access by tier key or
// Russian tariff name. Runs in-process via fake.fetch (no TCP port needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createFakeServices } from './fake-services.mjs';
import { GRANT_TIERS, createFulfilment, makeResendSender, resolveGrantTier } from '../fulfilment.js';

function makeWorld() {
    const fake = createFakeServices();
    const sb = createClient('http://fake.test', 'service-role', {
        global: { fetch: fake.fetch },
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const baseCourse = {
        id: crypto.randomUUID(),
        slug: 'vastu-design-2026',
        title: 'Васту-дизайн',
        starts_at: '2026-11-09T00:00:00+00:00',
        access_duration_months: 6,
        is_active: true,
    };
    const proCourse = {
        id: crypto.randomUUID(),
        slug: 'vastu-design-2026-pro',
        title: 'Васту-дизайн · Наставничество',
        starts_at: '2026-11-09T00:00:00+00:00',
        access_duration_months: 12,
        is_active: true,
    };
    fake.seed('courses', [baseCourse, proCourse]);

    const baseTier = GRANT_TIERS.find((t) => t.key === 'design-base');
    const proTier = GRANT_TIERS.find((t) => t.key === 'design-pro');
    fake.seed('course_offers', [
        { course_id: baseCourse.id, lava_offer_id: baseTier.lavaId, access_months: 6 },
        { course_id: baseCourse.id, lava_offer_id: proTier.lavaId, access_months: 12 },
        { course_id: proCourse.id, lava_offer_id: proTier.lavaId, access_months: 12 },
    ]);

    const teacherUser = fake.createUser('anna@example.com', { password: 'teacher-password' });
    fake.db.profiles.find((p) => p.id === teacherUser.id).role = 'teacher';

    const studentUser = fake.createUser('student@example.com', { password: 'student-password' });

    const fulfilment = createFulfilment({
        getSupabase: () => sb,
        sendEmail: async (mail) => {
            const resp = await fake.fetch('http://fake.test/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mail),
            });
            const body = await resp.json();
            return body.id;
        },
        appUrl: 'https://lk.annaromeovastu.com',
        accessSecret: 'access-secret',
        alertEmail: 'alerts@example.com',
        supabaseUrl: 'http://fake.test',
        serviceRoleKey: 'service-role',
        fetchFn: fake.fetch,
    });

    async function signIn(email, password) {
        const resp = await fake.fetch('http://fake.test/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        return resp.json();
    }

    return { fake, fulfilment, signIn };
}

test('teacher token is accepted (200); student token gets 403; missing or bad token gets 401', async () => {
    const { fulfilment, signIn } = makeWorld();
    const teacherSess = await signIn('anna@example.com', 'teacher-password');
    const studentSess = await signIn('student@example.com', 'student-password');

    const noAuth = await fulfilment.verifyTeacher('');
    assert.equal(noAuth.ok, false);
    assert.equal(noAuth.status, 401);

    const badAuth = await fulfilment.verifyTeacher('Bearer not-a-valid-token');
    assert.equal(badAuth.ok, false);
    assert.equal(badAuth.status, 401);

    const studentAuth = await fulfilment.verifyTeacher(`Bearer ${studentSess.access_token}`);
    assert.equal(studentAuth.ok, false);
    assert.equal(studentAuth.status, 403);

    const teacherAuth = await fulfilment.verifyTeacher(`Bearer ${teacherSess.access_token}`);
    assert.equal(teacherAuth.ok, true);
    assert.equal(teacherAuth.status, 200);
    assert.equal(teacherAuth.user.email, 'anna@example.com');
    assert.equal(teacherAuth.user.role, 'teacher');
});

test('resolveGrantTier matches both tier keys and Russian tariff names', () => {
    assert.equal(resolveGrantTier('design-base')?.key, 'design-base');
    assert.equal(resolveGrantTier('основной курс')?.key, 'design-base');
    assert.equal(resolveGrantTier('Васту-дизайн · Основной')?.key, 'design-base');
    assert.equal(resolveGrantTier('design-pro')?.key, 'design-pro');
    assert.equal(resolveGrantTier('наставничество')?.key, 'design-pro');
    assert.equal(resolveGrantTier('стандарт')?.key, 'standard');
    assert.equal(resolveGrantTier('вип')?.key, 'vip');
    assert.equal(resolveGrantTier('неизвестный тариф'), null);
});

test('grantByTier dryRun previews courses without creating user or sending email; live grant unlocks and emails', async () => {
    const { fake, fulfilment } = makeWorld();

    // 1. Check access before grant: account does not exist yet
    const before = await fulfilment.checkAccess('Maria@Example.com');
    assert.equal(before.status, 200);
    assert.equal(before.body.accountExists, false);
    assert.deepEqual(before.body.entitlements, []);
    assert.deepEqual(before.body.purchases, []);

    // 2. Dry run: writes nothing, sends nothing
    const dry = await fulfilment.grantByTier({
        email: 'Maria@Example.com',
        tier: 'основной курс',
        sendEmail: true,
        dryRun: true,
    });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dryRun, true);
    assert.equal(dry.body.granted, false);
    assert.equal(dry.body.tier, 'design-base');
    assert.deepEqual(dry.body.courses, ['vastu-design-2026']);
    assert.equal(fake.sent.length, 0);
    assert.equal(fake.db.purchases.length, 0);

    // 3. Live grant: creates account, unlocks course, sends welcome email
    const live = await fulfilment.grantByTier({
        email: 'Maria@Example.com',
        tier: 'основной курс',
        sendEmail: true,
        dryRun: false,
    });
    assert.equal(live.status, 200);
    assert.equal(live.body.granted, true);
    assert.equal(live.body.tier, 'design-base');
    assert.deepEqual(live.body.courses, ['vastu-design-2026']);
    assert.equal(live.body.emailSent, true);
    assert.match(live.body.loginLink, /\/access\?t=/);
    assert.equal(fake.sent.length, 1);
    assert.equal(fake.sent[0].to, 'maria@example.com');

    // 4. Check access after grant: account exists, course is unlocked, purchase is recorded
    const after = await fulfilment.checkAccess('maria@example.com');
    assert.equal(after.status, 200);
    assert.equal(after.body.accountExists, true);
    assert.deepEqual(
        after.body.entitlements.map((e) => e.slug),
        ['vastu-design-2026']
    );
    assert.equal(after.body.purchases.length, 1);
    assert.equal(after.body.purchases[0].status, 'granted');
});
