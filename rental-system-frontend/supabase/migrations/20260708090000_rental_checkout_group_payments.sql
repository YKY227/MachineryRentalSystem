create extension if not exists pgcrypto;

create table if not exists public.rental_checkout_group_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  checkout_group_id uuid not null references public.rental_checkout_groups(id) on delete cascade,
  provider text not null default 'hitpay',
  provider_payment_request_id text null,
  provider_reference_number text null,
  redirect_url text null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'SGD',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled', 'manual_review')),
  paid_at timestamptz null,
  failed_at timestamptz null,
  expired_at timestamptz null,
  converted_at timestamptz null,
  manual_review_reason text null,
  provider_payload jsonb not null default '{}'::jsonb,
  webhook_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rental_checkout_group_payment_sessions_provider_request_idx
  on public.rental_checkout_group_payment_sessions (provider, provider_payment_request_id)
  where provider_payment_request_id is not null;

create unique index if not exists rental_checkout_group_payment_sessions_pending_idx
  on public.rental_checkout_group_payment_sessions (checkout_group_id, provider, currency)
  where status = 'pending';

create index if not exists rental_checkout_group_payment_sessions_group_created_idx
  on public.rental_checkout_group_payment_sessions (checkout_group_id, created_at desc);

create index if not exists rental_checkout_group_payment_sessions_status_created_idx
  on public.rental_checkout_group_payment_sessions (status, created_at desc);

alter table public.rental_checkout_groups
  drop constraint if exists rental_checkout_groups_status_check;

alter table public.rental_checkout_groups
  add constraint rental_checkout_groups_status_check
  check (status in (
    'draft',
    'validating',
    'holds_acquired',
    'payment_pending',
    'converting',
    'paid',
    'expired',
    'cancelled',
    'failed',
    'manual_review'
  ));

alter table public.rental_checkout_groups
  add column if not exists payment_session_id uuid null references public.rental_checkout_group_payment_sessions(id) on delete set null,
  add column if not exists paid_at timestamptz null,
  add column if not exists converted_at timestamptz null,
  add column if not exists child_order_ids jsonb not null default '[]'::jsonb;

alter table public.rental_checkout_group_lines
  drop constraint if exists rental_checkout_group_lines_status_check;

alter table public.rental_checkout_group_lines
  add constraint rental_checkout_group_lines_status_check
  check (status in (
    'pending',
    'hold_acquired',
    'order_created',
    'invoice_created',
    'paid',
    'failed',
    'released',
    'cancelled'
  ));

alter table public.rental_checkout_group_lines
  add column if not exists rental_order_id text null references public.rental_orders(id) on delete set null,
  add column if not exists invoice_id uuid null references public.rental_invoices(id) on delete set null,
  add column if not exists invoice_payment_id uuid null references public.rental_invoice_payments(id) on delete set null;

create index if not exists rental_checkout_group_lines_order_idx
  on public.rental_checkout_group_lines (rental_order_id);

alter table public.rental_orders
  add column if not exists checkout_group_id uuid null references public.rental_checkout_groups(id) on delete set null,
  add column if not exists checkout_group_line_id uuid null references public.rental_checkout_group_lines(id) on delete set null;

create index if not exists rental_orders_checkout_group_idx
  on public.rental_orders (checkout_group_id, created_at desc);

create index if not exists rental_orders_checkout_group_line_idx
  on public.rental_orders (checkout_group_line_id);

alter table public.rental_invoice_payments
  add column if not exists source_checkout_group_payment_session_id uuid null references public.rental_checkout_group_payment_sessions(id) on delete set null;

create unique index if not exists rental_invoice_payments_group_session_invoice_idx
  on public.rental_invoice_payments (source_checkout_group_payment_session_id, invoice_id)
  where source_checkout_group_payment_session_id is not null;

alter table public.rental_order_deposits
  add column if not exists last_checkout_group_payment_session_id uuid null references public.rental_checkout_group_payment_sessions(id) on delete set null;

alter table public.rental_deposit_transactions
  add column if not exists source_checkout_group_payment_session_id uuid null references public.rental_checkout_group_payment_sessions(id) on delete set null;

create unique index if not exists rental_deposit_transactions_group_session_unique
  on public.rental_deposit_transactions (deposit_id, transaction_type, source_checkout_group_payment_session_id)
  where transaction_type = 'payment_collected'
    and source_checkout_group_payment_session_id is not null;

create table if not exists public.rental_checkout_group_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  checkout_group_payment_session_id uuid not null references public.rental_checkout_group_payment_sessions(id) on delete cascade,
  checkout_group_id uuid not null references public.rental_checkout_groups(id) on delete cascade,
  checkout_group_line_id uuid not null references public.rental_checkout_group_lines(id) on delete cascade,
  rental_order_id text not null references public.rental_orders(id) on delete cascade,
  invoice_id uuid not null references public.rental_invoices(id) on delete cascade,
  invoice_payment_id uuid null references public.rental_invoice_payments(id) on delete set null,
  invoice_amount_cents integer not null check (invoice_amount_cents >= 0),
  deposit_amount_cents integer not null check (deposit_amount_cents >= 0),
  total_allocated_cents integer not null check (total_allocated_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_checkout_group_payment_allocations_line_unique
    unique (checkout_group_payment_session_id, checkout_group_line_id)
);

create index if not exists rental_checkout_group_payment_allocations_group_idx
  on public.rental_checkout_group_payment_allocations (checkout_group_id, created_at desc);
