/*
 * Migration: scope live_streams and library_items by course
 *
 * Both tables were globally readable by any authenticated user. With
 * multi-course access we need to gate them by entitlement, the same way
 * weeks / days / materials are gated. Existing rows are backfilled to
 * Course 1 (vastu-1) to preserve current behavior for Course 1 students.
 *
 * Idempotent.
 */

-- 1. Add course_id columns
alter table public.live_streams  add column if not exists course_id uuid references public.courses(id);
alter table public.library_items add column if not exists course_id uuid references public.courses(id);

create index if not exists live_streams_course_id_idx  on public.live_streams(course_id);
create index if not exists library_items_course_id_idx on public.library_items(course_id);

-- 2. Backfill existing rows to vastu-1
update public.live_streams
  set course_id = (select id from public.courses where slug = 'vastu-1')
  where course_id is null;

update public.library_items
  set course_id = (select id from public.courses where slug = 'vastu-1')
  where course_id is null;

-- 3. Replace open SELECT policies with entitlement-gated ones
drop policy if exists "Public streams are viewable by everyone"      on public.live_streams;
drop policy if exists "Enable read access for all users"             on public.live_streams;
drop policy if exists "Public library items are viewable by everyone" on public.library_items;
drop policy if exists "Enable read access for all users"             on public.library_items;

drop policy if exists "Users can view streams for entitled courses" on public.live_streams;
create policy "Users can view streams for entitled courses"
  on public.live_streams for select
  using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid() and e.course_id = live_streams.course_id)
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'teacher')
  );

drop policy if exists "Users can view library for entitled courses" on public.library_items;
create policy "Users can view library for entitled courses"
  on public.library_items for select
  using (
    exists (select 1 from public.user_entitlements e
            where e.user_id = auth.uid() and e.course_id = library_items.course_id)
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'teacher')
  );
