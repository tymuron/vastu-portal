-- Template: map the two «Васту для бизнеса» extension Lava offers once they
-- are created in Lava.top.
--
-- How to use:
--   1. Run supabase/migrations/20261120_course_extensions.sql first.
--   2. Replace <EXTEND_1M_LAVA_OFFER> (1 месяц, 3 500 ₽) and
--      <EXTEND_12M_LAVA_OFFER> (1 год, 10 000 ₽) with the real Lava offer UUIDs.
--   3. Run in the Supabase SQL Editor.
--
-- Until these rows exist, no extension buttons appear in the student cabinet.
-- Neither offer grants Telegram support chat (support_chat_months = null).

insert into public.course_offers (
  course_id,
  lava_offer_id,
  access_months,
  access_from,
  support_chat_months,
  extension_label,
  price_rub
)
values
  (
    (select id from public.courses where slug = 'vastu-2'),
    '<EXTEND_1M_LAVA_OFFER>',
    1,
    'extend',
    null,
    '1 месяц',
    3500
  ),
  (
    (select id from public.courses where slug = 'vastu-2'),
    '<EXTEND_12M_LAVA_OFFER>',
    12,
    'extend',
    null,
    '1 год',
    10000
  )
on conflict (course_id, lava_offer_id) do update
  set access_months = excluded.access_months,
      access_from = excluded.access_from,
      support_chat_months = excluded.support_chat_months,
      extension_label = excluded.extension_label,
      price_rub = excluded.price_rub;
