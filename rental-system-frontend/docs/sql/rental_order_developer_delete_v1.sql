create or replace function public.developer_delete_rental_order(p_order_id text)
returns jsonb
language plpgsql
as $$
declare
  v_order_exists boolean;
  v_invoice_ids uuid[] := '{}';
  v_payment_session_ids uuid[] := '{}';
  v_deposit_ids uuid[] := '{}';
  v_deleted_invoice_emails integer := 0;
  v_deleted_payment_allocations integer := 0;
  v_deleted_extensions integer := 0;
  v_deleted_holds integer := 0;
  v_deleted_invoices integer := 0;
  v_deleted_orders integer := 0;
begin
  select exists(select 1 from public.rental_orders where id = p_order_id)
    into v_order_exists;

  if not v_order_exists then
    return jsonb_build_object(
      'orderId', p_order_id,
      'deleted', false,
      'reason', 'not_found'
    );
  end if;

  select coalesce(array_agg(id), '{}') into v_invoice_ids
  from public.rental_invoices
  where order_id = p_order_id;

  select coalesce(array_agg(id), '{}') into v_payment_session_ids
  from public.rental_order_payment_sessions
  where order_id = p_order_id;

  select coalesce(array_agg(id), '{}') into v_deposit_ids
  from public.rental_order_deposits
  where order_id = p_order_id;

  if coalesce(array_length(v_invoice_ids, 1), 0) > 0 then
    delete from public.rental_invoice_emails
    where invoice_id = any(v_invoice_ids);
    get diagnostics v_deleted_invoice_emails = row_count;
  end if;

  delete from public.rental_payment_allocations
  where (
      coalesce(array_length(v_payment_session_ids, 1), 0) > 0
      and source_type = 'checkout_session'
      and source_id = any(v_payment_session_ids)
    )
    or (
      coalesce(array_length(v_invoice_ids, 1), 0) > 0
      and allocation_type = 'invoice'
      and target_id = any(v_invoice_ids)
    )
    or (
      coalesce(array_length(v_deposit_ids, 1), 0) > 0
      and allocation_type = 'deposit'
      and target_id = any(v_deposit_ids)
    );
  get diagnostics v_deleted_payment_allocations = row_count;

  delete from public.rental_order_extensions
  where order_id = p_order_id;
  get diagnostics v_deleted_extensions = row_count;

  delete from public.rental_availability_holds
  where order_id = p_order_id
    or (
      coalesce(array_length(v_payment_session_ids, 1), 0) > 0
      and payment_session_id = any(v_payment_session_ids)
    );
  get diagnostics v_deleted_holds = row_count;

  if coalesce(array_length(v_invoice_ids, 1), 0) > 0 then
    delete from public.rental_invoices
    where id = any(v_invoice_ids);
    get diagnostics v_deleted_invoices = row_count;
  end if;

  delete from public.rental_orders
  where id = p_order_id;
  get diagnostics v_deleted_orders = row_count;

  return jsonb_build_object(
    'orderId', p_order_id,
    'deleted', v_deleted_orders > 0,
    'invoiceEmailCount', v_deleted_invoice_emails,
    'paymentAllocationCount', v_deleted_payment_allocations,
    'extensionCount', v_deleted_extensions,
    'holdCount', v_deleted_holds,
    'invoiceCount', v_deleted_invoices,
    'orderCount', v_deleted_orders
  );
end;
$$;
