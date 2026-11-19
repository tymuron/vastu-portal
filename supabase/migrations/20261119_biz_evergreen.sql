-- «Васту для бизнеса» evergreen sales (recorded course all year) + 6-month
-- Telegram support chat managed by the portal bot.
--
-- 1. course_offers.access_from: 'course_start' (default, existing behaviour)
--    or 'purchase' (count access_months from the moment of payment).
-- 2. course_offers.support_chat_months: nullable integer; when set on a mapped
--    offer, fulfilment creates a support_chat_access row for that purchase.
-- 3. public.support_chat_access: one row per paid purchase with support chat.
--    Holds emails, Telegram user ids and one-time deep-link join tokens:
--    RLS is enabled with no policies, so only server.js (service_role) can
--    read or write it.
--
-- Does NOT insert offer rows with made-up ids; once real Lava offer ids exist,
-- fill and run supabase/biz-evergreen-offers.template.sql.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Offer-level settings on course_offers
-- ---------------------------------------------------------------------------

alter table public.course_offers
  add column if not exists access_from text not null default 'course_start'
    check (access_from in ('course_start', 'purchase'));

alter table public.course_offers
  add column if not exists support_chat_months integer
    check (support_chat_months is null or support_chat_months > 0);

-- ---------------------------------------------------------------------------
-- 2. Support chat entitlements
-- ---------------------------------------------------------------------------

create table if not exists public.support_chat_access (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  user_id           uuid references auth.users(id) on delete set null,
  contract_id       text not null unique,
  starts_at         timestamptz not null,
  expires_at        timestamptz not null,
  join_token        text not null unique,
  telegram_user_id  bigint,
  invite_link       text,
  invited_at        timestamptz,
  joined_at         timestamptz,
  reminder_sent_at  timestamptz,
  removed_at        timestamptz,
  removed_note      text,
  created_at        timestamptz not null default timezone('utc', now())
);

create index if not exists support_chat_access_expires_at_idx
  on public.support_chat_access(expires_at)
  where removed_at is null;

create index if not exists support_chat_access_email_idx
  on public.support_chat_access(email);

-- Contains buyer emails and join tokens: no anon/authenticated access at all.
-- server.js uses the service_role key, which bypasses RLS (same as purchases).
alter table public.support_chat_access enable row level security;
