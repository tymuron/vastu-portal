-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES (Users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  role text check (role in ('student', 'teacher')) default 'student',
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies for Profiles
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- 2. WEEKS
create table public.weeks (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  is_locked boolean default false,
  available_from timestamp with time zone,
  order_index integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.weeks enable row level security;

-- Everyone can read weeks (logic for locking is in frontend or edge function, but for now simple read)
create policy "Weeks are viewable by everyone."
  on weeks for select
  using ( true );

-- Only teachers can edit weeks
create policy "Teachers can insert weeks."
  on weeks for insert
  with check ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

create policy "Teachers can update weeks."
  on weeks for update
  using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

create policy "Teachers can delete weeks."
  on weeks for delete
  using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

-- 3. DAYS (Lessons)
create table public.days (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references public.weeks(id) on delete cascade not null,
  title text not null,
  description text,
  video_url text,
  order_index integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.days enable row level security;

create policy "Days are viewable by everyone."
  on days for select
  using ( true );

create policy "Teachers can edit days."
  on days for all
  using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

-- 4. MATERIALS
create table public.materials (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references public.weeks(id) on delete cascade, -- Can belong to a week
  day_id uuid references public.days(id) on delete cascade,   -- OR belong to a day
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

create policy "Materials are viewable by everyone."
  on materials for select
  using ( true );

create policy "Teachers can edit materials."
  on materials for all
  using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

-- 5. STORAGE BUCKETS
-- Note: You usually create buckets in the dashboard, but here is the policy logic
-- Bucket name: 'course-content'

-- Policy: Public Read
-- Policy: Teachers Upload

-- SEED DATA (Optional - to have something to start with)
insert into public.weeks (title, description, order_index)
values 
('Неделя 1. Введение в Васту', 'Погружение в философию и базовые принципы организации пространства.', 1),
('Неделя 2. Зонирование', 'Распределение функциональных зон согласно энергиям.', 2);
