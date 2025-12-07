-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create live_streams table
create table if not exists live_streams (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  date timestamp with time zone not null,
  video_url text,
  rutube_url text,
  audio_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create days table (for lessons)
create table if not exists days (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references weeks(id),
  title text not null,
  description text,
  video_url text,
  rutube_url text,
  date timestamp with time zone,
  order_index integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create library_items table
create table if not exists library_items (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  category text not null check (category in ('checklist', 'guide')),
  file_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create storage buckets if they don't exist
-- Create storage buckets if they don't exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('library', 'library', false, 52428800, null), -- 50MB
  ('avatars', 'avatars', true, 5242880, ARRAY['image/*']), -- 5MB
  ('course-content', 'course-content', true, null, null) -- Unlimited
on conflict (id) do update set 
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Force update course-content limit just in case
update storage.buckets
set file_size_limit = null -- Unlimited
where id = 'course-content';

-- Set up RLS (Row Level Security)
alter table live_streams enable row level security;
alter table library_items enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "Public streams are viewable by everyone" on live_streams;
drop policy if exists "Public library items are viewable by everyone" on library_items;
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Anyone can upload an avatar" on storage.objects;
drop policy if exists "Course content is publicly accessible" on storage.objects;
drop policy if exists "Anyone can upload course content" on storage.objects;
drop policy if exists "Anyone can update course content" on storage.objects;
drop policy if exists "Anyone can delete course content" on storage.objects;

-- Create policies
create policy "Public streams are viewable by everyone"
  on live_streams for select
  using ( true );

create policy "Public library items are viewable by everyone"
  on library_items for select
  using ( true );

-- Storage Policies
-- Avatars
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Anyone can upload an avatar"
  on storage.objects for insert
  with check ( bucket_id = 'avatars' );

-- Course Content
create policy "Course content is publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'course-content' );

create policy "Anyone can upload course content"
  on storage.objects for insert
  with check ( bucket_id = 'course-content' );

create policy "Anyone can update course content"
  on storage.objects for update
  using ( bucket_id = 'course-content' );

create policy "Anyone can delete course content"
  on storage.objects for delete
  using ( bucket_id = 'course-content' );

-- Create weeks table
create table if not exists weeks (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  available_from timestamp with time zone,
  order_index integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create materials table
create table if not exists materials (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references weeks(id),
  day_id uuid references days(id),
  title text not null,
  type text not null,
  url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add rutube_url to days if it doesn't exist (safe migration)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'days' and column_name = 'rutube_url') then
    alter table days add column rutube_url text;
  end if;
end $$;

-- Enable RLS for all tables
alter table weeks enable row level security;
alter table days enable row level security;
alter table materials enable row level security;

-- Drop permissive policies if they exist (to avoid errors on re-run)
drop policy if exists "Enable read access for all users" on weeks;
drop policy if exists "Enable insert for all users" on weeks;
drop policy if exists "Enable update for all users" on weeks;
drop policy if exists "Enable delete for all users" on weeks;

drop policy if exists "Enable read access for all users" on days;
drop policy if exists "Enable insert for all users" on days;
drop policy if exists "Enable update for all users" on days;
drop policy if exists "Enable delete for all users" on days;

drop policy if exists "Enable read access for all users" on materials;
drop policy if exists "Enable insert for all users" on materials;
drop policy if exists "Enable update for all users" on materials;
drop policy if exists "Enable delete for all users" on materials;

drop policy if exists "Enable insert for all users" on live_streams;
drop policy if exists "Enable update for all users" on live_streams;
drop policy if exists "Enable delete for all users" on live_streams;

-- Create permissive policies for development (Teacher App)
-- In production, you should restrict write access to 'authenticated' users with 'teacher' role
create policy "Enable read access for all users" on weeks for select using (true);
create policy "Enable insert for all users" on weeks for insert with check (true);
create policy "Enable update for all users" on weeks for update using (true);
create policy "Enable delete for all users" on weeks for delete using (true);

create policy "Enable read access for all users" on days for select using (true);
create policy "Enable insert for all users" on days for insert with check (true);
create policy "Enable update for all users" on days for update using (true);
create policy "Enable delete for all users" on days for delete using (true);

create policy "Enable read access for all users" on materials for select using (true);
create policy "Enable insert for all users" on materials for insert with check (true);
create policy "Enable update for all users" on materials for update using (true);
create policy "Enable delete for all users" on materials for delete using (true);

-- Update live_streams policies to allow editing
create policy "Enable insert for all users" on live_streams for insert with check (true);
create policy "Enable update for all users" on live_streams for update using (true);
create policy "Enable delete for all users" on live_streams for delete using (true);

-- Create user_progress table
create table if not exists public.user_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  day_id uuid references days(id) on delete cascade not null,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, day_id)
);

-- RLS Policies for user_progress
alter table public.user_progress enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can view their own progress" on public.user_progress;
drop policy if exists "Users can insert their own progress" on public.user_progress;
drop policy if exists "Users can update their own progress" on public.user_progress;
drop policy if exists "Users can delete their own progress" on public.user_progress;

create policy "Users can view their own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own progress"
  on public.user_progress for delete
  using (auth.uid() = user_id);
-- Add homework_description to days
alter table public.days 
add column if not exists homework_description text;

-- Add is_homework to materials
alter table public.materials 
add column if not exists is_homework boolean default false;
