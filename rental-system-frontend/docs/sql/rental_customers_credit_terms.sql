create table if not exists public.rental_customers (
  id uuid primary key default gen_random_uuid(),
  member_code text not null unique,
  company_name text not null,
  contact_name text null,
  email text not null,
  phone text null,
  payment_terms text not null default 'upfront' check (payment_terms in ('upfront', 'credit')),
  credit_status text not null default 'not_vetted' check (credit_status in ('not_vetted', 'pre_vetted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_customers_email_idx
  on public.rental_customers (lower(email));

alter table public.rental_orders
  add column if not exists customer_snapshot jsonb null;
