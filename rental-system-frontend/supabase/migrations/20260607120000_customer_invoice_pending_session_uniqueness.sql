update public.rental_order_payment_sessions
set invoice_id = (webhook_payload->>'invoiceId')::uuid,
    updated_at = now()
where invoice_id is null
  and webhook_payload->>'paymentMode' = 'customer_invoice'
  and (webhook_payload->>'invoiceId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

with ranked_pending_sessions as (
  select
    id,
    row_number() over (
      partition by invoice_id, amount_cents, currency
      order by (provider_payment_request_id is not null and redirect_url is not null) desc, created_at desc
    ) as keep_rank
  from public.rental_order_payment_sessions
  where status = 'pending'
    and invoice_id is not null
    and webhook_payload->>'paymentMode' = 'customer_invoice'
)
update public.rental_order_payment_sessions sessions
set status = 'expired',
    webhook_payload = coalesce(sessions.webhook_payload, '{}'::jsonb) || jsonb_build_object(
      'dedupeExpiredAt', now(),
      'dedupeReason', 'superseded_pending_customer_invoice_session'
    ),
    updated_at = now()
from ranked_pending_sessions ranked
where sessions.id = ranked.id
  and ranked.keep_rank > 1;

create unique index if not exists rental_order_payment_sessions_customer_invoice_pending_idx
  on public.rental_order_payment_sessions(invoice_id, amount_cents, currency)
  where status = 'pending'
    and invoice_id is not null
    and webhook_payload->>'paymentMode' = 'customer_invoice';
