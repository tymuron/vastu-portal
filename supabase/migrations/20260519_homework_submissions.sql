-- Homework submissions: student writes per-lesson, teacher reads all.
-- Storage bucket is PRIVATE; teachers + the owning student can read,
-- enforced via RLS on both the table and storage.objects.

create table if not exists public.homework_submissions (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  day_id       uuid references public.days(id) on delete cascade not null,
  content      text default '',
  file_url     text,         -- object path inside homework_files bucket (signed-URL on read)
  file_name    text,         -- original filename for display
  submitted_at timestamptz default timezone('utc', now()) not null,
  updated_at   timestamptz default timezone('utc', now()) not null,
  unique (user_id, day_id)
);

create index if not exists homework_submissions_day_id_idx  on public.homework_submissions(day_id);
create index if not exists homework_submissions_user_id_idx on public.homework_submissions(user_id);

alter table public.homework_submissions enable row level security;

drop policy if exists "Students read own homework"   on public.homework_submissions;
drop policy if exists "Teachers read all homework"   on public.homework_submissions;
drop policy if exists "Students insert own homework" on public.homework_submissions;
drop policy if exists "Students update own homework" on public.homework_submissions;

create policy "Students read own homework"
  on public.homework_submissions for select
  using (user_id = auth.uid());

create policy "Teachers read all homework"
  on public.homework_submissions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

create policy "Students insert own homework"
  on public.homework_submissions for insert
  with check (user_id = auth.uid());

create policy "Students update own homework"
  on public.homework_submissions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Storage bucket (private). Object path convention: '{user_id}/{day_id}/{filename}'
insert into storage.buckets (id, name, public)
values ('homework_files', 'homework_files', false)
on conflict (id) do nothing;

drop policy if exists "Homework: student upload own"  on storage.objects;
drop policy if exists "Homework: read own or teacher" on storage.objects;
drop policy if exists "Homework: student update own"  on storage.objects;
drop policy if exists "Homework: student delete own"  on storage.objects;

create policy "Homework: student upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'homework_files'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Homework: read own or teacher"
  on storage.objects for select
  using (
    bucket_id = 'homework_files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
    )
  );

create policy "Homework: student update own"
  on storage.objects for update
  using (
    bucket_id = 'homework_files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Homework: student delete own"
  on storage.objects for delete
  using (
    bucket_id = 'homework_files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
