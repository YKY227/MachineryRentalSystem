-- rental_orders table (MVP)
create table if not exists public.rental_orders (
  id text primary key,
  equipment_id text not null,
  equipment_title text not null,
  qty integer not null check (qty > 0),
  start_date date not null,
  end_date date not null,
  fulfillment text not null check (fulfillment in ('deliver', 'self_collect')),
  pricing_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rental_orders_created_at_desc
  on public.rental_orders (created_at desc);

create index if not exists idx_rental_orders_equipment_id
  on public.rental_orders (equipment_id);
