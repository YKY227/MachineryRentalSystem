create table if not exists rental_invoice_number_counters (
  period_key text primary key,
  last_suffix integer not null check (last_suffix > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function allocate_rental_invoice_no(p_period_key text)
returns text
language plpgsql
as $$
declare
  v_next_suffix integer;
begin
  if p_period_key is null or p_period_key !~ '^[0-9]{6}$' then
    raise exception 'Invalid invoice period key: %', p_period_key;
  end if;

  insert into rental_invoice_number_counters (
    period_key,
    last_suffix,
    created_at,
    updated_at
  )
  values (
    p_period_key,
    coalesce(
      (
        select max((regexp_match(invoice_no, '^INV-' || p_period_key || '-(\d{5})$'))[1]::integer)
        from rental_invoices
        where invoice_no like 'INV-' || p_period_key || '-%'
      ),
      0
    ) + 1,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (period_key) do update
    set last_suffix = rental_invoice_number_counters.last_suffix + 1,
        updated_at = timezone('utc', now())
  returning last_suffix into v_next_suffix;

  return 'INV-' || p_period_key || '-' || lpad(v_next_suffix::text, 5, '0');
end;
$$;
