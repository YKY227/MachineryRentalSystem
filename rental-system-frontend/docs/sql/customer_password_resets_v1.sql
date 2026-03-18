create table if not exists customer_password_resets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references rental_customers(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists customer_password_resets_token_hash_key
  on customer_password_resets (token_hash);

create index if not exists customer_password_resets_customer_created_idx
  on customer_password_resets (customer_id, created_at desc);

create index if not exists customer_password_resets_active_idx
  on customer_password_resets (customer_id, expires_at)
  where used_at is null;
