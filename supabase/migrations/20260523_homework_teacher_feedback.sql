-- Teacher can reply to a student's homework submission. Students see the
-- reply inline on the lesson page below their own answer.

alter table public.homework_submissions
  add column if not exists teacher_feedback text default '',
  add column if not exists teacher_feedback_at timestamptz;

-- Existing "Students update own homework" policy stays (students keep editing
-- their own answer). Add a separate update policy so teachers can write a
-- reply on any row.
drop policy if exists "Teachers update homework feedback" on public.homework_submissions;
create policy "Teachers update homework feedback"
  on public.homework_submissions for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));
