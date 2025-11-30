-- 5. LIVE STREAMS
create table if not exists public.live_streams (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  date timestamp with time zone not null,
  video_url text, -- YouTube/Vimeo link
  audio_url text, -- For downloading
  description text,
  topics text, -- List of topics
  best_questions text, -- "Best questions of the week"
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.live_streams enable row level security;

create policy "Authenticated users can view streams"
  on live_streams for select using ( auth.role() = 'authenticated' );

create policy "Teachers can manage streams"
  on live_streams for all using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

-- 6. STREAM COMMENTS
create table if not exists public.stream_comments (
  id uuid default uuid_generate_v4() primary key,
  stream_id uuid references public.live_streams(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null, -- Link to auth.users directly or profiles
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.stream_comments enable row level security;

create policy "Authenticated users can view comments"
  on stream_comments for select using ( auth.role() = 'authenticated' );

create policy "Users can insert their own comments"
  on stream_comments for insert with check ( auth.uid() = user_id );

-- 7. LIBRARY ITEMS
create table if not exists public.library_items (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  category text check (category in ('checklist', 'table', 'guide', 'pdf')) not null,
  file_url text not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.library_items enable row level security;

create policy "Authenticated users can view library"
  on library_items for select using ( auth.role() = 'authenticated' );

create policy "Teachers can manage library"
  on library_items for all using ( exists ( select 1 from profiles where id = auth.uid() and role = 'teacher' ) );

-- SEED DATA FOR LIBRARY
insert into public.library_items (title, category, file_url, description)
values 
('Проверка входа', 'checklist', '#', 'Чек-лист для анализа входной группы'),
('Диагностика Брахмастана', 'checklist', '#', 'Как проверить центр дома'),
('Оценка спальни', 'checklist', '#', 'Критерии правильной спальни'),
('Диагностика кухни', 'checklist', '#', 'Анализ расположения кухни'),
('8 секторов: мини-памятка', 'checklist', '#', 'Краткое описание всех секторов'),

('Сектор → Элемент → Планета', 'table', '#', 'Сводная таблица соответствий'),
('Таблица “я ↔ дом”', 'table', '#', 'Связь личности и пространства'),
('Таблица желаний', 'table', '#', 'Матрица целей'),

('Как работать с янтрами', 'guide', '#', 'Инструкция по активации янтр'),
('Как делать минимальные коррекции', 'guide', '#', 'Безопасные методы коррекции');

-- SEED DATA FOR STREAMS
insert into public.live_streams (title, date, video_url, description, topics, best_questions)
values
('Эфир 1. Знакомство и основы', now() - interval '7 days', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Первый вводный эфир курса.', '1. Что такое Васту\n2. История науки\n3. Примеры из жизни', 'Как определить север? Можно ли жить в съемной квартире?'),
('Эфир 2. Разбор планировок', now(), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Разбираем домашние задания студентов.', '1. Ошибки в зонировании\n2. Коррекция туалета\n3. Вопросы по кухне', 'Что делать если туалет на севере?');
