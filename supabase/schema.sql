-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES (Users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  role text check (role in ('student', 'teacher')) default 'student',
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

-- Drop old policies to ensure clean slate
drop policy if exists "Public profiles are viewable by everyone." on profiles;
drop policy if exists "Users can insert their own profile." on profiles;
drop policy if exists "Users can update own profile." on profiles;
drop policy if exists "Users can view own profile" on profiles;
drop policy if exists "Teachers can view all profiles" on profiles;

-- Create Secure Policies
create policy "Users can view own profile" 
  on profiles for select using ( auth.uid() = id );

create policy "Teachers can view all profiles" 
  on profiles for select using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

create policy "Users can insert their own profile."
  on profiles for insert with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update using ( auth.uid() = id );


-- 2. WEEKS
create table if not exists public.weeks (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  is_locked boolean default false,
  available_from timestamp with time zone,
  order_index integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.weeks enable row level security;

drop policy if exists "Weeks are viewable by everyone." on weeks;
drop policy if exists "Authenticated users can view weeks" on weeks;
drop policy if exists "Teachers can insert weeks." on weeks;
drop policy if exists "Teachers can update weeks." on weeks;
drop policy if exists "Teachers can delete weeks." on weeks;

create policy "Authenticated users can view weeks"
  on weeks for select using ( auth.role() = 'authenticated' );

create policy "Teachers can insert weeks."
  on weeks for insert with check ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

create policy "Teachers can update weeks."
  on weeks for update using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

create policy "Teachers can delete weeks."
  on weeks for delete using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );


-- 3. DAYS (Lessons)
create table if not exists public.days (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references public.weeks(id) on delete cascade not null,
  title text not null,
  description text,
  video_url text,
  order_index integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.days enable row level security;

drop policy if exists "Days are viewable by everyone." on days;
drop policy if exists "Authenticated users can view days" on days;
drop policy if exists "Teachers can edit days." on days;

create policy "Authenticated users can view days"
  on days for select using ( auth.role() = 'authenticated' );

create policy "Teachers can edit days."
  on days for all using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );


-- 4. MATERIALS
create table if not exists public.materials (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references public.weeks(id) on delete cascade,
  day_id uuid references public.days(id) on delete cascade,
  title text not null,
  type text check (type in ('video', 'pdf', 'pptx', 'doc', 'link', 'zip')) not null,
  url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint week_or_day_check check (
    (week_id is not null and day_id is null) or
    (week_id is null and day_id is not null)
  )
);

alter table public.materials enable row level security;

drop policy if exists "Materials are viewable by everyone." on materials;
drop policy if exists "Authenticated users can view materials" on materials;
drop policy if exists "Teachers can edit materials." on materials;

create policy "Authenticated users can view materials"
  on materials for select using ( auth.role() = 'authenticated' );

create policy "Teachers can edit materials."
  on materials for all using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );


-- SEED DATA (Only insert if empty)
insert into public.weeks (title, description, order_index)
select 'Неделя 1. Введение в Васту', 'Погружение в философию и базовые принципы организации пространства.', 1
where not exists (select 1 from public.weeks);

insert into public.weeks (title, description, order_index)
select 'Неделя 2. Зонирование', 'Распределение функциональных зон согласно энергиям.', 2
where not exists (select 1 from public.weeks where title = 'Неделя 2. Зонирование');
-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'student' -- Default role
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function on new user creation
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
