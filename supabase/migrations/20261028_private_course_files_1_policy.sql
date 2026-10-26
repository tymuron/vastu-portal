-- ===========================================================================
-- PROPOSED — NOT APPLIED. Step 1 of 2 for private lesson files.
-- Order: 20261027_lock_down_course_writes.sql → this file → deploy the app
-- that opens files by signed link → 20261028_private_course_files_2_bucket.sql
-- Not executed anywhere yet (no local Postgres).
-- ===========================================================================
--
-- Lesson files (bucket course-content) are paid content, but the bucket is
-- public: a file's URL opens for anyone, forever. The app now asks Storage
-- for a short-lived signed link instead (src/lib/courseFiles.ts), and
-- Storage signs only what the asking user may SELECT. This policy lets a
-- student read the files of the courses they have current access to — the
-- same rule as the weeks / days / materials policies — and nothing else.
-- Teachers already read everything through "Teachers manage course content"
-- (20261027); the service role bypasses RLS.
--
-- Files are found by their folder, which the editor and
-- scripts/import-lesson.mjs both use:
--   days/<lesson id>/…, homework/<lesson id>/…  -> lesson -> week -> course
--   weeks/<week id>/…                           -> week -> course
-- Anything else in the bucket stays teacher-only.
--
-- Safe while the bucket is still public: the old app keeps opening public
-- URLs, the new one signs. Idempotent.

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'Teachers manage course content')
     or exists (select 1 from pg_policies
                where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'Course content is publicly accessible') then
    raise exception 'Apply 20261027_lock_down_course_writes.sql first: course-content is still readable by everyone.';
  end if;
end $$;

-- SECURITY DEFINER so the lookups don't run through the RLS of days, weeks
-- and user_entitlements (and can't recurse). Ids are compared as text: a
-- folder name that isn't a uuid must mean "no", not an error.
create or replace function public.can_read_course_file(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  folders text[] := storage.foldername(object_name);
  owner_course uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher') then
    return true;
  end if;
  if folders[1] in ('days', 'homework') then
    select w.course_id into owner_course
    from public.days d join public.weeks w on w.id = d.week_id
    where d.id::text = folders[2];
  elsif folders[1] = 'weeks' then
    select w.course_id into owner_course
    from public.weeks w
    where w.id::text = folders[2];
  end if;
  return owner_course is not null and exists (
    select 1 from public.user_entitlements e
    where e.user_id = auth.uid()
      and e.course_id = owner_course
      and (e.expires_at is null or e.expires_at > now())
  );
end;
$$;

revoke all on function public.can_read_course_file(text) from public, anon;
grant execute on function public.can_read_course_file(text) to authenticated;

drop policy if exists "Students read their course files" on storage.objects;
create policy "Students read their course files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'course-content' and public.can_read_course_file(name));

-- Check (as a student, e.g. in the app): a lesson's file opens; a file of a
-- course the student doesn't have answers "Файл недоступен".
