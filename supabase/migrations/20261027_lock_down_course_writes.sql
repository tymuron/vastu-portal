-- ===========================================================================
-- PROPOSED — NOT APPLIED. Review, then run once in the Supabase SQL editor.
-- Not executed anywhere yet (no local Postgres); written against the policy
-- names in this repo's SQL files. Run the check query below before and after.
-- ===========================================================================
--
-- Why. Probes with the public anon key (the one in the JS bundle) on
-- 2026-10-26, which wrote nothing (scripts/check-anon-access.mjs), showed:
--   * anyone, without logging in, passes the row-level check for INSERT on
--     weeks, days, materials and live_streams;
--   * anyone may upload into the course-content bucket and list its files,
--     and list the library_files bucket.
-- Both come from supabase_schema.sql ("Enable insert/update/delete for all
-- users", "Anyone can upload/update/delete course content"). Every later
-- migration replaced only the SELECT policies and left these alone. The same
-- script's update/delete policies let any logged-in student edit or delete
-- the weeks, lessons and materials of the course they bought (not probed:
-- that test would be destructive).
-- Separately, "Users can update own profile." (schema.sql) has no check on
-- the role column, so a student can make their own profile role = 'teacher'
-- through the API. The app never writes profiles from the browser, so the
-- trigger below changes nothing for real users.
--
-- After this:
--   * only teachers write weeks, days, materials, live_streams and
--     course-content files; the service role (server.js,
--     scripts/import-lesson.mjs) bypasses RLS as before;
--   * course-content and library_files stay public buckets, so the file
--     URLs students open keep working, but only teachers can list them, and
--     nobody else can overwrite course-content files;
--   * profiles.role changes only from the SQL editor or the service role.
--
-- After applying, `node scripts/check-anon-access.mjs` should report
-- "nothing open". Then run 20261028_private_course_files_1_policy.sql right
-- away: without it, an app that opens lesson files by signed link
-- (src/lib/courseFiles.ts) can't open any.
--
-- Check what exists, before and after:
--   select schemaname, tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where (schemaname = 'public' and tablename in ('weeks', 'days', 'materials', 'live_streams', 'profiles'))
--      or (schemaname = 'storage' and tablename = 'objects')
--   order by 1, 2, 3;
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Course structure: writes for teachers only
-- ---------------------------------------------------------------------------

drop policy if exists "Enable insert for all users" on public.weeks;
drop policy if exists "Enable update for all users" on public.weeks;
drop policy if exists "Enable delete for all users" on public.weeks;
drop policy if exists "Teachers can insert weeks." on public.weeks;
drop policy if exists "Teachers can update weeks." on public.weeks;
drop policy if exists "Teachers can delete weeks." on public.weeks;
drop policy if exists "Teachers can write weeks" on public.weeks;
create policy "Teachers can write weeks"
  on public.weeks for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "Enable insert for all users" on public.days;
drop policy if exists "Enable update for all users" on public.days;
drop policy if exists "Enable delete for all users" on public.days;
drop policy if exists "Teachers can edit days." on public.days;
drop policy if exists "Teachers can write days" on public.days;
create policy "Teachers can write days"
  on public.days for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "Enable insert for all users" on public.materials;
drop policy if exists "Enable update for all users" on public.materials;
drop policy if exists "Enable delete for all users" on public.materials;
drop policy if exists "Teachers can edit materials." on public.materials;
drop policy if exists "Teachers can write materials" on public.materials;
create policy "Teachers can write materials"
  on public.materials for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "Enable insert for all users" on public.live_streams;
drop policy if exists "Enable update for all users" on public.live_streams;
drop policy if exists "Enable delete for all users" on public.live_streams;
drop policy if exists "Teachers can manage streams" on public.live_streams;
drop policy if exists "Teachers can write streams" on public.live_streams;
create policy "Teachers can write streams"
  on public.live_streams for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

-- ---------------------------------------------------------------------------
-- 2. course-content files: teachers manage them; nobody else lists or writes.
--    Public URLs don't go through RLS, so students' links keep working.
-- ---------------------------------------------------------------------------

drop policy if exists "Course content is publicly accessible" on storage.objects;
drop policy if exists "Anyone can upload course content" on storage.objects;
drop policy if exists "Anyone can update course content" on storage.objects;
drop policy if exists "Anyone can delete course content" on storage.objects;
drop policy if exists "Teachers manage course content" on storage.objects;
create policy "Teachers manage course content"
  on storage.objects for all
  using (bucket_id = 'course-content'
         and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (bucket_id = 'course-content'
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

-- library_files (storage_fix.sql) already limits writes to teachers, but its
-- "Public Access" read policy lets anyone list the bucket. Teachers keep
-- read access: the upload's insert ... returning needs it.
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Teachers read library files" on storage.objects;
create policy "Teachers read library files"
  on storage.objects for select
  using (bucket_id = 'library_files'
         and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

-- ---------------------------------------------------------------------------
-- 3. profiles.role is set by an admin only. SECURITY INVOKER on purpose:
--    current_user is the API role (anon / authenticated) for browser calls,
--    and postgres / service_role for the SQL editor and server.js.
-- ---------------------------------------------------------------------------

create or replace function public.keep_profile_role()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.role is distinct from 'student' then
      raise exception 'profiles.role is set by an admin only';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'profiles.role is set by an admin only';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_profile_role on public.profiles;
create trigger keep_profile_role
  before insert or update on public.profiles
  for each row execute function public.keep_profile_role();
