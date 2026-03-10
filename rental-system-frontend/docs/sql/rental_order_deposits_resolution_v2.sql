alter table public.rental_order_deposits
  add column if not exists resolved_at timestamptz null,
  add column if not exists last_resolution_type text null check (
    last_resolution_type in ('release', 'retain', 'split')
  ),
  add column if not exists last_resolution_note text null,
  add column if not exists last_resolution_recorded_by text null,
  add column if not exists last_resolution_reference text null;

alter table public.rental_deposit_transactions
  add column if not exists recorded_by text null,
  add column if not exists external_reference text null;

create index if not exists rental_deposit_transactions_external_reference_idx
  on public.rental_deposit_transactions (external_reference)
  where external_reference is not null;
