create table if not exists public.rental_equipment (
  id text primary key,
  slug text not null unique,
  title text not null,
  category text not null,
  brand text null,
  model text null,
  description text null,
  short_description text null,
  total_units integer not null default 0 check (total_units >= 0),
  maintenance_buffer_days integer not null default 7 check (maintenance_buffer_days >= 0),
  day_rate numeric(12,2) not null default 0 check (day_rate >= 0),
  week_rate numeric(12,2) null check (week_rate is null or week_rate >= 0),
  month_rate numeric(12,2) null check (month_rate is null or month_rate >= 0),
  min_rental_days integer not null default 1 check (min_rental_days >= 1),
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  image_url text null,
  image_urls jsonb not null default '[]'::jsonb,
  catalogue_url text null,
  training_video_url text null,
  key_features jsonb not null default '[]'::jsonb,
  applications jsonb not null default '[]'::jsonb,
  specifications jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  display_order integer not null default 0,
  sale_enabled boolean not null default false,
  sale_status text not null default 'not_available'
    check (sale_status in ('available_for_sale', 'sold', 'on_request', 'not_available')),
  sale_price_cents integer null check (sale_price_cents is null or sale_price_cents >= 0),
  sale_price_mode text not null default 'request_quote'
    check (sale_price_mode in ('fixed', 'request_quote')),
  sale_condition text null,
  sale_warranty text null,
  sale_notes text null,
  sale_fulfillment_modes jsonb null,
  check (not sale_enabled or sale_price_mode <> 'fixed' or sale_price_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_equipment_published_idx
  on public.rental_equipment (is_published, display_order, updated_at desc);

create index if not exists rental_equipment_category_idx
  on public.rental_equipment (category);

create index if not exists rental_equipment_sale_status_idx
  on public.rental_equipment (sale_enabled, sale_status);
