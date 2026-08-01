insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'equipment-images',
  'equipment-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets allow unauthenticated reads, but writes still require a storage
-- policy. This app intentionally performs writes only through the admin API with
-- the server-side service-role client; no anonymous INSERT/UPDATE/DELETE policy is added.
