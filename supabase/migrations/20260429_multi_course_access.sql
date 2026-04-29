/*
 * Migration: Multi-course access control
 *
 * This migration introduces explicit "courses" plus per-user entitlements
 * and a mapping from lava.top offer UUIDs -> our courses. Existing students
 * are auto-entitled to Course 1 ("vastu-1") so the legacy single-course
 * experience keeps working. New courses are protected by RLS: weeks/days/
 * materials are now visible only to users who hold a matching row in
 * public.user_entitlements (teachers retain full read access).
 *
 * The migration is idempotent and safe to re-run. It does NOT touch the
 * existing INSERT/UPDATE/DELETE policies on weeks/days/materials, which
 * the teacher app relies on. Only SELECT policies on those tables are
 * replaced with entitlement-gated equivalents.
 */

-- ---------------------------------------------------------------------------
-- 1. New tables
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
  lava_offer_id text unique not null,
  created_at timestamptz default timezone('utc', now()) not null
);

-- ---------------------------------------------------------------------------
-- 2. Add course_id to weeks
-- ---------------------------------------------------------------------------

alter table public.weeks
  add column if not exists course_id uuid references public.courses(id);

create index if not exists weeks_course_id_idx on public.weeks(course_id);

-- ---------------------------------------------------------------------------
-- 3. Seed two courses
-- ---------------------------------------------------------------------------

insert into public.courses (slug, title, description, order_index)
values
  ('vastu-1', 'Курс 1: Васту-дизайн (базовый)', 'Первый поток курса.', 1),
  ('vastu-2', 'Курс 2: Васту-дизайн (новая волна)', 'Второй поток курса.', 2)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Backfill weeks.course_id -> vastu-1
-- ---------------------------------------------------------------------------

update public.weeks
  set course_id = (select id from public.courses where slug = 'vastu-1')
  where course_id is null;

-- ---------------------------------------------------------------------------
-- 5. Backfill entitlements for existing students
-- ---------------------------------------------------------------------------

insert into public.user_entitlements (user_id, course_id, source)
select
  p.id,
  (select id from public.courses where slug = 'vastu-1'),
  'migration'
from public.profiles p
where p.role = 'student'
on conflict (user_id, course_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Enable RLS on new tables
-- ---------------------------------------------------------------------------

alter table public.courses enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.course_offers enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Policies on new tables
-- ---------------------------------------------------------------------------

-- courses: any authenticated user can read; only teachers can write
drop policy if exists "Authenticated users can view courses" on public.courses;
create policy "Authenticated users can view courses"
  on public.courses for select
  to authenticated
  using (true);

drop policy if exists "Teachers can manage courses" on public.courses;
create policy "Teachers can manage courses"
  on public.courses for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'teacher')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'teacher')
  );

-- user_entitlements: users see their own; teachers see/manage all
drop policy if exists "Users can view own entitlements" on public.user_entitlements;
create policy "Users can view own entitlements"
  on public.user_entitlements for select
  using (auth.uid() = user_id);

drop policy if exists "Teachers can view all entitlements" on public.user_entitlements;
create policy "Teachers can view all entitlements"
  on public.user_entitlements for select
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'teacher')
  );

drop policy if exists "Teachers can manage entitlements" on public.user_entitlements;
create policy "Teachers can manage entitlements"
  on public.user_entitlements for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'teacher')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'teacher')
  );

-- course_offers: teachers only
drop policy if exists "Teachers can manage course offers" on public.course_offers;
create policy "Teachers can manage course offers"
  on public.course_offers for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'teacher')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'teacher')
  );

-- ---------------------------------------------------------------------------
-- 8. Replace SELECT policies on weeks / days / materials with
--    entitlement-gated versions. INSERT/UPDATE/DELETE policies are NOT
--    touched here - the teacher app depends on them.
-- ---------------------------------------------------------------------------

-- Drop legacy SELECT policies (cover all known names from both schema files)
drop policy if exists "Authenticated users can view weeks" on public.weeks;
drop policy if exists "Enable read access for all users" on public.weeks;
drop policy if exists "Weeks are viewable by everyone." on public.weeks;

drop policy if exists "Authenticated users can view days" on public.days;
drop policy if exists "Enable read access for all users" on public.days;
drop policy if exists "Days are viewable by everyone." on public.days;

drop policy if exists "Authenticated users can view materials" on public.materials;
drop policy if exists "Enable read access for all users" on public.materials;
drop policy if exists "Materials are viewable by everyone." on public.materials;

-- weeks: visible if user has entitlement to the week's course OR is a teacher
drop policy if exists "Users can view weeks for entitled courses" on public.weeks;
create policy "Users can view weeks for entitled courses"
  on public.weeks for select
  using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid() and e.course_id = weeks.course_id)
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
                  where e.user_id = auth.uid() and e.course_id = w.course_id)
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
                where e.user_id = auth.uid() and e.course_id = w.course_id)
        or exists (select 1 from public.profiles p
                   where p.id = auth.uid() and p.role = 'teacher')
      )
    )
  );
