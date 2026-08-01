create table if not exists rental_contact_enquiries (
  id text primary key,
  name text not null,
  company_name text null,
  email text not null,
  phone text null,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'emailed', 'email_failed')),
  source text not null default 'website_contact_form',
  email_sent_at timestamptz null,
  email_send_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists rental_contact_enquiries_created_at_idx
  on rental_contact_enquiries (created_at desc);

create index if not exists rental_contact_enquiries_status_idx
  on rental_contact_enquiries (status);
