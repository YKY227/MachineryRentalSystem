create unique index if not exists rental_order_payment_sessions_customer_invoice_active_pending_idx
  on public.rental_order_payment_sessions(invoice_id, provider, currency)
  where status = 'pending'
    and invoice_id is not null
    and webhook_payload->>'paymentMode' = 'customer_invoice';

drop index if exists rental_order_payment_sessions_customer_invoice_pending_idx;
