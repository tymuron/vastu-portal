-- Template: map the two evergreen «Васту для бизнеса» Lava offers once they
-- are created in Lava.top.
--
-- How to use:
--   1. Run supabase/migrations/20261119_biz_evergreen.sql first.
--   2. Replace <BIZ_SELF_LAVA_OFFER> and <BIZ_SUPPORT_LAVA_OFFER> with the
--      real Lava offer UUIDs (and, if Lava webhooks carry distinct product
--      UUIDs without a lava_invoices row, add matching rows for those too).
--   3. Run in the Supabase SQL Editor.
--
-- Both offers grant «Васту для бизнеса» (vastu-2) for 6 months from the
-- purchase date. Only «С поддержкой» grants 6 months of Telegram support chat.

insert into public.course_offers (course_id, lava_offer_id, access_months, access_from, support_chat_months)
values
  (
    (select id from public.courses where slug = 'vastu-2'),
    '<BIZ_SELF_LAVA_OFFER>',
    6,
    'purchase',
    null
  ),
  (
    (select id from public.courses where slug = 'vastu-2'),
    '<BIZ_SUPPORT_LAVA_OFFER>',
    6,
    'purchase',
    6
  )
on conflict (course_id, lava_offer_id) do update
  set access_months = excluded.access_months,
      access_from = excluded.access_from,
      support_chat_months = excluded.support_chat_months;
