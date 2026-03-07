create table if not exists public.rental_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.rental_invoices(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  paid_at timestamptz not null default now(),
  method text null,
  reference text null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists rental_invoice_payments_invoice_paid_at_idx
  on public.rental_invoice_payments (invoice_id, paid_at desc);
