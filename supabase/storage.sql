-- 1. Create the Storage Bucket
insert into storage.buckets (id, name, public)
values ('course-content', 'course-content', true)
on conflict (id) do nothing;

-- 2. Security Policies for Storage

-- Allow Public Read (Students need to download files)
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'course-content' );

-- Allow Teachers to Upload
create policy "Teachers Upload"
on storage.objects for insert
with check (
  bucket_id = 'course-content' 
  and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
);

-- Allow Teachers to Update/Delete
create policy "Teachers Delete"
on storage.objects for delete
using (
  bucket_id = 'course-content'
  and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
);

create policy "Teachers Update"
on storage.objects for update
using (
  bucket_id = 'course-content'
  and exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' )
);
