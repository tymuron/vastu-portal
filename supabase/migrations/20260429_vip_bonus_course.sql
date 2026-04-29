/*
 * Migration: Multi-course-per-offer support + VIP bonus course
 *
 * The first multi-course migration assumed a one-to-one mapping between
 * a lava.top offer and a course. With VIP / Standard tiers we need a
 * single VIP offer to grant access to TWO courses (base + bonus). This
 * migration drops the UNIQUE constraint on course_offers.lava_offer_id
 * and replaces it with a composite UNIQUE on (course_id, lava_offer_id),
 * so the same lava offer can be attached to multiple courses, but you
 * still can't double-attach the same offer to the same course.
 *
 * Also seeds a "vastu-2-vip" course for the bonus content.
 *
 * Idempotent: safe to re-run. Constraint names guarded with checks.
 */

-- ---------------------------------------------------------------------------
-- 1. Drop the old UNIQUE constraint on lava_offer_id
-- ---------------------------------------------------------------------------

do $$
declare
  cname text;
begin
  -- Find any UNIQUE constraint on course_offers that covers ONLY lava_offer_id
  select tc.constraint_name into cname
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
    and tc.table_schema = ccu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'course_offers'
    and tc.constraint_type = 'UNIQUE'
    and ccu.column_name = 'lava_offer_id'
    and not exists (
      select 1 from information_schema.constraint_column_usage ccu2
      where ccu2.constraint_name = tc.constraint_name
        and ccu2.table_schema = tc.table_schema
        and ccu2.column_name <> 'lava_offer_id'
    )
  limit 1;

  if cname is not null then
    execute format('alter table public.course_offers drop constraint %I', cname);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Add composite UNIQUE (course_id, lava_offer_id)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_offers_course_id_lava_offer_id_key'
      and conrelid = 'public.course_offers'::regclass
  ) then
    alter table public.course_offers
      add constraint course_offers_course_id_lava_offer_id_key
      unique (course_id, lava_offer_id);
  end if;
end $$;

-- Helpful index for the webhook's reverse lookup (offer -> course_ids)
create index if not exists course_offers_lava_offer_id_idx
  on public.course_offers(lava_offer_id);

-- ---------------------------------------------------------------------------
-- 3. Seed VIP bonus course
-- ---------------------------------------------------------------------------

insert into public.courses (slug, title, description, order_index)
values
  ('vastu-2-vip', 'Курс 2: VIP бонусы', 'Дополнительные материалы для VIP-тарифов.', 3)
on conflict (slug) do nothing;
