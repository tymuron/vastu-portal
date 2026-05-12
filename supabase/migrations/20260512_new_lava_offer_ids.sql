-- Anna recreated her course offers on Lava on 2026-05-12 with raised prices,
-- which produced new offer UUIDs. The old ones in setup_multi_course.sql
-- are now stale (Lava's storefront uses the new IDs). Add the new mappings
-- so the webhook handler can resolve them. Old rows are kept harmlessly —
-- they'll just never match an incoming webhook again.
--
-- Live offer IDs as of 2026-05-12:
--   Стандарт : caa3c132-dca3-438d-b424-eafff3dd3033 -> grants vastu-2
--   VIP      : 1daaffb0-e3aa-44a9-98f6-5e1a986a79b3 -> grants vastu-2 + vastu-2-vip

insert into public.course_offers (course_id, lava_offer_id) values
  ((select id from public.courses where slug = 'vastu-2'),     'caa3c132-dca3-438d-b424-eafff3dd3033'),
  ((select id from public.courses where slug = 'vastu-2'),     '1daaffb0-e3aa-44a9-98f6-5e1a986a79b3'),
  ((select id from public.courses where slug = 'vastu-2-vip'), '1daaffb0-e3aa-44a9-98f6-5e1a986a79b3')
on conflict (course_id, lava_offer_id) do nothing;

-- Flag new VIP offer as lifetime (mirrors what 20260429_access_expiry.sql
-- did for the old VIP offer IDs).
update public.course_offers
  set is_lifetime = true
  where lava_offer_id = '1daaffb0-e3aa-44a9-98f6-5e1a986a79b3';
