alter table public.rental_customers
  add column if not exists credit_limit numeric(12,2) null,
  add column if not exists credit_control_enabled boolean not null default true,
  add column if not exists credit_hold_reason text null,
  add column if not exists credit_last_reviewed_at timestamptz null,
  add column if not exists credit_last_reviewed_by text null;
