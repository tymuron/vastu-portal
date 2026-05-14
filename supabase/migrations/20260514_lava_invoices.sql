-- Track invoices we generate via /api/lava/invoice so the webhook handler
-- can resolve a payment back to the OFFER the customer bought.
--
-- Lava's webhook payload only includes `product.id` — not `offer.id` — so
-- we can't distinguish Стандарт from VIP under the same product just from
-- what Lava sends. We stash the mapping at invoice-creation time (when we
-- still know the offerId the buyer picked) and look it up by contractId
-- when the webhook lands.

create table if not exists public.lava_invoices (
  contract_id text primary key,
  offer_id    text not null,
  email       text,
  created_at  timestamptz default timezone('utc', now()) not null
);

create index if not exists lava_invoices_offer_id_idx
  on public.lava_invoices(offer_id);
