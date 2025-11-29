-- Update the check constraint to allow 'image' type
alter table public.materials 
drop constraint if exists materials_type_check;

alter table public.materials
add constraint materials_type_check 
check (type in ('video', 'pdf', 'pptx', 'doc', 'link', 'zip', 'image'));

-- Refresh RLS just in case
drop policy if exists "Teachers can edit materials." on materials;
create policy "Teachers can edit materials."
  on materials for all 
  using ( exists ( select 1 from public.profiles where id = auth.uid() and role = 'teacher' ) );

grant all on public.materials to authenticated;
