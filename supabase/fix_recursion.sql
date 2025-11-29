-- FIX INFINITE RECURSION
-- The issue is that checking "am I a teacher?" by querying the profiles table
-- triggers the "can I view profiles?" policy, which checks "am I a teacher?"... loop.

-- 1. Create a helper function that runs as ADMIN (bypassing RLS)
create or replace function public.is_teacher()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'teacher'
  );
end;
$$ language plpgsql security definer;

-- 2. Drop the broken policy
drop policy if exists "Teachers can view all profiles" on profiles;

-- 3. Re-create the policy using the safe function
create policy "Teachers can view all profiles"
  on profiles for select
  using ( public.is_teacher() );
