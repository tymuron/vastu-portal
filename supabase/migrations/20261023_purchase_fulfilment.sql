-- Purchase fulfilment for the «Васту-дизайн» stream starting 2026-11-09,
-- and a ledger so no paid buyer can fall through silently.
--
-- 1. course_offers.access_months: per-tier access length (Основной 6 мес,
--    Наставничество 1 год, both counted from courses.starts_at).
-- 2. Two courses: the base course, and the Наставничество bonus course
--    (бизнес-блок + диплом) that only the higher tier also gets — the same
--    shape as vastu-2 / vastu-2-vip.
-- 3. All six lava tariffs of the course, mapped by OFFER id (what /buy and
--    lava_invoices carry) and by PRODUCT id (what a webhook carries).
-- 4. public.purchases: one row per lava contract (or manual grant) — whether
--    access was granted and whether the welcome email went out.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. course_offers.access_months
-- ---------------------------------------------------------------------------

alter table public.course_offers
  add column if not exists access_months integer;

-- ---------------------------------------------------------------------------
-- 2. The new stream
-- ---------------------------------------------------------------------------

insert into public.courses (slug, title, description, order_index, starts_at, access_duration_months)
values
  ('vastu-design-2026', 'Васту-дизайн', 'Флагманский курс Анны Ромео. Поток с 9 ноября 2026.', 10,
   timestamptz '2026-11-09 00:00:00+00', 6),
  ('vastu-design-2026-pro', 'Васту-дизайн · Наставничество', 'Бизнес-блок и дипломный проект — для тарифа «Наставничество».', 11,
   timestamptz '2026-11-09 00:00:00+00', 12)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Lava tariffs (from lava's product list, 2026-10-23). Each product has
--    exactly one offer. Installments are separate ONE_TIME purchases of the
--    same product; the first one unlocks the course.
--
--   tariff                              product                               offer                                 grants
--   Основной 75 000 ₽                   ed760ac8-79d2-4f9e-9255-baeba0bdd1ac  4d14d633-0578-4ce8-8ad6-2d85bc3e0c49  base, 6 mo
--   Основной СПЕЦЦЕНА 55 000 ₽          13b60773-721f-4d05-a8f7-8f68f72472bf  ded0ec37-2888-4336-8e2d-38c49bab7df6  base, 6 mo
--   Основной рассрочка 4 × 18 750 ₽     3453f635-cff3-4b3b-bc00-8a1a6bd01145  51eedd02-887b-4e1b-b5d4-b7342ee4cba7  base, 6 mo
--   Основной рассрочка РАННИЙ 4×14 500  8f936dd1-092c-4d49-8039-f5403b0f51a9  feaec9dc-cd7b-4fd3-95ee-638c633f885f  base, 6 mo
--   Наставничество 175 000 ₽            34229951-b58e-424a-b1d1-d26823fd0373  d6a1aacb-974b-411c-8cee-3d353a44c852  base + pro, 12 mo
--   Наставничество рассрочка 51 500 ₽   c6380628-cdcb-4b1f-9bb2-779e418a2687  df420ef4-68ec-4c80-a712-aaf0f50bda3d  base + pro, 12 mo
-- ---------------------------------------------------------------------------

with t(lava_id, months, pro) as (values
  ('ed760ac8-79d2-4f9e-9255-baeba0bdd1ac', 6, false), ('4d14d633-0578-4ce8-8ad6-2d85bc3e0c49', 6, false),
  ('13b60773-721f-4d05-a8f7-8f68f72472bf', 6, false), ('ded0ec37-2888-4336-8e2d-38c49bab7df6', 6, false),
  ('3453f635-cff3-4b3b-bc00-8a1a6bd01145', 6, false), ('51eedd02-887b-4e1b-b5d4-b7342ee4cba7', 6, false),
  ('8f936dd1-092c-4d49-8039-f5403b0f51a9', 6, false), ('feaec9dc-cd7b-4fd3-95ee-638c633f885f', 6, false),
  ('34229951-b58e-424a-b1d1-d26823fd0373', 12, true), ('d6a1aacb-974b-411c-8cee-3d353a44c852', 12, true),
  ('c6380628-cdcb-4b1f-9bb2-779e418a2687', 12, true), ('df420ef4-68ec-4c80-a712-aaf0f50bda3d', 12, true)
)
insert into public.course_offers (course_id, lava_offer_id, access_months)
select c.id, t.lava_id, t.months
from t
join public.courses c
  on c.slug = 'vastu-design-2026' or (t.pro and c.slug = 'vastu-design-2026-pro')
on conflict (course_id, lava_offer_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Purchase ledger
-- ---------------------------------------------------------------------------

create table if not exists public.purchases (
  contract_id          text primary key,          -- lava contractId, or manual-<id>
  email                text not null,
  lava_ids             text[] not null default '{}', -- ids tried, most specific first
  matched_lava_id      text,
  source               text not null check (source in ('webhook', 'poll', 'manual')),
  status               text not null default 'processing'
                         check (status in ('processing', 'granted', 'unmapped', 'error')),
  user_id              uuid references auth.users(id) on delete set null,
  course_slugs         text[],
  amount               numeric,
  currency             text,
  attempts             integer not null default 0,
  error                text,
  email_sent_at        timestamptz,
  email_id             text,                      -- Resend message id
  email_attempts       integer not null default 0,
  email_error          text,
  email_skipped_reason text,                      -- e.g. installment 2–4: nothing new to announce
  created_at           timestamptz not null default timezone('utc', now()),
  updated_at           timestamptz not null default timezone('utc', now())
);

create index if not exists purchases_created_at_idx on public.purchases(created_at desc);
create index if not exists purchases_pending_idx
  on public.purchases(status) where email_sent_at is null and email_skipped_reason is null;

-- Holds every buyer's email: no anon/authenticated access at all. server.js
-- uses the service_role key, which bypasses RLS (same as lava_invoices).
alter table public.purchases enable row level security;
