alter table public.rental_order_payment_sessions
  add column if not exists invoice_id uuid null references public.rental_invoices(id) on delete set null,
  add column if not exists invoice_payment_id uuid null references public.rental_invoice_payments(id) on delete set null,
  add column if not exists invoice_applied_at timestamptz null,
  add column if not exists invoice_email_sent_at timestamptz null;

alter table public.rental_invoice_payments
  add column if not exists source_payment_session_id uuid null references public.rental_order_payment_sessions(id) on delete set null;

create unique index if not exists rental_invoice_payments_source_payment_session_id_idx
  on public.rental_invoice_payments(source_payment_session_id)
  where source_payment_session_id is not null;
