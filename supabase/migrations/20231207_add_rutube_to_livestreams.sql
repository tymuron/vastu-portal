-- Add rutube_url to live_streams
alter table public.live_streams 
add column if not exists rutube_url text;
