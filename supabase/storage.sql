-- Enable Storage
-- Note: Storage is enabled by default in Supabase, but we need to create buckets.

-- 1. Create 'library_files' bucket
insert into storage.buckets (id, name, public)
values ('library_files', 'library_files', true)
on conflict (id) do nothing;

-- 2. Create 'stream_audio' bucket
insert into storage.buckets (id, name, public)
values ('stream_audio', 'stream_audio', true)
on conflict (id) do nothing;

-- POLICIES FOR library_files

-- Allow public read access to library files
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'library_files' );

-- Allow teachers to upload/update/delete library files
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

-- POLICIES FOR stream_audio

-- Allow public read access to stream audio
create policy "Public Audio Access"
  on storage.objects for select
  using ( bucket_id = 'stream_audio' );

-- Allow teachers to upload/update/delete stream audio
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
