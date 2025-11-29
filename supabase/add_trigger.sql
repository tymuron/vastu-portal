-- 1. Create a function to handle new user signups
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'student');
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create the trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. MANUALLY FIX EXISTING USER (Run this once)
-- This inserts a profile for your existing user if it's missing
insert into public.profiles (id, email, role)
select id, email, 'teacher' -- Force teacher role
from auth.users
where not exists (select 1 from public.profiles where profiles.id = auth.users.id);

-- 4. FORCE UPDATE ROLE (Just in case profile existed but was student)
update public.profiles
set role = 'teacher'
where email like '%@%'; -- Updates ALL users to teacher for now to be safe, or specify email
