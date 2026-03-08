create table if not exists public.rental_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  allocation_type text not null,
  target_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists rental_payment_allocations_source_target_unique
  on public.rental_payment_allocations (source_type, source_id, allocation_type, target_id);

create index if not exists rental_payment_allocations_source_idx
  on public.rental_payment_allocations (source_type, source_id, created_at desc);

create index if not exists rental_payment_allocations_target_idx
  on public.rental_payment_allocations (allocation_type, target_id, created_at desc);
