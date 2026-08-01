create table if not exists rental_contact_submission_attempts (
  id text primary key,
  identifier_hash text not null,
  source text not null default 'website_contact_form',
  outcome text not null check (outcome in ('allowed', 'rate_limited', 'spam_blocked')),
  blocked_reason text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists rental_contact_submission_attempts_identifier_created_idx
  on rental_contact_submission_attempts (identifier_hash, created_at desc);

