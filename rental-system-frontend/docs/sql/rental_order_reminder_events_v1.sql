create extension if not exists pgcrypto;

create table if not exists public.rental_order_reminder_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.rental_orders(id) on delete cascade,
  customer_id text null,
  reminder_kind text not null check (reminder_kind in ('return')),
  reminder_stage text not null check (reminder_stage in ('three_day', 'one_day', 'due_today')),
  recipient_email text not null,
  subject text not null,
  provider text not null check (provider in ('mock', 'resend', 'ses', 'postmark')),
  provider_message_id text null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text null,
  sent_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists rental_order_reminder_events_order_idx
  on public.rental_order_reminder_events (order_id, sent_at desc);

create index if not exists rental_order_reminder_events_customer_idx
  on public.rental_order_reminder_events (customer_id, sent_at desc);

create index if not exists rental_order_reminder_events_kind_stage_idx
  on public.rental_order_reminder_events (reminder_kind, reminder_stage, sent_at desc);

create unique index if not exists rental_order_return_reminder_sent_unique
  on public.rental_order_reminder_events (order_id, reminder_kind, reminder_stage)
  where status = 'sent' and reminder_kind = 'return';
