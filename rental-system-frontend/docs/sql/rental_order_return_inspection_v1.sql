alter table rental_orders
  add column if not exists return_status text not null default 'out',
  add column if not exists returned_at timestamptz null,
  add column if not exists return_notes text null,
  add column if not exists inspection_status text not null default 'not_started',
  add column if not exists inspection_notes text null,
  add column if not exists completed_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rental_orders_return_status_check'
  ) then
    alter table rental_orders
      add constraint rental_orders_return_status_check
      check (return_status in ('out', 'returned', 'completed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'rental_orders_inspection_status_check'
  ) then
    alter table rental_orders
      add constraint rental_orders_inspection_status_check
      check (inspection_status in ('not_started', 'pending', 'passed', 'issues_found'));
  end if;
end $$;
