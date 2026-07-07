alter table public.rental_equipment
  add column if not exists sale_enabled boolean not null default false,
  add column if not exists sale_status text not null default 'not_available',
  add column if not exists sale_price_cents integer null,
  add column if not exists sale_price_mode text not null default 'request_quote',
  add column if not exists sale_condition text null,
  add column if not exists sale_warranty text null,
  add column if not exists sale_notes text null,
  add column if not exists sale_fulfillment_modes jsonb null;

alter table public.rental_equipment
  drop constraint if exists rental_equipment_sale_status_check,
  add constraint rental_equipment_sale_status_check
    check (sale_status in ('available_for_sale', 'sold', 'on_request', 'not_available'));

alter table public.rental_equipment
  drop constraint if exists rental_equipment_sale_price_mode_check,
  add constraint rental_equipment_sale_price_mode_check
    check (sale_price_mode in ('fixed', 'request_quote'));

alter table public.rental_equipment
  drop constraint if exists rental_equipment_sale_price_cents_check,
  add constraint rental_equipment_sale_price_cents_check
    check (sale_price_cents is null or sale_price_cents >= 0);

alter table public.rental_equipment
  drop constraint if exists rental_equipment_sale_fixed_price_check,
  add constraint rental_equipment_sale_fixed_price_check
    check (not sale_enabled or sale_price_mode <> 'fixed' or sale_price_cents > 0);

create index if not exists rental_equipment_sale_status_idx
  on public.rental_equipment (sale_enabled, sale_status);
