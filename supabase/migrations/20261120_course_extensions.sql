-- Paid course access extensions («Продление доступа»).
--
-- 1. Allow course_offers.access_from = 'extend' alongside 'course_start' and
--    'purchase'. An 'extend' offer adds access_months to the later of
--    (payment time, current expires_at if in the future); lifetime stays lifetime.
-- 2. Add nullable display metadata on course_offers for student-cabinet
--    extension buttons: extension_label (e.g. '1 месяц', '1 год') and
--    price_rub (e.g. 3500, 10000).
--
-- Does NOT insert offer rows with made-up ids; once real Lava offer ids exist,
-- fill and run supabase/course-extensions.template.sql.
--
-- Idempotent: safe to re-run.

alter table public.course_offers
  drop constraint if exists course_offers_access_from_check;

alter table public.course_offers
  add constraint course_offers_access_from_check
  check (access_from in ('course_start', 'purchase', 'extend'));

alter table public.course_offers
  add column if not exists extension_label text;

alter table public.course_offers
  add column if not exists price_rub integer
    check (price_rub is null or price_rub > 0);
