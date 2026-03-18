create extension if not exists pgcrypto;

alter table public.rental_orders
  add column if not exists maintenance_buffer_days_applied integer null
    check (maintenance_buffer_days_applied is null or maintenance_buffer_days_applied >= 0);

create table if not exists public.rental_order_buffer_overrides (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.rental_orders(id) on delete cascade,
  order_unit_index integer not null check (order_unit_index >= 0),
  override_buffer_end_date date not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  reason text null,
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists rental_order_buffer_overrides_order_idx
  on public.rental_order_buffer_overrides (order_id, status, order_unit_index);

create unique index if not exists rental_order_buffer_overrides_active_unit_idx
  on public.rental_order_buffer_overrides (order_id, order_unit_index)
  where status = 'active';

create or replace function public.acquire_rental_availability_hold(
  p_checkout_reference text,
  p_equipment_id text,
  p_customer_id uuid,
  p_qty integer,
  p_rental_start date,
  p_rental_end date,
  p_expires_at timestamptz,
  p_total_units integer,
  p_maintenance_buffer_days integer default 7
) returns public.rental_availability_holds
language plpgsql
as $$
declare
  v_existing public.rental_availability_holds%rowtype;
  v_committed_qty integer := 0;
  v_held_qty integer := 0;
  v_downtime_qty integer := 0;
  v_available_qty integer := 0;
  v_buffer_days integer := greatest(coalesce(p_maintenance_buffer_days, 0), 0);
begin
  if coalesce(trim(p_checkout_reference), '') = '' then
    raise exception 'checkout_reference is required';
  end if;

  if coalesce(trim(p_equipment_id), '') = '' then
    raise exception 'equipment_id is required';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be greater than 0';
  end if;

  if p_total_units is null or p_total_units < 0 then
    raise exception 'total_units must be zero or greater';
  end if;

  if p_rental_start is null or p_rental_end is null or p_rental_end < p_rental_start then
    raise exception 'invalid rental date range';
  end if;

  if p_expires_at is null then
    raise exception 'expires_at is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('rental_availability:' || p_equipment_id));

  select *
  into v_existing
  from public.rental_availability_holds h
  where h.checkout_reference = p_checkout_reference
    and h.equipment_id = p_equipment_id
    and h.rental_start = p_rental_start
    and h.rental_end = p_rental_end
    and h.status = 'active'
    and h.expires_at > now()
  order by h.created_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  select coalesce(count(*), 0)
  into v_committed_qty
  from public.rental_orders o
  join lateral generate_series(0, greatest(coalesce(o.qty, 0) - 1, 0)) as unit_idx(i) on true
  left join lateral (
    select bo.override_buffer_end_date
    from public.rental_order_buffer_overrides bo
    where bo.order_id = o.id
      and bo.order_unit_index = unit_idx.i
      and bo.status = 'active'
    order by bo.created_at desc
    limit 1
  ) bo on true
  where o.equipment_id = p_equipment_id
    and o.start_date <= p_rental_end
    and p_rental_start <= greatest(
      o.end_date,
      coalesce(
        bo.override_buffer_end_date,
        o.end_date + coalesce(o.maintenance_buffer_days_applied, v_buffer_days)
      )
    )
    and exists (
      select 1
      from public.rental_invoices i
      where i.order_id = o.id
        and i.status <> 'void'
    );

  select coalesce(sum(h.qty), 0)
  into v_held_qty
  from public.rental_availability_holds h
  where h.equipment_id = p_equipment_id
    and h.status = 'active'
    and h.expires_at > now()
    and h.rental_start <= p_rental_end
    and p_rental_start <= h.rental_end
    and h.checkout_reference <> p_checkout_reference
    and not exists (
      select 1
      from public.rental_invoices i
      where i.order_id = coalesce(h.order_id, h.checkout_reference)
        and i.status <> 'void'
    );

  select coalesce(sum(d.quantity_affected), 0)
  into v_downtime_qty
  from public.rental_equipment_downtime d
  where d.equipment_id = p_equipment_id
    and d.status = 'active'
    and d.start_date <= p_rental_end
    and p_rental_start <= d.end_date;

  v_available_qty := greatest(p_total_units - v_committed_qty - v_held_qty - v_downtime_qty, 0);

  if v_available_qty < p_qty then
    raise exception using
      errcode = 'P0001',
      message = 'INSUFFICIENT_AVAILABILITY',
      detail = json_build_object(
        'availableQty', v_available_qty,
        'requestedQty', p_qty,
        'committedQty', v_committed_qty,
        'heldQty', v_held_qty,
        'downtimeQty', v_downtime_qty,
        'totalUnits', p_total_units
      )::text;
  end if;

  insert into public.rental_availability_holds (
    checkout_reference,
    equipment_id,
    customer_id,
    qty,
    rental_start,
    rental_end,
    status,
    expires_at
  )
  values (
    p_checkout_reference,
    p_equipment_id,
    p_customer_id,
    p_qty,
    p_rental_start,
    p_rental_end,
    'active',
    p_expires_at
  )
  returning *
  into v_existing;

  return v_existing;
end;
$$;
