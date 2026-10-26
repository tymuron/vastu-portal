-- ===========================================================================
-- PROPOSED — NOT APPLIED. Step 2 of 2 for private lesson files.
-- Run ONLY after the app that opens files by signed link is live on Render;
-- before that, every lesson file stops opening for students.
-- ===========================================================================
--
-- From here on a lesson file's URL (materials.url keeps its public form as
-- the file's address) answers 400 without a signature, so links shared or
-- saved earlier stop working; students open files through the portal, which
-- signs a link for the next two hours.
--
-- Undo: update storage.buckets set public = true where id = 'course-content';

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'Students read their course files') then
    raise exception 'Apply 20261028_private_course_files_1_policy.sql first: students could not open any file.';
  end if;
end $$;

update storage.buckets set public = false where id = 'course-content';
