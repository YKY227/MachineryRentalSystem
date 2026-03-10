create extension if not exists pgcrypto;

create table if not exists public.rental_order_deposits (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.rental_orders(id) on delete cascade,
  customer_id uuid null references public.rental_customers(id) on delete set null,
  required_amount_cents integer not null check (required_amount_cents >= 0),
  held_amount_cents integer not null default 0 check (held_amount_cents >= 0),
  released_amount_cents integer not null default 0 check (released_amount_cents >= 0),
  retained_amount_cents integer not null default 0 check (retained_amount_cents >= 0),
  status text not null check (
    status in (
      'not_required',
      'pending',
      'partially_held',
      'held',
      'partially_released',
      'released',
      'partially_retained',
      'retained'
    )
  ),
  source_invoice_id uuid null references public.rental_invoices(id) on delete set null,
  last_payment_session_id uuid null references public.rental_order_payment_sessions(id) on delete set null,
  last_invoice_payment_id uuid null references public.rental_invoice_payments(id) on delete set null,
  last_collected_at timestamptz null,
  released_at timestamptz null,
  retained_at timestamptz null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_order_deposits_order_unique unique (order_id)
);

create index if not exists rental_order_deposits_customer_idx
  on public.rental_order_deposits (customer_id, created_at desc);

create index if not exists rental_order_deposits_status_idx
  on public.rental_order_deposits (status, updated_at desc);

create table if not exists public.rental_deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references public.rental_order_deposits(id) on delete cascade,
  order_id text not null references public.rental_orders(id) on delete cascade,
  customer_id uuid null references public.rental_customers(id) on delete set null,
  transaction_type text not null check (
    transaction_type in (
      'requirement_created',
      'payment_collected',
      'released',
      'retained',
      'adjustment'
    )
  ),
  amount_cents integer not null check (amount_cents >= 0),
  payment_session_id uuid null references public.rental_order_payment_sessions(id) on delete set null,
  invoice_id uuid null references public.rental_invoices(id) on delete set null,
  invoice_payment_id uuid null references public.rental_invoice_payments(id) on delete set null,
  payment_allocation_id uuid null references public.rental_payment_allocations(id) on delete set null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rental_deposit_transactions_deposit_idx
  on public.rental_deposit_transactions (deposit_id, created_at desc);

create index if not exists rental_deposit_transactions_order_idx
  on public.rental_deposit_transactions (order_id, created_at desc);

create unique index if not exists rental_deposit_transactions_requirement_unique
  on public.rental_deposit_transactions (deposit_id, transaction_type)
  where transaction_type = 'requirement_created';

create unique index if not exists rental_deposit_transactions_payment_session_unique
  on public.rental_deposit_transactions (deposit_id, transaction_type, payment_session_id)
  where payment_session_id is not null and transaction_type = 'payment_collected';
