create or replace function public.record_rental_invoice_payment(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_paid_at timestamptz default null,
  p_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns table (
  total_cents integer,
  paid_cents bigint,
  balance_cents bigint,
  payment_status text
)
language plpgsql
as $$
declare
  v_invoice public.rental_invoices%rowtype;
  v_paid_cents bigint;
  v_total_cents integer;
  v_balance_cents bigint;
begin
  select *
  into v_invoice
  from public.rental_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status <> 'issued' then
    raise exception 'Payments can only be recorded for issued invoices';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amountCents must be greater than 0';
  end if;

  v_total_cents := greatest(coalesce(v_invoice.total_incl_gst_cents, 0), 0);

  select coalesce(sum(amount_cents), 0)
  into v_paid_cents
  from public.rental_invoice_payments
  where invoice_id = p_invoice_id;

  v_balance_cents := greatest(v_total_cents - v_paid_cents, 0);

  if p_amount_cents > v_balance_cents then
    raise exception 'Payment amount exceeds outstanding balance';
  end if;

  insert into public.rental_invoice_payments (
    invoice_id,
    amount_cents,
    paid_at,
    method,
    reference,
    notes
  )
  values (
    p_invoice_id,
    p_amount_cents,
    coalesce(p_paid_at, now()),
    nullif(btrim(p_method), ''),
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), '')
  );

  v_paid_cents := v_paid_cents + p_amount_cents;
  v_balance_cents := greatest(v_total_cents - v_paid_cents, 0);

  total_cents := v_total_cents;
  paid_cents := v_paid_cents;
  balance_cents := v_balance_cents;
  payment_status := case
    when v_balance_cents <= 0 then 'paid'
    when v_invoice.due_date is not null and v_invoice.due_date < now() then 'overdue'
    when v_paid_cents > 0 then 'partially_paid'
    else 'unpaid'
  end;

  return next;
end;
$$;
