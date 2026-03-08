drop index if exists public.rental_customers_member_code_idx;

alter table public.rental_customers
  drop column if exists member_code,
  drop column if exists credit_status;
