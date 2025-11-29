-- 1. FIX PROFILES SECURITY
-- Drop the insecure "viewable by everyone" policy
drop policy if exists "Public profiles are viewable by everyone." on profiles;

-- Create stricter policies
create policy "Users can view own profile" 
on profiles for select 
using ( auth.uid() = id );

create policy "Teachers can view all profiles" 
on profiles for select 
using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );


-- 2. SECURE COURSE CONTENT (Optional: Only logged in users can see content)
-- Drop old policies
drop policy if exists "Weeks are viewable by everyone." on weeks;
drop policy if exists "Days are viewable by everyone." on days;
drop policy if exists "Materials are viewable by everyone." on materials;

-- Create new policies (Authenticated users only)
create policy "Authenticated users can view weeks"
on weeks for select
using ( auth.role() = 'authenticated' );

create policy "Authenticated users can view days"
on days for select
using ( auth.role() = 'authenticated' );

create policy "Authenticated users can view materials"
on materials for select
using ( auth.role() = 'authenticated' );
