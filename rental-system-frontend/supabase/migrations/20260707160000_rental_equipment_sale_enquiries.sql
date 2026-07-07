create table if not exists public.rental_equipment_sale_enquiries (
  id uuid primary key default gen_random_uuid(),
  equipment_id text not null references public.rental_equipment(id) on delete restrict,
  equipment_title_snapshot text not null,
  sale_status_snapshot text not null
    check (sale_status_snapshot in ('available_for_sale', 'sold', 'on_request', 'not_available')),
  sale_price_mode_snapshot text not null
    check (sale_price_mode_snapshot in ('fixed', 'request_quote')),
  sale_price_cents_snapshot integer null
    check (sale_price_cents_snapshot is null or sale_price_cents_snapshot >= 0),
  sale_condition_snapshot text null,
  sale_warranty_snapshot text null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text null,
  company_name text null,
  fulfillment_preference text null
    check (fulfillment_preference is null or fulfillment_preference in ('deliver', 'self_collect')),
  message text null,
  status text not null default 'new'
    check (status in (
      'new',
      'contacted',
      'awaiting_customer',
      'availability_confirmed',
      'quoted',
      'converted',
      'closed_lost',
      'cancelled'
    )),
  admin_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_equipment_sale_enquiries_created_at_idx
  on public.rental_equipment_sale_enquiries (created_at desc);

create index if not exists rental_equipment_sale_enquiries_status_idx
  on public.rental_equipment_sale_enquiries (status);

create index if not exists rental_equipment_sale_enquiries_equipment_id_idx
  on public.rental_equipment_sale_enquiries (equipment_id);
