-- 1. Add missing columns to 'days' table (if they don't exist)
alter table public.days 
add column if not exists description text,
add column if not exists video_url text;

-- 2. Add missing columns to 'weeks' table (if they don't exist)
alter table public.weeks
add column if not exists available_from timestamp with time zone;

-- 3. Refresh RLS Policies for Days
drop policy if exists "Teachers can edit days." on days;
create policy "Teachers can edit days."
  on days for all 
  using ( exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' ) );

-- 4. Refresh RLS Policies for Weeks
drop policy if exists "Teachers can insert weeks." on weeks;
create policy "Teachers can insert weeks."
  on weeks for insert 
  with check ( exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' ) );

drop policy if exists "Teachers can update weeks." on weeks;
create policy "Teachers can update weeks."
  on weeks for update 
  using ( exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' ) );

drop policy if exists "Teachers can delete weeks." on weeks;
create policy "Teachers can delete weeks."
  on weeks for delete 
  using ( exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' ) );

-- 5. Ensure 'days' table has correct permissions
grant all on public.days to authenticated;
grant all on public.weeks to authenticated;
