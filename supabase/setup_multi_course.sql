-- ============================================================================
-- VASTU PORTAL: multi-course access control + lava.top offers (one-shot setup)
-- ----------------------------------------------------------------------------
-- Paste this whole file into Supabase SQL Editor and run. Idempotent: safe
-- to run repeatedly. It creates the courses / entitlements / course_offers
-- tables, backfills existing students into Course 1, sets up RLS, and
-- inserts the lava.top offer -> course mappings for the 4 active offers.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.courses (
  id uuid default uuid_generate_v4() primary key,
  slug text unique not null,
  title text not null,
  description text,
  is_active boolean default true,
  order_index integer default 0,
  created_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.user_entitlements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  source text not null default 'manual',
  source_payment_id text,
  granted_at timestamptz default timezone('utc', now()) not null,
  unique (user_id, course_id)
);

create table if not exists public.course_offers (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  lava_offer_id text not null,
  created_at timestamptz default timezone('utc', now()) not null
);

do $$
declare
  cname text;
begin
  -- Drop legacy single-column UNIQUE on lava_offer_id if it exists
  select tc.constraint_name into cname
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
    and tc.table_schema = ccu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'course_offers'
    and tc.constraint_type = 'UNIQUE'
    and ccu.column_name = 'lava_offer_id'
    and not exists (
      select 1 from information_schema.constraint_column_usage ccu2
      where ccu2.constraint_name = tc.constraint_name
        and ccu2.table_schema = tc.table_schema
        and ccu2.column_name <> 'lava_offer_id'
    )
  limit 1;
  if cname is not null then
    execute format('alter table public.course_offers drop constraint %I', cname);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'course_offers_course_id_lava_offer_id_key'
      and conrelid = 'public.course_offers'::regclass
  ) then
    alter table public.course_offers
      add constraint course_offers_course_id_lava_offer_id_key
      unique (course_id, lava_offer_id);
  end if;
end $$;

create index if not exists course_offers_lava_offer_id_idx on public.course_offers(lava_offer_id);

-- ---------------------------------------------------------------------------
-- 2. weeks.course_id
-- ---------------------------------------------------------------------------

alter table public.weeks add column if not exists course_id uuid references public.courses(id);
create index if not exists weeks_course_id_idx on public.weeks(course_id);

-- ---------------------------------------------------------------------------
-- 3. Seed courses
-- ---------------------------------------------------------------------------

insert into public.courses (slug, title, description, order_index) values
  ('vastu-1',     'Курс 1: Васту-дизайн (базовый)',          'Первый поток курса.',                            1),
  ('vastu-2',     'Курс 2: Васту для бизнеса с Анной Ромео', 'Базовый доступ к курсу.',                        2),
  ('vastu-2-vip', 'Курс 2: VIP бонусы',                      'Дополнительные материалы для VIP-тарифов.',      3)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Backfill existing weeks and student entitlements -> Course 1
-- ---------------------------------------------------------------------------

update public.weeks
  set course_id = (select id from public.courses where slug = 'vastu-1')
  where course_id is null;

insert into public.user_entitlements (user_id, course_id, source)
select p.id, (select id from public.courses where slug = 'vastu-1'), 'migration'
from public.profiles p
where p.role = 'student'
on conflict (user_id, course_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. RLS on new tables
-- ---------------------------------------------------------------------------

alter table public.courses enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.course_offers enable row level security;

drop policy if exists "Authenticated users can view courses" on public.courses;
create policy "Authenticated users can view courses"
  on public.courses for select to authenticated using (true);

drop policy if exists "Teachers can manage courses" on public.courses;
create policy "Teachers can manage courses"
  on public.courses for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "Users can view own entitlements" on public.user_entitlements;
create policy "Users can view own entitlements"
  on public.user_entitlements for select using (auth.uid() = user_id);

drop policy if exists "Teachers can view all entitlements" on public.user_entitlements;
create policy "Teachers can view all entitlements"
  on public.user_entitlements for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "Teachers can manage entitlements" on public.user_entitlements;
create policy "Teachers can manage entitlements"
  on public.user_entitlements for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "Teachers can manage course offers" on public.course_offers;
create policy "Teachers can manage course offers"
  on public.course_offers for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

-- ---------------------------------------------------------------------------
-- 6. Replace SELECT policies on weeks / days / materials with
--    entitlement-gated versions. INSERT/UPDATE/DELETE policies are NOT
--    touched - the teacher app relies on them.
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated users can view weeks"     on public.weeks;
drop policy if exists "Enable read access for all users"       on public.weeks;
drop policy if exists "Weeks are viewable by everyone."        on public.weeks;
drop policy if exists "Authenticated users can view days"      on public.days;
drop policy if exists "Enable read access for all users"       on public.days;
drop policy if exists "Days are viewable by everyone."         on public.days;
drop policy if exists "Authenticated users can view materials" on public.materials;
drop policy if exists "Enable read access for all users"       on public.materials;
drop policy if exists "Materials are viewable by everyone."    on public.materials;

drop policy if exists "Users can view weeks for entitled courses" on public.weeks;
create policy "Users can view weeks for entitled courses"
  on public.weeks for select using (
    exists (select 1 from public.user_entitlements e where e.user_id = auth.uid() and e.course_id = weeks.course_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

drop policy if exists "Users can view days for entitled courses" on public.days;
create policy "Users can view days for entitled courses"
  on public.days for select using (
    exists (
      select 1 from public.weeks w
      where w.id = days.week_id and (
        exists (select 1 from public.user_entitlements e where e.user_id = auth.uid() and e.course_id = w.course_id)
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
      )
    )
  );

drop policy if exists "Users can view materials for entitled courses" on public.materials;
create policy "Users can view materials for entitled courses"
  on public.materials for select using (
    exists (
      select 1 from public.weeks w
      where (w.id = materials.week_id or w.id = (select d.week_id from public.days d where d.id = materials.day_id))
      and (
        exists (select 1 from public.user_entitlements e where e.user_id = auth.uid() and e.course_id = w.course_id)
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Lava.top offer -> course mappings (4 offers, VIP -> 2 courses)
-- ---------------------------------------------------------------------------

insert into public.course_offers (course_id, lava_offer_id) values
  -- Курс 2 (база) -- all 4 offers grant access
  ((select id from public.courses where slug = 'vastu-2'),     '3752d8b2-9e1b-4459-91db-b03d49c82d8b'), -- Стандарт (фокус группа)
  ((select id from public.courses where slug = 'vastu-2'),     'e38cc420-37b7-47a7-aa08-37e2e9b5d04e'), -- Стандарт
  ((select id from public.courses where slug = 'vastu-2'),     '39485bee-88cb-44d1-9fd4-2b2580164801'), -- VIP (фокус группа)
  ((select id from public.courses where slug = 'vastu-2'),     'cc9da614-4a70-485f-b009-19427d87e375'), -- VIP
  -- Курс 2: VIP бонусы -- only VIP offers
  ((select id from public.courses where slug = 'vastu-2-vip'), '39485bee-88cb-44d1-9fd4-2b2580164801'), -- VIP (фокус группа)
  ((select id from public.courses where slug = 'vastu-2-vip'), 'cc9da614-4a70-485f-b009-19427d87e375')  -- VIP
on conflict (course_id, lava_offer_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Scope live_streams + library_items by course
-- ---------------------------------------------------------------------------

alter table public.live_streams  add column if not exists course_id uuid references public.courses(id);
alter table public.library_items add column if not exists course_id uuid references public.courses(id);

create index if not exists live_streams_course_id_idx  on public.live_streams(course_id);
create index if not exists library_items_course_id_idx on public.library_items(course_id);

update public.live_streams
  set course_id = (select id from public.courses where slug = 'vastu-1')
  where course_id is null;

update public.library_items
  set course_id = (select id from public.courses where slug = 'vastu-1')
  where course_id is null;

drop policy if exists "Public streams are viewable by everyone"       on public.live_streams;
drop policy if exists "Enable read access for all users"              on public.live_streams;
drop policy if exists "Public library items are viewable by everyone" on public.library_items;
drop policy if exists "Enable read access for all users"              on public.library_items;

drop policy if exists "Users can view streams for entitled courses" on public.live_streams;
create policy "Users can view streams for entitled courses"
  on public.live_streams for select using (
    exists (select 1 from public.user_entitlements e where e.user_id = auth.uid() and e.course_id = live_streams.course_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

drop policy if exists "Users can view library for entitled courses" on public.library_items;
create policy "Users can view library for entitled courses"
  on public.library_items for select using (
    exists (select 1 from public.user_entitlements e where e.user_id = auth.uid() and e.course_id = library_items.course_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

-- ---------------------------------------------------------------------------
-- 9. Access expiry (time-limited access)
-- ---------------------------------------------------------------------------
-- Standard buyers get 6 months from a fixed course-start date; VIP buyers
-- and Course 1 grandfathered users keep lifetime access. Existing
-- entitlements default expires_at=NULL, so they remain lifetime.

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

update public.courses
  set starts_at = timestamptz '2026-05-18 00:00:00+00',
      access_duration_months = 6
  where slug = 'vastu-2';
-- vastu-2-vip stays unconfigured (no expiry; VIP-bonus access is lifetime)
-- vastu-1 stays unconfigured (legacy, lifetime for grandfathered users)

update public.course_offers
  set is_lifetime = true
  where lava_offer_id in (
    'cc9da614-4a70-485f-b009-19427d87e375',
    '39485bee-88cb-44d1-9fd4-2b2580164801'
  );

drop policy if exists "Users can view weeks for entitled courses" on public.weeks;
create policy "Users can view weeks for entitled courses"
  on public.weeks for select using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid()
              and e.course_id = weeks.course_id
              and (e.expires_at is null or e.expires_at > now()))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

drop policy if exists "Users can view days for entitled courses" on public.days;
create policy "Users can view days for entitled courses"
  on public.days for select using (
    exists (
      select 1 from public.weeks w
      where w.id = days.week_id and (
        exists (select 1 from public.user_entitlements e
                where e.user_id = auth.uid()
                  and e.course_id = w.course_id
                  and (e.expires_at is null or e.expires_at > now()))
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
      )
    )
  );

drop policy if exists "Users can view materials for entitled courses" on public.materials;
create policy "Users can view materials for entitled courses"
  on public.materials for select using (
    exists (
      select 1 from public.weeks w
      where (w.id = materials.week_id or w.id = (select d.week_id from public.days d where d.id = materials.day_id))
      and (
        exists (select 1 from public.user_entitlements e
                where e.user_id = auth.uid()
                  and e.course_id = w.course_id
                  and (e.expires_at is null or e.expires_at > now()))
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
      )
    )
  );

drop policy if exists "Users can view streams for entitled courses" on public.live_streams;
create policy "Users can view streams for entitled courses"
  on public.live_streams for select using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid()
              and e.course_id = live_streams.course_id
              and (e.expires_at is null or e.expires_at > now()))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

drop policy if exists "Users can view library for entitled courses" on public.library_items;
create policy "Users can view library for entitled courses"
  on public.library_items for select using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid()
              and e.course_id = library_items.course_id
              and (e.expires_at is null or e.expires_at > now()))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

create index if not exists user_entitlements_expires_at_idx
  on public.user_entitlements(expires_at)
  where expires_at is not null and reminder_sent_at is null;

-- ---------------------------------------------------------------------------
-- 10. Verification
-- ---------------------------------------------------------------------------

select c.slug, c.title, count(co.id) as offers_attached
from public.courses c
left join public.course_offers co on co.course_id = c.id
group by c.id, c.slug, c.title
order by c.order_index;
