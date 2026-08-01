alter table if exists rental_orders
  add column if not exists new_order_notified_at timestamptz null,
  add column if not exists new_order_acknowledged_at timestamptz null;
