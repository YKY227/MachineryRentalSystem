create extension if not exists pgcrypto;

create table if not exists public.rental_order_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.rental_orders(id) on delete cascade,
  provider text not null,
  provider_payment_request_id text null,
  provider_reference_number text null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'SGD',
  status text not null check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  payment_purpose text null,
  redirect_url text null,
  webhook_payload jsonb null,
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_order_payment_sessions_order_id_idx
  on public.rental_order_payment_sessions(order_id, created_at desc);

create unique index if not exists rental_order_payment_sessions_provider_request_idx
  on public.rental_order_payment_sessions(provider, provider_payment_request_id)
  where provider_payment_request_id is not null;
