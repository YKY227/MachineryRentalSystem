alter table public.rental_deposit_transactions
  add column if not exists damage_assessment_id uuid null
    references public.rental_order_damage_assessments(id);

create index if not exists rental_deposit_transactions_damage_assessment_idx
  on public.rental_deposit_transactions (damage_assessment_id)
  where damage_assessment_id is not null;
