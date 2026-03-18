create extension if not exists pgcrypto;

create table if not exists public.rental_order_extensions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  customer_id text not null,
  current_rental_end date not null,
  requested_rental_end date not null,
  status text not null
    check (
      status in (
        'availability_blocked',
        'awaiting_admin_review',
        'rejected',
        'approved_pending_payment',
        'approved_confirmed',
        'cancelled'
      )
    ),
  extension_charge_estimate_cents integer not null default 0 check (extension_charge_estimate_cents >= 0),
  final_extension_charge_cents integer null check (final_extension_charge_cents is null or final_extension_charge_cents >= 0),
  payment_terms_snapshot text not null
    check (payment_terms_snapshot in ('upfront', 'credit')),
  availability_status text not null default 'unknown'
    check (availability_status in ('unknown', 'available', 'blocked')),
  availability_message text null,
  customer_message text null,
  review_note text null,
  payment_session_id text null,
  invoice_id text null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  confirmed_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_order_extensions_order_idx
  on public.rental_order_extensions (order_id, created_at desc);

create index if not exists rental_order_extensions_customer_idx
  on public.rental_order_extensions (customer_id, created_at desc);

create index if not exists rental_order_extensions_status_idx
  on public.rental_order_extensions (status, created_at desc);

create unique index if not exists rental_order_extensions_open_request_unique
  on public.rental_order_extensions (order_id)
  where status in ('availability_blocked', 'awaiting_admin_review', 'approved_pending_payment');
