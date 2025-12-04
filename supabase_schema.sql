-- Create live_streams table
create table live_streams (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  date timestamp with time zone not null,
  video_url text,
  audio_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create library_items table
create table library_items (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  category text not null check (category in ('checklist', 'guide')),
  file_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create storage buckets if they don't exist
insert into storage.buckets (id, name)
values ('library', 'library')
on conflict do nothing;

-- Set up RLS (Row Level Security)
alter table live_streams enable row level security;
alter table library_items enable row level security;

-- Create policies
create policy "Public streams are viewable by everyone"
  on live_streams for select
  using ( true );

create policy "Public library items are viewable by everyone"
  on library_items for select
  using ( true );

-- Only authenticated users with role 'teacher' (or admin) can insert/update/delete
-- Note: This assumes you have a way to distinguish roles. For simplicity, we'll allow authenticated users to read.
