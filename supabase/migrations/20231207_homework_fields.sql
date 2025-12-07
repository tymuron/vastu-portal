-- Add homework_description to days
alter table public.days 
add column if not exists homework_description text;

-- Add is_homework to materials
alter table public.materials 
add column if not exists is_homework boolean default false;
