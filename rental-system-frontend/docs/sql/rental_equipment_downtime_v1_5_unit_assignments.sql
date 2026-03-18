alter table public.rental_equipment_downtime
  add column if not exists unit_assignments jsonb not null default '[]'::jsonb;

update public.rental_equipment_downtime
set unit_assignments = '[]'::jsonb
where unit_assignments is null;

create index if not exists rental_equipment_downtime_unit_assignments_idx
  on public.rental_equipment_downtime
  using gin (unit_assignments);
