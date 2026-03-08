create table if not exists public.rental_customers (
  id uuid primary key default gen_random_uuid(),
  member_code text null,
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text null,
  payment_terms text not null default 'upfront' check (payment_terms in ('upfront', 'credit')),
  credit_status text not null default 'not_vetted' check (credit_status in ('not_vetted', 'pre_vetted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rental_customers
  add column if not exists uen text null,
  add column if not exists address text null,
  add column if not exists vetting_status text not null default 'new' check (vetting_status in ('new', 'under_review', 'pre_vetted', 'rejected')),
  add column if not exists account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  add column if not exists internal_notes text null,
  add column if not exists auth_user_id uuid null;

update public.rental_customers
set vetting_status = case
  when credit_status = 'pre_vetted' then 'pre_vetted'
  else 'new'
end
where vetting_status is null or vetting_status = 'new';

create unique index if not exists rental_customers_member_code_idx
  on public.rental_customers (member_code)
  where member_code is not null;

create index if not exists rental_customers_email_idx
  on public.rental_customers (lower(email));

create unique index if not exists rental_customers_auth_user_id_idx
  on public.rental_customers (auth_user_id)
  where auth_user_id is not null;

alter table public.rental_orders
  add column if not exists customer_id uuid null references public.rental_customers(id) on delete set null;

create index if not exists rental_orders_customer_id_idx
  on public.rental_orders (customer_id);
