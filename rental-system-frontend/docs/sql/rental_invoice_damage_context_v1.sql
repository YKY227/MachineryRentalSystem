alter table if exists rental_invoices
  add column if not exists metadata jsonb not null default '{}'::jsonb;
