# Vastu Portal — Session Context (handoff to next session)

Last updated: 2026-05-12

## Project
Anna Romeo's Russian Vastu learning portal (paid course platform) — `tymuron/vastu-portal`.
Stack: React + Vite + Supabase + Render + Lava.top webhook.
Active branch: `claude/multi-course-access-control-cOZfn` (identical to `main` post-merge).

## What was done in the recent sessions

### 1. Invite-email redirect bug (FIXED)
- **Symptom**: invite links opened `/login` instead of `/update-password`.
- **Root cause**: Supabase email template used `{{ .ConfirmationURL }}` which falls back to the Site URL (`/`), and `App.tsx:84` redirects `/` → `/login`.
- **Fix**: in Supabase dashboard email template, replaced both `{{ .ConfirmationURL }}` references with:
  `{{ .SiteURL }}/update-password?token_hash={{ .TokenHash }}&type=invite`
- `UpdatePasswordPage.tsx` already handles 4 token shapes (PKCE code, OTP token_hash, implicit access_token, existing session).

### 2. Manual entitlement grants (5 customers, all expires 2026-11-18)
- 3 lava recovery customers
- Юлия (invited)
- Olga (PayPal)
- Mila / lmin.kollegium@gmail.com (pre-existing account from 2026-04-22)

Standard SQL used:
```sql
insert into user_entitlements (user_id, course_id, source, expires_at)
select u.id,
  (select id from courses where slug = 'vastu-2'),
  'lava_recovery_2026_05',
  '2026-11-18 00:00:00+00'::timestamptz
from auth.users u
where u.email = 'email@example.com';
```

### 3. Teacher role upgrades (2 admins)
- Юлия Бардина (bardina.85@mail.ru) → `role='teacher'`
- Mila (lmin.kollegium@gmail.com) → `role='teacher'`

Both need to **log out and back in** for role change to take effect (told Anna).

```sql
update profiles set role = 'teacher'
where id = (select id from auth.users where email = 'email@example.com');
```

### 4. Webhook architecture confirmed
- Lava webhook is **account-level**, not per-offer — fires for ALL sales.
- Server resolves offer → course via `course_offers` lookup. Unknown offer = silent 200 no-op (server.js:309-313).
- For new courses/offers Anna creates: just add row to `course_offers` table; nothing in lava needs reconfig.

### 5. Comprehensive audit completed (3 agents)
- **1 cosmetic critical**: stale-session ghost-login in `src/contexts/AuthContext.tsx:64-72` (not urgent).
- **8 worth-knowing items**: recovery rows not in migrations, partial-state risk in webhook, `===` not timing-safe, no HMAC verification, `/welcome` unprotected, storage buckets public, returning-customer renewal semantics, `courses` table readable by all authenticated users.
- System is production-ready; nothing critical blocks launch.

### 6. Local clone
User cloned repo to `/Users/tymurchystiakov/antigravity-workspace/scratch/vastu-portal/` on their Mac via GitHub Desktop.

## Pending / future work
- (Low priority) Set `CRON_SECRET` + `RESEND_API_KEY` on Render for expiry-reminder cron.
- (Optional cleanup) Delete test entitlement for `chystiakovtymur@gmail.com` UUID `2ebac368-e5ab-4ddb-b6de-94d6f6f0fed6`.
- (Future polish) Patch stale-session bug in `AuthContext.tsx`.

## Key files
- `src/pages/UpdatePasswordPage.tsx` — handles all 4 token shapes
- `src/pages/LoginPage.tsx` — routes students → `/welcome`, teachers → `/teacher`
- `src/pages/WelcomePage.tsx` — editorial post-login page
- `src/App.tsx:60` — `/welcome` is unprotected; `:84` — `/` → `/login`
- `src/contexts/AuthContext.tsx:64-72` — stale-session bug location
- `server.js` — webhook (auth: 234-248, unknown offer: 309-313, computeExpiresAt: 165-176, upsertEntitlement: 186-230, invite + existing-user fallback: 322-348)
- `supabase/migrations/20260429_multi_course_access.sql:38` — `unique (user_id, course_id)`
- `supabase/migrations/20260429_access_expiry.sql:54-57` — Course 2 config; `:66-71` — VIP lifetime
- `supabase/handle_new_user.sql` — profile auto-creation trigger

## Diagnostic SQL kept handy
```sql
select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
  exists(select 1 from user_entitlements e where e.user_id = u.id) as has_entitlement
from auth.users u
where u.email = 'email@example.com';
```

## Open questions / context for next session
- Anna may still need to add more customers manually until everyone has bought through the new lava flow.
- Watch for further questions about webhook behavior when she creates a new course or updates pricing — answer: update `course_offers` table only.
