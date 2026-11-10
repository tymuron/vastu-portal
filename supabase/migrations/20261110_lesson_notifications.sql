-- New-lesson notifications (lessonNotify.js): one email per lesson per
-- student, and one Telegram post per lesson. Only server.js writes here, with
-- the service_role key.
--
-- lesson_announcements: one row per lesson the notifier has seen open and
--   filled in. 'settling' waits until the lesson has stayed unchanged for a
--   while (fingerprint + ready_at), 'sending' has fixed the audience, 'sent'
--   is final: later edits of the lesson never send again.
-- lesson_notifications: one row per lesson per student — the audience fixed
--   when the lesson was announced, and whether that student's email went out.
--
-- Idempotent: safe to re-run.

create table if not exists public.lesson_announcements (
  day_id         uuid primary key references public.days(id) on delete cascade,
  course_id      uuid references public.courses(id) on delete cascade,
  status         text not null default 'settling'
                   check (status in ('settling', 'sending', 'sent', 'skipped')),
  fingerprint    text,
  ready_at       timestamptz not null default timezone('utc', now()),
  announced_at   timestamptz,
  finished_at    timestamptz,
  recipients     integer,
  tg_status      text check (tg_status in ('off', 'posting', 'posted', 'failed')),
  tg_chat        text,
  tg_message_id  bigint,
  tg_attempts    integer not null default 0,
  tg_error       text,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now())
);

create table if not exists public.lesson_notifications (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid not null references public.days(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  status      text not null default 'pending'
                check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts    integer not null default 0,
  email_id    text,                       -- Resend message id
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  unique (day_id, user_id)
);

create index if not exists lesson_notifications_open_idx
  on public.lesson_notifications(status) where status <> 'sent';

-- Holds students' emails: no anon/authenticated access at all (same as
-- purchases). server.js uses the service_role key, which bypasses RLS.
alter table public.lesson_announcements enable row level security;
alter table public.lesson_notifications enable row level security;
