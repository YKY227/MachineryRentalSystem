alter table public.rental_equipment
  add column if not exists catalogue_storage_path text null,
  add column if not exists catalogue_file_name text null;

create index if not exists rental_equipment_catalogue_storage_path_idx
  on public.rental_equipment (catalogue_storage_path)
  where catalogue_storage_path is not null;
