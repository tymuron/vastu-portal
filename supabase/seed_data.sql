-- SEED DATA FOR VASTU PORTAL

-- 1. Live Streams
insert into public.live_streams (title, date, video_url, description, topics, best_questions)
values
(
  'Введение в Васту. Разбор участков',
  NOW() - interval '2 days',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', -- Placeholder
  'Первый вводный эфир. Обсуждаем базовые принципы Васту и разбираем первые участки студентов.',
  '1. Что такое Васту Пуруша?
2. Как определить стороны света?
3. Влияние уклона участка.',
  'Как быть, если вход с юга?
Что делать с туалетом на севере?'
),
(
  'Кухня и Элемент Огня',
  NOW() - interval '9 days',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'Глубокое погружение в тему кухни. Почему огонь так важен и как его гармонизировать.',
  '1. Расположение плиты.
2. Цветовая гамма кухни.
3. Конфликт воды и огня.',
  'Можно ли ставить плиту под окном?
Какого цвета выбрать столешницу?'
),
(
  'Спальня и отношения',
  NOW() - interval '16 days',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'Все о главной спальне. Как гармонизировать отношения через пространство.',
  '1. Юго-Западный сектор.
2. Положение кровати.
3. Зеркала в спальне.',
  'Где спать детям?
Можно ли спать головой на север?'
);

-- 2. Library Items

-- Checklists
insert into public.library_items (title, category, file_url, description)
values
(
  'Чек-лист: Анализ участка',
  'checklist',
  'https://example.com/checklist.pdf',
  'Пошаговый план оценки участка перед покупкой или строительством.'
),
(
  'Чек-лист: Входная дверь',
  'checklist',
  'https://example.com/door.pdf',
  'Критерии правильной входной двери и методы коррекции.'
);

-- Tables
insert into public.library_items (title, category, file_url, description)
values
(
  'Таблица: 5 Элементов',
  'table',
  'https://example.com/elements.pdf',
  'Сводная таблица атрибутов первоэлементов: цвета, формы, материалы.'
),
(
  'Таблица: Совместимость супругов',
  'table',
  'https://example.com/compatibility.pdf',
  'Расчет совместимости по направлениям Васту.'
);

-- Guides
insert into public.library_items (title, category, file_url, description)
values
(
  'Гайд: Цветовые решения',
  'guide',
  'https://example.com/colors.pdf',
  'Полное руководство по подбору цветов для каждого сектора дома.'
),
(
  'Гайд: Коррекции без разрушения',
  'guide',
  'https://example.com/corrections.pdf',
  'Методы коррекции недостатков без капитального ремонта.'
);

-- PDFs
insert into public.library_items (title, category, file_url, description)
values
(
  'Презентация: Урок 1',
  'pdf',
  'https://example.com/lesson1.pdf',
  'Слайды к первому уроку курса.'
),
(
  'Презентация: Урок 2',
  'pdf',
  'https://example.com/lesson2.pdf',
  'Слайды ко второму уроку курса.'
);
