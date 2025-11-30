-- Enable Storage Buckets
insert into storage.buckets (id, name, public)
values ('library_files', 'library_files', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('stream_audio', 'stream_audio', true)
on conflict (id) do nothing;

-- DROP ALL EXISTING POLICIES TO AVOID CONFLICTS
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Teachers can upload library files" on storage.objects;
drop policy if exists "Teachers can update library files" on storage.objects;
drop policy if exists "Teachers can delete library files" on storage.objects;
drop policy if exists "Public Audio Access" on storage.objects;
drop policy if exists "Teachers can upload stream audio" on storage.objects;
drop policy if exists "Teachers can update stream audio" on storage.objects;
drop policy if exists "Teachers can delete stream audio" on storage.objects;

-- RE-CREATE POLICIES

-- 1. Library Files
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'library_files' );

create policy "Teachers can upload library files"
  on storage.objects for insert
  with check (
    bucket_id = 'library_files' 
    and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
  );

create policy "Teachers can update library files"
  on storage.objects for update
  using (
    bucket_id = 'library_files'
    and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
  );

create policy "Teachers can delete library files"
  on storage.objects for delete
  using (
    bucket_id = 'library_files'
    and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
  );

-- 2. Stream Audio
create policy "Public Audio Access"
  on storage.objects for select
  using ( bucket_id = 'stream_audio' );

create policy "Teachers can upload stream audio"
  on storage.objects for insert
  with check (
    bucket_id = 'stream_audio'
    and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
  );

create policy "Teachers can update stream audio"
  on storage.objects for update
  using (
    bucket_id = 'stream_audio'
    and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
  );

create policy "Teachers can delete stream audio"
  on storage.objects for delete
  using (
    bucket_id = 'stream_audio'
    and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
  );
