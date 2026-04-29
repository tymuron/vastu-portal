/*
 * Migration: Time-limited course access (expiry)
 *
 * Introduces an access window for paid courses. Standard buyers of Course 2
 * get 6 months of access counted from a fixed course-start date; VIP buyers
 * keep lifetime access (and so does the VIP-bonus course and Course 1
 * grandfathered users from the migration backfill).
 *
 * New columns:
 *   - courses.starts_at, courses.access_duration_months -- per-course config
 *   - course_offers.is_lifetime                         -- offer-level override
 *   - user_entitlements.expires_at                      -- per-grant expiry
 *   - user_entitlements.reminder_sent_at                -- expiry-reminder cron
 *
 * Course 2 (vastu-2) is configured to start 2026-05-18 with a 6-month window.
 * VIP offer mappings (cc9da614..., 39485bee...) are flagged is_lifetime=true
 * so the webhook skips expiry computation for them.
 *
 * The five entitlement-gated SELECT policies (weeks/days/materials/
 * live_streams/library_items) are replaced with versions that also check
 * `expires_at is null or expires_at > now()`. INSERT/UPDATE/DELETE policies
 * are NOT touched.
 *
 * Existing entitlements get expires_at = NULL (the column default), which
 * means lifetime -- so Course 1 grandfathered users keep their access.
 *
 * Idempotent: safe to re-run.
 */

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

alter table public.courses
  add column if not exists starts_at timestamptz;

alter table public.courses
  add column if not exists access_duration_months integer;

alter table public.course_offers
  add column if not exists is_lifetime boolean default false;

alter table public.user_entitlements
  add column if not exists expires_at timestamptz;

alter table public.user_entitlements
  add column if not exists reminder_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Configure courses
-- ---------------------------------------------------------------------------

-- Course 2 base: opens 2026-05-18, 6-month access window.
update public.courses
  set starts_at = timestamptz '2026-05-18 00:00:00+00',
      access_duration_months = 6
  where slug = 'vastu-2';

-- vastu-2-vip stays unconfigured (no expiry; VIP-bonus access is lifetime)
-- vastu-1 stays unconfigured (legacy, lifetime for grandfathered users)

-- ---------------------------------------------------------------------------
-- 3. Mark VIP offer mappings as lifetime
-- ---------------------------------------------------------------------------

update public.course_offers
  set is_lifetime = true
  where lava_offer_id in (
    'cc9da614-4a70-485f-b009-19427d87e375',
    '39485bee-88cb-44d1-9fd4-2b2580164801'
  );

-- ---------------------------------------------------------------------------
-- 4. Replace entitlement-gated SELECT policies with expiry-aware versions
-- ---------------------------------------------------------------------------

-- weeks
drop policy if exists "Users can view weeks for entitled courses" on public.weeks;
create policy "Users can view weeks for entitled courses"
  on public.weeks for select
  using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid()
              and e.course_id = weeks.course_id
              and (e.expires_at is null or e.expires_at > now()))
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'teacher')
  );

-- days: gate via parent week's course
drop policy if exists "Users can view days for entitled courses" on public.days;
create policy "Users can view days for entitled courses"
  on public.days for select
  using (
    exists (
      select 1 from public.weeks w
      where w.id = days.week_id
        and (
          exists (select 1 from public.user_entitlements e
                  where e.user_id = auth.uid()
                    and e.course_id = w.course_id
                    and (e.expires_at is null or e.expires_at > now()))
          or exists (select 1 from public.profiles p
                     where p.id = auth.uid() and p.role = 'teacher')
        )
    )
  );

-- materials: gate via parent week (direct week_id, or via day -> week)
drop policy if exists "Users can view materials for entitled courses" on public.materials;
create policy "Users can view materials for entitled courses"
  on public.materials for select
  using (
    exists (
      select 1 from public.weeks w
      where (
        w.id = materials.week_id
        or w.id = (select d.week_id from public.days d where d.id = materials.day_id)
      )
      and (
        exists (select 1 from public.user_entitlements e
                where e.user_id = auth.uid()
                  and e.course_id = w.course_id
                  and (e.expires_at is null or e.expires_at > now()))
        or exists (select 1 from public.profiles p
                   where p.id = auth.uid() and p.role = 'teacher')
      )
    )
  );

-- live_streams
drop policy if exists "Users can view streams for entitled courses" on public.live_streams;
create policy "Users can view streams for entitled courses"
  on public.live_streams for select
  using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid()
              and e.course_id = live_streams.course_id
              and (e.expires_at is null or e.expires_at > now()))
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'teacher')
  );

-- library_items
drop policy if exists "Users can view library for entitled courses" on public.library_items;
create policy "Users can view library for entitled courses"
  on public.library_items for select
  using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid()
              and e.course_id = library_items.course_id
              and (e.expires_at is null or e.expires_at > now()))
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'teacher')
  );

-- ---------------------------------------------------------------------------
-- 5. Index for the expiry-reminder cron
-- ---------------------------------------------------------------------------

create index if not exists user_entitlements_expires_at_idx
  on public.user_entitlements(expires_at)
  where expires_at is not null and reminder_sent_at is null;
