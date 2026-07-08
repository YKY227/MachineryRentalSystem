create extension if not exists pgcrypto;

create table if not exists public.rental_checkout_groups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.rental_customers(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text null,
  company_name text null,
  status text not null default 'draft'
    check (status in ('draft', 'validating', 'holds_acquired', 'payment_pending', 'converting', 'paid', 'expired', 'cancelled', 'failed', 'manual_review')),
  currency text not null default 'SGD',
  rental_subtotal_cents integer not null default 0 check (rental_subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  collection_fee_cents integer not null default 0 check (collection_fee_cents >= 0),
  gst_cents integer not null default 0 check (gst_cents >= 0),
  deposit_cents integer not null default 0 check (deposit_cents >= 0),
  payable_total_cents integer not null default 0 check (payable_total_cents >= 0),
  display_total_cents integer not null default 0 check (display_total_cents >= 0),
  hold_expires_at timestamptz null,
  failure_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rental_checkout_group_lines (
  id uuid primary key default gen_random_uuid(),
  checkout_group_id uuid not null references public.rental_checkout_groups(id) on delete cascade,
  line_index integer not null check (line_index >= 0),
  cart_line_id_snapshot text null,
  equipment_id text not null references public.rental_equipment(id) on delete restrict,
  equipment_title_snapshot text not null,
  equipment_image_url_snapshot text null,
  qty integer not null check (qty > 0),
  start_date date not null,
  end_date date not null,
  fulfillment text not null check (fulfillment in ('deliver', 'self_collect')),
  delivery_address text null,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  rental_subtotal_cents integer not null default 0 check (rental_subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  collection_fee_cents integer not null default 0 check (collection_fee_cents >= 0),
  gst_cents integer not null default 0 check (gst_cents >= 0),
  deposit_cents integer not null default 0 check (deposit_cents >= 0),
  payable_total_cents integer not null default 0 check (payable_total_cents >= 0),
  display_total_cents integer not null default 0 check (display_total_cents >= 0),
  hold_id uuid null,
  status text not null default 'pending'
    check (status in ('pending', 'hold_acquired', 'failed', 'released', 'cancelled')),
  failure_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_checkout_group_lines_dates_check check (end_date >= start_date),
  constraint rental_checkout_group_lines_group_index_unique unique (checkout_group_id, line_index)
);

alter table public.rental_availability_holds
  add column if not exists checkout_group_id uuid null references public.rental_checkout_groups(id) on delete set null,
  add column if not exists checkout_group_line_id uuid null references public.rental_checkout_group_lines(id) on delete set null;

create index if not exists rental_checkout_groups_status_created_idx
  on public.rental_checkout_groups (status, created_at desc);

create index if not exists rental_checkout_groups_customer_created_idx
  on public.rental_checkout_groups (customer_id, created_at desc);

create index if not exists rental_checkout_group_lines_group_idx
  on public.rental_checkout_group_lines (checkout_group_id, line_index);

create index if not exists rental_checkout_group_lines_equipment_dates_idx
  on public.rental_checkout_group_lines (equipment_id, start_date, end_date);

create index if not exists rental_checkout_group_lines_hold_idx
  on public.rental_checkout_group_lines (hold_id);

create index if not exists rental_availability_holds_checkout_group_idx
  on public.rental_availability_holds (checkout_group_id, status, expires_at);

create unique index if not exists rental_availability_holds_active_group_line_unique
  on public.rental_availability_holds (checkout_group_line_id)
  where status = 'active' and checkout_group_line_id is not null;

create or replace function public.acquire_rental_checkout_group_holds(
  p_checkout_group_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_group public.rental_checkout_groups%rowtype;
  v_line record;
  v_lock record;
  v_equipment record;
  v_existing_count integer := 0;
  v_line_count integer := 0;
  v_committed_qty integer := 0;
  v_held_qty integer := 0;
  v_downtime_qty integer := 0;
  v_available_qty integer := 0;
  v_group_requested_qty integer := 0;
  v_peak_date date;
  v_errors jsonb := '[]'::jsonb;
  v_hold_id uuid;
  v_expires_at timestamptz;
  v_line_results jsonb := '[]'::jsonb;
begin
  select *
  into v_group
  from public.rental_checkout_groups
  where id = p_checkout_group_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Checkout group not found',
      'lineResults', '[]'::jsonb
    );
  end if;

  if v_group.status in ('cancelled', 'expired') then
    return jsonb_build_object(
      'ok', false,
      'groupId', v_group.id,
      'status', v_group.status,
      'message', 'Checkout group is no longer active',
      'lineResults', '[]'::jsonb
    );
  end if;

  select count(*)
  into v_existing_count
  from public.rental_availability_holds h
  where h.checkout_group_id = p_checkout_group_id
    and h.checkout_group_line_id is not null
    and h.status = 'active'
    and h.expires_at > now();

  if v_existing_count > 0 then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'lineId', l.id,
        'lineIndex', l.line_index,
        'cartLineId', l.cart_line_id_snapshot,
        'equipmentId', l.equipment_id,
        'ok', true,
        'status', l.status,
        'holdId', h.id,
        'holdExpiresAt', h.expires_at
      )
      order by l.line_index
    ), '[]'::jsonb)
    into v_line_results
    from public.rental_checkout_group_lines l
    left join public.rental_availability_holds h
      on h.checkout_group_line_id = l.id
      and h.status = 'active'
      and h.expires_at > now()
    where l.checkout_group_id = p_checkout_group_id;

    return jsonb_build_object(
      'ok', true,
      'groupId', v_group.id,
      'status', 'holds_acquired',
      'holdExpiresAt', v_group.hold_expires_at,
      'lineResults', v_line_results,
      'message', 'Existing active holds reused'
    );
  end if;

  update public.rental_checkout_groups
  set status = 'validating',
      failure_reason = null,
      updated_at = now()
  where id = p_checkout_group_id;

  update public.rental_checkout_group_lines
  set status = 'pending',
      failure_reason = null,
      hold_id = null,
      updated_at = now()
  where checkout_group_id = p_checkout_group_id;

  select count(*)
  into v_line_count
  from public.rental_checkout_group_lines
  where checkout_group_id = p_checkout_group_id;

  if v_line_count <= 0 then
    update public.rental_checkout_groups
    set status = 'failed',
        failure_reason = 'No rental lines selected',
        updated_at = now()
    where id = p_checkout_group_id;

    return jsonb_build_object(
      'ok', false,
      'groupId', v_group.id,
      'status', 'failed',
      'message', 'No rental lines selected',
      'lineResults', '[]'::jsonb
    );
  end if;

  for v_lock in
    select distinct equipment_id
    from public.rental_checkout_group_lines
    where checkout_group_id = p_checkout_group_id
    order by equipment_id
  loop
    perform pg_advisory_xact_lock(hashtext('rental_availability:' || v_lock.equipment_id));
  end loop;

  for v_line in
    select *
    from public.rental_checkout_group_lines
    where checkout_group_id = p_checkout_group_id
    order by line_index
  loop
    select id, total_units, maintenance_buffer_days, is_published
    into v_equipment
    from public.rental_equipment
    where id = v_line.equipment_id;

    if not found or coalesce(v_equipment.is_published, false) is false then
      update public.rental_checkout_group_lines
      set status = 'failed',
          failure_reason = 'Equipment is not available for rental checkout',
          updated_at = now()
      where id = v_line.id;

      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'lineId', v_line.id,
        'lineIndex', v_line.line_index,
        'cartLineId', v_line.cart_line_id_snapshot,
        'equipmentId', v_line.equipment_id,
        'ok', false,
        'reasonCode', 'equipment_unavailable',
        'message', 'Equipment is not available for rental checkout'
      ));
      continue;
    end if;

    if v_line.qty <= 0 or v_line.end_date < v_line.start_date then
      update public.rental_checkout_group_lines
      set status = 'failed',
          failure_reason = 'Invalid quantity or rental date range',
          updated_at = now()
      where id = v_line.id;

      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'lineId', v_line.id,
        'lineIndex', v_line.line_index,
        'cartLineId', v_line.cart_line_id_snapshot,
        'equipmentId', v_line.equipment_id,
        'ok', false,
        'reasonCode', 'invalid_line',
        'message', 'Invalid quantity or rental date range'
      ));
      continue;
    end if;

    /*
      Peak-overlap availability:
      Same-equipment checkout-group lines can have staggered date ranges. Summing
      every line that overlaps this line overstates demand. Instead, evaluate each
      date in the current line's rental-plus-maintenance-buffer range and use the
      date with the highest combined demand from this group plus committed orders,
      external active holds, and equipment downtime. The group demand includes
      maintenance buffer days after each line's rental end date, even though pricing
      and stored rental dates remain unchanged. Holds from this same checkout group
      are excluded so idempotent rechecks do not count the group's own holds twice.
    */
    select
      daily.day,
      daily.group_requested_qty,
      daily.committed_qty,
      daily.held_qty,
      daily.downtime_qty
    into
      v_peak_date,
      v_group_requested_qty,
      v_committed_qty,
      v_held_qty,
      v_downtime_qty
    from (
      select
        day_series.day::date as day,
        (
          select coalesce(sum(l.qty), 0)
          from public.rental_checkout_group_lines l
          where l.checkout_group_id = p_checkout_group_id
            and l.equipment_id = v_line.equipment_id
            and l.qty > 0
            and l.end_date >= l.start_date
            and l.start_date <= day_series.day::date
            and day_series.day::date <= (
              l.end_date + greatest(coalesce(v_equipment.maintenance_buffer_days, 0), 0)
            )
        ) as group_requested_qty,
        (
          select coalesce(count(*), 0)
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
          where o.equipment_id = v_line.equipment_id
            and o.start_date <= day_series.day::date
            and day_series.day::date <= greatest(
              o.end_date,
              coalesce(
                bo.override_buffer_end_date,
                o.end_date + coalesce(o.maintenance_buffer_days_applied, greatest(coalesce(v_equipment.maintenance_buffer_days, 0), 0))
              )
            )
            and exists (
              select 1
              from public.rental_invoices i
              where i.order_id = o.id
                and i.status <> 'void'
            )
        ) as committed_qty,
        (
          select coalesce(sum(h.qty), 0)
          from public.rental_availability_holds h
          where h.equipment_id = v_line.equipment_id
            and h.status = 'active'
            and h.expires_at > now()
            and h.rental_start <= day_series.day::date
            and day_series.day::date <= h.rental_end
            and (h.checkout_group_id is null or h.checkout_group_id <> p_checkout_group_id)
            and not exists (
              select 1
              from public.rental_invoices i
              where i.order_id = coalesce(h.order_id, h.checkout_reference)
                and i.status <> 'void'
            )
        ) as held_qty,
        (
          select coalesce(sum(d.quantity_affected), 0)
          from public.rental_equipment_downtime d
          where d.equipment_id = v_line.equipment_id
            and d.status = 'active'
            and d.start_date <= day_series.day::date
            and day_series.day::date <= d.end_date
        ) as downtime_qty
      from generate_series(
        v_line.start_date,
        v_line.end_date + greatest(coalesce(v_equipment.maintenance_buffer_days, 0), 0),
        interval '1 day'
      ) as day_series(day)
    ) daily
    order by (
      daily.group_requested_qty +
      daily.committed_qty +
      daily.held_qty +
      daily.downtime_qty
    ) desc, daily.day asc
    limit 1;

    v_available_qty := greatest(coalesce(v_equipment.total_units, 0) - v_committed_qty - v_held_qty - v_downtime_qty, 0);

    if v_available_qty < v_group_requested_qty then
      update public.rental_checkout_group_lines
      set status = 'failed',
          failure_reason = 'Insufficient availability for selected dates',
          updated_at = now()
      where id = v_line.id;

      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'lineId', v_line.id,
        'lineIndex', v_line.line_index,
        'cartLineId', v_line.cart_line_id_snapshot,
        'equipmentId', v_line.equipment_id,
        'ok', false,
        'reasonCode', 'insufficient_availability',
        'message', 'Only ' || v_available_qty || ' unit(s) are currently available for the selected dates.',
        'availableQty', v_available_qty,
        'requestedQty', v_group_requested_qty,
        'committedQty', v_committed_qty,
        'heldQty', v_held_qty,
        'downtimeQty', v_downtime_qty,
        'totalUnits', coalesce(v_equipment.total_units, 0)
      ));
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    update public.rental_checkout_groups
    set status = 'failed',
        failure_reason = 'One or more rental lines are unavailable',
        hold_expires_at = null,
        updated_at = now()
    where id = p_checkout_group_id;

    return jsonb_build_object(
      'ok', false,
      'groupId', p_checkout_group_id,
      'status', 'failed',
      'message', 'One or more rental lines are unavailable',
      'lineResults', v_errors
    );
  end if;

  v_expires_at := now() + interval '15 minutes';

  for v_line in
    select *
    from public.rental_checkout_group_lines
    where checkout_group_id = p_checkout_group_id
    order by line_index
  loop
    insert into public.rental_availability_holds (
      checkout_reference,
      equipment_id,
      customer_id,
      qty,
      rental_start,
      rental_end,
      status,
      expires_at,
      checkout_group_id,
      checkout_group_line_id,
      notes
    )
    values (
      v_line.id::text,
      v_line.equipment_id,
      v_group.customer_id,
      v_line.qty,
      v_line.start_date,
      v_line.end_date,
      'active',
      v_expires_at,
      p_checkout_group_id,
      v_line.id,
      'Checkout group hold'
    )
    returning id
    into v_hold_id;

    update public.rental_checkout_group_lines
    set status = 'hold_acquired',
        hold_id = v_hold_id,
        failure_reason = null,
        updated_at = now()
    where id = v_line.id;
  end loop;

  update public.rental_checkout_groups
  set status = 'holds_acquired',
      hold_expires_at = v_expires_at,
      failure_reason = null,
      updated_at = now()
  where id = p_checkout_group_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineId', l.id,
      'lineIndex', l.line_index,
      'cartLineId', l.cart_line_id_snapshot,
      'equipmentId', l.equipment_id,
      'ok', true,
      'status', l.status,
      'holdId', l.hold_id,
      'holdExpiresAt', v_expires_at
    )
    order by l.line_index
  ), '[]'::jsonb)
  into v_line_results
  from public.rental_checkout_group_lines l
  where l.checkout_group_id = p_checkout_group_id;

  return jsonb_build_object(
    'ok', true,
    'groupId', p_checkout_group_id,
    'status', 'holds_acquired',
    'holdExpiresAt', v_expires_at,
    'lineResults', v_line_results,
    'message', 'Rental holds acquired'
  );
end;
$$;
