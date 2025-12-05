-- Create user_progress table
create table if not exists public.user_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  day_id uuid references public.days(id) on delete cascade not null,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, day_id)
);

-- RLS Policies
alter table public.user_progress enable row level security;

create policy "Users can view their own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.user_progress for update
  using (auth.uid() = user_id);

create policy "Users can delete their own progress"
  on public.user_progress for delete
  using (auth.uid() = user_id);
