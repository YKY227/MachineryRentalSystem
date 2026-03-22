create table if not exists public.rental_order_damage_assessments (
  id uuid primary key default gen_random_uuid(),
  rental_order_id text not null references public.rental_orders(id) on delete cascade,
  assessment_result text not null default 'further_review'
    check (assessment_result in ('clear', 'wear_and_tear', 'issues_found', 'further_review')),
  issue_categories text[] not null default '{}'::text[],
  notes text null,
  estimated_retention_cents integer not null default 0 check (estimated_retention_cents >= 0),
  recommended_deposit_action text not null default 'manual_review'
    check (recommended_deposit_action in ('none', 'release', 'partial_retain', 'full_retain', 'manual_review')),
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_by text null,
  finalized_by text null,
  finalized_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint rental_order_damage_assessments_order_unique unique (rental_order_id)
);

create index if not exists rental_order_damage_assessments_status_updated_idx
  on public.rental_order_damage_assessments (status, updated_at desc);

create index if not exists rental_order_damage_assessments_order_idx
  on public.rental_order_damage_assessments (rental_order_id);
