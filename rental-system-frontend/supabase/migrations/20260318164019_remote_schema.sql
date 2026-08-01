drop extension if exists "pg_net";


  create table "public"."customer_password_resets" (
    "id" uuid not null default gen_random_uuid(),
    "customer_id" uuid not null,
    "token_hash" text not null,
    "expires_at" timestamp with time zone not null,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."rental_availability_holds" (
    "id" uuid not null default gen_random_uuid(),
    "checkout_reference" text not null,
    "equipment_id" text not null,
    "customer_id" uuid,
    "order_id" text,
    "payment_session_id" uuid,
    "qty" integer not null,
    "rental_start" date not null,
    "rental_end" date not null,
    "status" text not null default 'active'::text,
    "expires_at" timestamp with time zone not null,
    "released_at" timestamp with time zone,
    "consumed_at" timestamp with time zone,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."rental_customers" (
    "id" uuid not null default gen_random_uuid(),
    "company_name" text not null,
    "contact_name" text,
    "email" text not null,
    "phone" text,
    "payment_terms" text not null default 'upfront'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "uen" text,
    "address" text,
    "vetting_status" text not null default 'new'::text,
    "account_status" text not null default 'active'::text,
    "internal_notes" text,
    "auth_user_id" uuid,
    "credit_limit" numeric(12,2),
    "credit_control_enabled" boolean not null default true,
    "credit_hold_reason" text,
    "credit_last_reviewed_at" timestamp with time zone,
    "credit_last_reviewed_by" text
      );



  create table "public"."rental_deposit_transactions" (
    "id" uuid not null default gen_random_uuid(),
    "deposit_id" uuid not null,
    "order_id" text not null,
    "customer_id" uuid,
    "transaction_type" text not null,
    "amount_cents" integer not null,
    "payment_session_id" uuid,
    "invoice_id" uuid,
    "invoice_payment_id" uuid,
    "payment_allocation_id" uuid,
    "notes" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "recorded_by" text,
    "external_reference" text
      );



  create table "public"."rental_equipment" (
    "id" text not null,
    "slug" text not null,
    "title" text not null,
    "category" text not null,
    "brand" text,
    "model" text,
    "description" text,
    "short_description" text,
    "total_units" integer not null default 0,
    "maintenance_buffer_days" integer not null default 7,
    "day_rate" numeric(12,2) not null default 0,
    "week_rate" numeric(12,2),
    "month_rate" numeric(12,2),
    "min_rental_days" integer not null default 1,
    "deposit_amount" numeric(12,2) not null default 0,
    "image_url" text,
    "image_urls" jsonb not null default '[]'::jsonb,
    "catalogue_url" text,
    "training_video_url" text,
    "key_features" jsonb not null default '[]'::jsonb,
    "applications" jsonb not null default '[]'::jsonb,
    "specifications" jsonb not null default '{}'::jsonb,
    "is_published" boolean not null default false,
    "display_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."rental_equipment_downtime" (
    "id" uuid not null default gen_random_uuid(),
    "equipment_id" text not null,
    "downtime_type" text not null,
    "start_date" date not null,
    "end_date" date not null,
    "quantity_affected" integer not null,
    "status" text not null default 'active'::text,
    "reason" text,
    "notes" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "unit_assignments" jsonb not null default '[]'::jsonb
      );



  create table "public"."rental_invoice_emails" (
    "id" uuid not null default gen_random_uuid(),
    "invoice_id" uuid not null,
    "type" text not null,
    "to" text not null,
    "cc" text,
    "subject" text,
    "provider" text not null default 'resend'::text,
    "status" text not null default 'sent'::text,
    "provider_message_id" text,
    "pdf_sha256" text,
    "pdf_path" text,
    "pdf_source" text,
    "sent_at" timestamp with time zone not null default now()
      );



  create table "public"."rental_invoice_payments" (
    "id" uuid not null default gen_random_uuid(),
    "invoice_id" uuid not null,
    "amount_cents" integer not null,
    "paid_at" timestamp with time zone not null default now(),
    "method" text,
    "reference" text,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "source_payment_session_id" uuid
      );



  create table "public"."rental_invoices" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" text not null,
    "status" text not null,
    "invoice_no" text,
    "issue_date" timestamp with time zone,
    "due_date" timestamp with time zone,
    "currency" text not null default 'SGD'::text,
    "prices_include_gst" boolean not null default false,
    "gst_rate" numeric not null default 0.09,
    "supplier" jsonb not null default '{}'::jsonb,
    "bill_to" jsonb not null default '{}'::jsonb,
    "items" jsonb not null default '[]'::jsonb,
    "subtotal_excl_gst_cents" integer not null default 0,
    "gst_amount_cents" integer not null default 0,
    "total_incl_gst_cents" integer not null default 0,
    "deposit_cents" integer,
    "void_reason" text,
    "voided_at" timestamp with time zone,
    "pdf_storage" jsonb,
    "email_log" jsonb not null default '[]'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."rental_order_buffer_overrides" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" text not null,
    "order_unit_index" integer not null,
    "override_buffer_end_date" date not null,
    "status" text not null default 'active'::text,
    "reason" text,
    "notes" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );



  create table "public"."rental_order_deposits" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" text not null,
    "customer_id" uuid,
    "required_amount_cents" integer not null,
    "held_amount_cents" integer not null default 0,
    "released_amount_cents" integer not null default 0,
    "retained_amount_cents" integer not null default 0,
    "status" text not null,
    "source_invoice_id" uuid,
    "last_payment_session_id" uuid,
    "last_invoice_payment_id" uuid,
    "last_collected_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "retained_at" timestamp with time zone,
    "notes" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "resolved_at" timestamp with time zone,
    "last_resolution_type" text,
    "last_resolution_note" text,
    "last_resolution_recorded_by" text,
    "last_resolution_reference" text
      );



  create table "public"."rental_order_extensions" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" text not null,
    "customer_id" text not null,
    "current_rental_end" date not null,
    "requested_rental_end" date not null,
    "status" text not null,
    "extension_charge_estimate_cents" integer not null default 0,
    "final_extension_charge_cents" integer,
    "payment_terms_snapshot" text not null,
    "availability_status" text not null default 'unknown'::text,
    "availability_message" text,
    "customer_message" text,
    "review_note" text,
    "payment_session_id" text,
    "invoice_id" text,
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."rental_order_payment_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" text not null,
    "provider" text not null,
    "provider_payment_request_id" text,
    "provider_reference_number" text,
    "amount_cents" integer not null,
    "currency" text not null default 'SGD'::text,
    "status" text not null,
    "payment_purpose" text,
    "redirect_url" text,
    "webhook_payload" jsonb,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "invoice_id" uuid,
    "invoice_payment_id" uuid,
    "invoice_applied_at" timestamp with time zone,
    "invoice_email_sent_at" timestamp with time zone
      );



  create table "public"."rental_order_reminder_events" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" text not null,
    "customer_id" text,
    "reminder_kind" text not null,
    "reminder_stage" text not null,
    "recipient_email" text not null,
    "subject" text not null,
    "provider" text not null,
    "provider_message_id" text,
    "status" text not null default 'sent'::text,
    "error_message" text,
    "sent_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );



  create table "public"."rental_orders" (
    "id" text not null,
    "equipment_id" text not null,
    "equipment_title" text not null,
    "qty" integer not null,
    "start_date" date not null,
    "end_date" date not null,
    "fulfillment" text not null,
    "pricing_snapshot" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "customer_snapshot" jsonb,
    "customer_id" uuid,
    "return_status" text not null default 'out'::text,
    "returned_at" timestamp with time zone,
    "return_notes" text,
    "inspection_status" text not null default 'not_started'::text,
    "inspection_notes" text,
    "completed_at" timestamp with time zone,
    "maintenance_buffer_days_applied" integer
      );



  create table "public"."rental_payment_allocations" (
    "id" uuid not null default gen_random_uuid(),
    "source_type" text not null,
    "source_id" uuid not null,
    "allocation_type" text not null,
    "target_id" uuid not null,
    "amount_cents" integer not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."system_settings" (
    "key" text not null,
    "value" jsonb not null default '{}'::jsonb,
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


CREATE INDEX customer_password_resets_active_idx ON public.customer_password_resets USING btree (customer_id, expires_at) WHERE (used_at IS NULL);

CREATE INDEX customer_password_resets_customer_created_idx ON public.customer_password_resets USING btree (customer_id, created_at DESC);

CREATE UNIQUE INDEX customer_password_resets_pkey ON public.customer_password_resets USING btree (id);

CREATE UNIQUE INDEX customer_password_resets_token_hash_key ON public.customer_password_resets USING btree (token_hash);

CREATE INDEX idx_rental_orders_created_at_desc ON public.rental_orders USING btree (created_at DESC);

CREATE INDEX idx_rental_orders_equipment_id ON public.rental_orders USING btree (equipment_id);

CREATE UNIQUE INDEX rental_availability_holds_active_checkout_unique ON public.rental_availability_holds USING btree (checkout_reference, equipment_id, rental_start, rental_end) WHERE (status = 'active'::text);

CREATE INDEX rental_availability_holds_checkout_reference_idx ON public.rental_availability_holds USING btree (checkout_reference, created_at DESC);

CREATE INDEX rental_availability_holds_equipment_active_idx ON public.rental_availability_holds USING btree (equipment_id, status, expires_at, rental_start, rental_end);

CREATE UNIQUE INDEX rental_availability_holds_pkey ON public.rental_availability_holds USING btree (id);

CREATE UNIQUE INDEX rental_customers_auth_user_id_idx ON public.rental_customers USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

CREATE INDEX rental_customers_email_idx ON public.rental_customers USING btree (lower(email));

CREATE UNIQUE INDEX rental_customers_pkey ON public.rental_customers USING btree (id);

CREATE INDEX rental_deposit_transactions_deposit_idx ON public.rental_deposit_transactions USING btree (deposit_id, created_at DESC);

CREATE INDEX rental_deposit_transactions_external_reference_idx ON public.rental_deposit_transactions USING btree (external_reference) WHERE (external_reference IS NOT NULL);

CREATE INDEX rental_deposit_transactions_order_idx ON public.rental_deposit_transactions USING btree (order_id, created_at DESC);

CREATE UNIQUE INDEX rental_deposit_transactions_payment_session_unique ON public.rental_deposit_transactions USING btree (deposit_id, transaction_type, payment_session_id) WHERE ((payment_session_id IS NOT NULL) AND (transaction_type = 'payment_collected'::text));

CREATE UNIQUE INDEX rental_deposit_transactions_pkey ON public.rental_deposit_transactions USING btree (id);

CREATE UNIQUE INDEX rental_deposit_transactions_requirement_unique ON public.rental_deposit_transactions USING btree (deposit_id, transaction_type) WHERE (transaction_type = 'requirement_created'::text);

CREATE INDEX rental_equipment_category_idx ON public.rental_equipment USING btree (category);

CREATE INDEX rental_equipment_downtime_equipment_active_idx ON public.rental_equipment_downtime USING btree (equipment_id, status, start_date, end_date);

CREATE UNIQUE INDEX rental_equipment_downtime_pkey ON public.rental_equipment_downtime USING btree (id);

CREATE INDEX rental_equipment_downtime_status_idx ON public.rental_equipment_downtime USING btree (status, start_date, end_date);

CREATE INDEX rental_equipment_downtime_unit_assignments_idx ON public.rental_equipment_downtime USING gin (unit_assignments);

CREATE UNIQUE INDEX rental_equipment_pkey ON public.rental_equipment USING btree (id);

CREATE INDEX rental_equipment_published_idx ON public.rental_equipment USING btree (is_published, display_order, updated_at DESC);

CREATE UNIQUE INDEX rental_equipment_slug_key ON public.rental_equipment USING btree (slug);

CREATE INDEX rental_invoice_emails_invoice_id_idx ON public.rental_invoice_emails USING btree (invoice_id);

CREATE UNIQUE INDEX rental_invoice_emails_pkey ON public.rental_invoice_emails USING btree (id);

CREATE INDEX rental_invoice_emails_sent_at_idx ON public.rental_invoice_emails USING btree (sent_at);

CREATE INDEX rental_invoice_payments_invoice_paid_at_idx ON public.rental_invoice_payments USING btree (invoice_id, paid_at DESC);

CREATE UNIQUE INDEX rental_invoice_payments_pkey ON public.rental_invoice_payments USING btree (id);

CREATE UNIQUE INDEX rental_invoice_payments_source_payment_session_id_idx ON public.rental_invoice_payments USING btree (source_payment_session_id) WHERE (source_payment_session_id IS NOT NULL);

CREATE INDEX rental_invoices_invoice_no_idx ON public.rental_invoices USING btree (invoice_no);

CREATE UNIQUE INDEX rental_invoices_invoice_no_key ON public.rental_invoices USING btree (invoice_no);

CREATE UNIQUE INDEX rental_invoices_order_id_key ON public.rental_invoices USING btree (order_id);

CREATE UNIQUE INDEX rental_invoices_pkey ON public.rental_invoices USING btree (id);

CREATE INDEX rental_invoices_status_idx ON public.rental_invoices USING btree (status);

CREATE UNIQUE INDEX rental_order_buffer_overrides_active_unit_idx ON public.rental_order_buffer_overrides USING btree (order_id, order_unit_index) WHERE (status = 'active'::text);

CREATE INDEX rental_order_buffer_overrides_order_idx ON public.rental_order_buffer_overrides USING btree (order_id, status, order_unit_index);

CREATE UNIQUE INDEX rental_order_buffer_overrides_pkey ON public.rental_order_buffer_overrides USING btree (id);

CREATE INDEX rental_order_deposits_customer_idx ON public.rental_order_deposits USING btree (customer_id, created_at DESC);

CREATE UNIQUE INDEX rental_order_deposits_order_unique ON public.rental_order_deposits USING btree (order_id);

CREATE UNIQUE INDEX rental_order_deposits_pkey ON public.rental_order_deposits USING btree (id);

CREATE INDEX rental_order_deposits_status_idx ON public.rental_order_deposits USING btree (status, updated_at DESC);

CREATE INDEX rental_order_extensions_customer_idx ON public.rental_order_extensions USING btree (customer_id, created_at DESC);

CREATE UNIQUE INDEX rental_order_extensions_open_request_unique ON public.rental_order_extensions USING btree (order_id) WHERE (status = ANY (ARRAY['availability_blocked'::text, 'awaiting_admin_review'::text, 'approved_pending_payment'::text]));

CREATE INDEX rental_order_extensions_order_idx ON public.rental_order_extensions USING btree (order_id, created_at DESC);

CREATE UNIQUE INDEX rental_order_extensions_pkey ON public.rental_order_extensions USING btree (id);

CREATE INDEX rental_order_extensions_status_idx ON public.rental_order_extensions USING btree (status, created_at DESC);

CREATE INDEX rental_order_payment_sessions_order_id_idx ON public.rental_order_payment_sessions USING btree (order_id, created_at DESC);

CREATE UNIQUE INDEX rental_order_payment_sessions_pkey ON public.rental_order_payment_sessions USING btree (id);

CREATE UNIQUE INDEX rental_order_payment_sessions_provider_request_idx ON public.rental_order_payment_sessions USING btree (provider, provider_payment_request_id) WHERE (provider_payment_request_id IS NOT NULL);

CREATE INDEX rental_order_reminder_events_customer_idx ON public.rental_order_reminder_events USING btree (customer_id, sent_at DESC);

CREATE INDEX rental_order_reminder_events_kind_stage_idx ON public.rental_order_reminder_events USING btree (reminder_kind, reminder_stage, sent_at DESC);

CREATE INDEX rental_order_reminder_events_order_idx ON public.rental_order_reminder_events USING btree (order_id, sent_at DESC);

CREATE UNIQUE INDEX rental_order_reminder_events_pkey ON public.rental_order_reminder_events USING btree (id);

CREATE UNIQUE INDEX rental_order_return_reminder_sent_unique ON public.rental_order_reminder_events USING btree (order_id, reminder_kind, reminder_stage) WHERE ((status = 'sent'::text) AND (reminder_kind = 'return'::text));

CREATE INDEX rental_orders_customer_id_idx ON public.rental_orders USING btree (customer_id);

CREATE UNIQUE INDEX rental_orders_pkey ON public.rental_orders USING btree (id);

CREATE UNIQUE INDEX rental_payment_allocations_pkey ON public.rental_payment_allocations USING btree (id);

CREATE INDEX rental_payment_allocations_source_idx ON public.rental_payment_allocations USING btree (source_type, source_id, created_at DESC);

CREATE UNIQUE INDEX rental_payment_allocations_source_target_unique ON public.rental_payment_allocations USING btree (source_type, source_id, allocation_type, target_id);

CREATE INDEX rental_payment_allocations_target_idx ON public.rental_payment_allocations USING btree (allocation_type, target_id, created_at DESC);

CREATE UNIQUE INDEX system_settings_pkey ON public.system_settings USING btree (key);

alter table "public"."customer_password_resets" add constraint "customer_password_resets_pkey" PRIMARY KEY using index "customer_password_resets_pkey";

alter table "public"."rental_availability_holds" add constraint "rental_availability_holds_pkey" PRIMARY KEY using index "rental_availability_holds_pkey";

alter table "public"."rental_customers" add constraint "rental_customers_pkey" PRIMARY KEY using index "rental_customers_pkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_pkey" PRIMARY KEY using index "rental_deposit_transactions_pkey";

alter table "public"."rental_equipment" add constraint "rental_equipment_pkey" PRIMARY KEY using index "rental_equipment_pkey";

alter table "public"."rental_equipment_downtime" add constraint "rental_equipment_downtime_pkey" PRIMARY KEY using index "rental_equipment_downtime_pkey";

alter table "public"."rental_invoice_emails" add constraint "rental_invoice_emails_pkey" PRIMARY KEY using index "rental_invoice_emails_pkey";

alter table "public"."rental_invoice_payments" add constraint "rental_invoice_payments_pkey" PRIMARY KEY using index "rental_invoice_payments_pkey";

alter table "public"."rental_invoices" add constraint "rental_invoices_pkey" PRIMARY KEY using index "rental_invoices_pkey";

alter table "public"."rental_order_buffer_overrides" add constraint "rental_order_buffer_overrides_pkey" PRIMARY KEY using index "rental_order_buffer_overrides_pkey";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_pkey" PRIMARY KEY using index "rental_order_deposits_pkey";

alter table "public"."rental_order_extensions" add constraint "rental_order_extensions_pkey" PRIMARY KEY using index "rental_order_extensions_pkey";

alter table "public"."rental_order_payment_sessions" add constraint "rental_order_payment_sessions_pkey" PRIMARY KEY using index "rental_order_payment_sessions_pkey";

alter table "public"."rental_order_reminder_events" add constraint "rental_order_reminder_events_pkey" PRIMARY KEY using index "rental_order_reminder_events_pkey";

alter table "public"."rental_orders" add constraint "rental_orders_pkey" PRIMARY KEY using index "rental_orders_pkey";

alter table "public"."rental_payment_allocations" add constraint "rental_payment_allocations_pkey" PRIMARY KEY using index "rental_payment_allocations_pkey";

alter table "public"."system_settings" add constraint "system_settings_pkey" PRIMARY KEY using index "system_settings_pkey";

alter table "public"."customer_password_resets" add constraint "customer_password_resets_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.rental_customers(id) ON DELETE CASCADE not valid;

alter table "public"."customer_password_resets" validate constraint "customer_password_resets_customer_id_fkey";

alter table "public"."rental_availability_holds" add constraint "rental_availability_holds_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.rental_customers(id) ON DELETE SET NULL not valid;

alter table "public"."rental_availability_holds" validate constraint "rental_availability_holds_customer_id_fkey";

alter table "public"."rental_availability_holds" add constraint "rental_availability_holds_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.rental_orders(id) ON DELETE SET NULL not valid;

alter table "public"."rental_availability_holds" validate constraint "rental_availability_holds_order_id_fkey";

alter table "public"."rental_availability_holds" add constraint "rental_availability_holds_payment_session_id_fkey" FOREIGN KEY (payment_session_id) REFERENCES public.rental_order_payment_sessions(id) ON DELETE SET NULL not valid;

alter table "public"."rental_availability_holds" validate constraint "rental_availability_holds_payment_session_id_fkey";

alter table "public"."rental_availability_holds" add constraint "rental_availability_holds_qty_check" CHECK ((qty > 0)) not valid;

alter table "public"."rental_availability_holds" validate constraint "rental_availability_holds_qty_check";

alter table "public"."rental_availability_holds" add constraint "rental_availability_holds_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'released'::text, 'consumed'::text]))) not valid;

alter table "public"."rental_availability_holds" validate constraint "rental_availability_holds_status_check";

alter table "public"."rental_customers" add constraint "rental_customers_account_status_check" CHECK ((account_status = ANY (ARRAY['active'::text, 'suspended'::text]))) not valid;

alter table "public"."rental_customers" validate constraint "rental_customers_account_status_check";

alter table "public"."rental_customers" add constraint "rental_customers_payment_terms_check" CHECK ((payment_terms = ANY (ARRAY['upfront'::text, 'credit'::text]))) not valid;

alter table "public"."rental_customers" validate constraint "rental_customers_payment_terms_check";

alter table "public"."rental_customers" add constraint "rental_customers_vetting_status_check" CHECK ((vetting_status = ANY (ARRAY['new'::text, 'under_review'::text, 'pre_vetted'::text, 'rejected'::text]))) not valid;

alter table "public"."rental_customers" validate constraint "rental_customers_vetting_status_check";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_amount_cents_check" CHECK ((amount_cents >= 0)) not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_amount_cents_check";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.rental_customers(id) ON DELETE SET NULL not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_customer_id_fkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_deposit_id_fkey" FOREIGN KEY (deposit_id) REFERENCES public.rental_order_deposits(id) ON DELETE CASCADE not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_deposit_id_fkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.rental_invoices(id) ON DELETE SET NULL not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_invoice_id_fkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_invoice_payment_id_fkey" FOREIGN KEY (invoice_payment_id) REFERENCES public.rental_invoice_payments(id) ON DELETE SET NULL not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_invoice_payment_id_fkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.rental_orders(id) ON DELETE CASCADE not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_order_id_fkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_payment_allocation_id_fkey" FOREIGN KEY (payment_allocation_id) REFERENCES public.rental_payment_allocations(id) ON DELETE SET NULL not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_payment_allocation_id_fkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_payment_session_id_fkey" FOREIGN KEY (payment_session_id) REFERENCES public.rental_order_payment_sessions(id) ON DELETE SET NULL not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_payment_session_id_fkey";

alter table "public"."rental_deposit_transactions" add constraint "rental_deposit_transactions_transaction_type_check" CHECK ((transaction_type = ANY (ARRAY['requirement_created'::text, 'payment_collected'::text, 'released'::text, 'retained'::text, 'adjustment'::text]))) not valid;

alter table "public"."rental_deposit_transactions" validate constraint "rental_deposit_transactions_transaction_type_check";

alter table "public"."rental_equipment" add constraint "rental_equipment_day_rate_check" CHECK ((day_rate >= (0)::numeric)) not valid;

alter table "public"."rental_equipment" validate constraint "rental_equipment_day_rate_check";

alter table "public"."rental_equipment" add constraint "rental_equipment_deposit_amount_check" CHECK ((deposit_amount >= (0)::numeric)) not valid;

alter table "public"."rental_equipment" validate constraint "rental_equipment_deposit_amount_check";

alter table "public"."rental_equipment" add constraint "rental_equipment_maintenance_buffer_days_check" CHECK ((maintenance_buffer_days >= 0)) not valid;

alter table "public"."rental_equipment" validate constraint "rental_equipment_maintenance_buffer_days_check";

alter table "public"."rental_equipment" add constraint "rental_equipment_min_rental_days_check" CHECK ((min_rental_days >= 1)) not valid;

alter table "public"."rental_equipment" validate constraint "rental_equipment_min_rental_days_check";

alter table "public"."rental_equipment" add constraint "rental_equipment_month_rate_check" CHECK (((month_rate IS NULL) OR (month_rate >= (0)::numeric))) not valid;

alter table "public"."rental_equipment" validate constraint "rental_equipment_month_rate_check";

alter table "public"."rental_equipment" add constraint "rental_equipment_slug_key" UNIQUE using index "rental_equipment_slug_key";

alter table "public"."rental_equipment" add constraint "rental_equipment_total_units_check" CHECK ((total_units >= 0)) not valid;

alter table "public"."rental_equipment" validate constraint "rental_equipment_total_units_check";

alter table "public"."rental_equipment" add constraint "rental_equipment_week_rate_check" CHECK (((week_rate IS NULL) OR (week_rate >= (0)::numeric))) not valid;

alter table "public"."rental_equipment" validate constraint "rental_equipment_week_rate_check";

alter table "public"."rental_equipment_downtime" add constraint "rental_equipment_downtime_check" CHECK ((end_date >= start_date)) not valid;

alter table "public"."rental_equipment_downtime" validate constraint "rental_equipment_downtime_check";

alter table "public"."rental_equipment_downtime" add constraint "rental_equipment_downtime_downtime_type_check" CHECK ((downtime_type = ANY (ARRAY['maintenance'::text, 'repair'::text, 'inspection'::text, 'admin_hold'::text, 'internal_use'::text]))) not valid;

alter table "public"."rental_equipment_downtime" validate constraint "rental_equipment_downtime_downtime_type_check";

alter table "public"."rental_equipment_downtime" add constraint "rental_equipment_downtime_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES public.rental_equipment(id) ON DELETE CASCADE not valid;

alter table "public"."rental_equipment_downtime" validate constraint "rental_equipment_downtime_equipment_id_fkey";

alter table "public"."rental_equipment_downtime" add constraint "rental_equipment_downtime_quantity_affected_check" CHECK ((quantity_affected > 0)) not valid;

alter table "public"."rental_equipment_downtime" validate constraint "rental_equipment_downtime_quantity_affected_check";

alter table "public"."rental_equipment_downtime" add constraint "rental_equipment_downtime_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text]))) not valid;

alter table "public"."rental_equipment_downtime" validate constraint "rental_equipment_downtime_status_check";

alter table "public"."rental_invoice_emails" add constraint "rental_invoice_emails_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.rental_invoices(id) ON DELETE CASCADE not valid;

alter table "public"."rental_invoice_emails" validate constraint "rental_invoice_emails_invoice_id_fkey";

alter table "public"."rental_invoice_emails" add constraint "rental_invoice_emails_type_check" CHECK ((type = ANY (ARRAY['sent'::text, 'resent'::text]))) not valid;

alter table "public"."rental_invoice_emails" validate constraint "rental_invoice_emails_type_check";

alter table "public"."rental_invoice_payments" add constraint "rental_invoice_payments_amount_cents_check" CHECK ((amount_cents > 0)) not valid;

alter table "public"."rental_invoice_payments" validate constraint "rental_invoice_payments_amount_cents_check";

alter table "public"."rental_invoice_payments" add constraint "rental_invoice_payments_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.rental_invoices(id) ON DELETE CASCADE not valid;

alter table "public"."rental_invoice_payments" validate constraint "rental_invoice_payments_invoice_id_fkey";

alter table "public"."rental_invoice_payments" add constraint "rental_invoice_payments_source_payment_session_id_fkey" FOREIGN KEY (source_payment_session_id) REFERENCES public.rental_order_payment_sessions(id) ON DELETE SET NULL not valid;

alter table "public"."rental_invoice_payments" validate constraint "rental_invoice_payments_source_payment_session_id_fkey";

alter table "public"."rental_invoices" add constraint "rental_invoices_invoice_no_key" UNIQUE using index "rental_invoices_invoice_no_key";

alter table "public"."rental_invoices" add constraint "rental_invoices_order_id_key" UNIQUE using index "rental_invoices_order_id_key";

alter table "public"."rental_invoices" add constraint "rental_invoices_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'void'::text]))) not valid;

alter table "public"."rental_invoices" validate constraint "rental_invoices_status_check";

alter table "public"."rental_order_buffer_overrides" add constraint "rental_order_buffer_overrides_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.rental_orders(id) ON DELETE CASCADE not valid;

alter table "public"."rental_order_buffer_overrides" validate constraint "rental_order_buffer_overrides_order_id_fkey";

alter table "public"."rental_order_buffer_overrides" add constraint "rental_order_buffer_overrides_order_unit_index_check" CHECK ((order_unit_index >= 0)) not valid;

alter table "public"."rental_order_buffer_overrides" validate constraint "rental_order_buffer_overrides_order_unit_index_check";

alter table "public"."rental_order_buffer_overrides" add constraint "rental_order_buffer_overrides_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text]))) not valid;

alter table "public"."rental_order_buffer_overrides" validate constraint "rental_order_buffer_overrides_status_check";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.rental_customers(id) ON DELETE SET NULL not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_customer_id_fkey";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_held_amount_cents_check" CHECK ((held_amount_cents >= 0)) not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_held_amount_cents_check";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_last_invoice_payment_id_fkey" FOREIGN KEY (last_invoice_payment_id) REFERENCES public.rental_invoice_payments(id) ON DELETE SET NULL not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_last_invoice_payment_id_fkey";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_last_payment_session_id_fkey" FOREIGN KEY (last_payment_session_id) REFERENCES public.rental_order_payment_sessions(id) ON DELETE SET NULL not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_last_payment_session_id_fkey";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_last_resolution_type_check" CHECK ((last_resolution_type = ANY (ARRAY['release'::text, 'retain'::text, 'split'::text]))) not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_last_resolution_type_check";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.rental_orders(id) ON DELETE CASCADE not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_order_id_fkey";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_order_unique" UNIQUE using index "rental_order_deposits_order_unique";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_released_amount_cents_check" CHECK ((released_amount_cents >= 0)) not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_released_amount_cents_check";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_required_amount_cents_check" CHECK ((required_amount_cents >= 0)) not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_required_amount_cents_check";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_retained_amount_cents_check" CHECK ((retained_amount_cents >= 0)) not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_retained_amount_cents_check";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_source_invoice_id_fkey" FOREIGN KEY (source_invoice_id) REFERENCES public.rental_invoices(id) ON DELETE SET NULL not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_source_invoice_id_fkey";

alter table "public"."rental_order_deposits" add constraint "rental_order_deposits_status_check" CHECK ((status = ANY (ARRAY['not_required'::text, 'pending'::text, 'partially_held'::text, 'held'::text, 'partially_released'::text, 'released'::text, 'partially_retained'::text, 'retained'::text]))) not valid;

alter table "public"."rental_order_deposits" validate constraint "rental_order_deposits_status_check";

alter table "public"."rental_order_extensions" add constraint "rental_order_extensions_availability_status_check" CHECK ((availability_status = ANY (ARRAY['unknown'::text, 'available'::text, 'blocked'::text]))) not valid;

alter table "public"."rental_order_extensions" validate constraint "rental_order_extensions_availability_status_check";

alter table "public"."rental_order_extensions" add constraint "rental_order_extensions_extension_charge_estimate_cents_check" CHECK ((extension_charge_estimate_cents >= 0)) not valid;

alter table "public"."rental_order_extensions" validate constraint "rental_order_extensions_extension_charge_estimate_cents_check";

alter table "public"."rental_order_extensions" add constraint "rental_order_extensions_final_extension_charge_cents_check" CHECK (((final_extension_charge_cents IS NULL) OR (final_extension_charge_cents >= 0))) not valid;

alter table "public"."rental_order_extensions" validate constraint "rental_order_extensions_final_extension_charge_cents_check";

alter table "public"."rental_order_extensions" add constraint "rental_order_extensions_payment_terms_snapshot_check" CHECK ((payment_terms_snapshot = ANY (ARRAY['upfront'::text, 'credit'::text]))) not valid;

alter table "public"."rental_order_extensions" validate constraint "rental_order_extensions_payment_terms_snapshot_check";

alter table "public"."rental_order_extensions" add constraint "rental_order_extensions_status_check" CHECK ((status = ANY (ARRAY['availability_blocked'::text, 'awaiting_admin_review'::text, 'rejected'::text, 'approved_pending_payment'::text, 'approved_confirmed'::text, 'cancelled'::text]))) not valid;

alter table "public"."rental_order_extensions" validate constraint "rental_order_extensions_status_check";

alter table "public"."rental_order_payment_sessions" add constraint "rental_order_payment_sessions_amount_cents_check" CHECK ((amount_cents >= 0)) not valid;

alter table "public"."rental_order_payment_sessions" validate constraint "rental_order_payment_sessions_amount_cents_check";

alter table "public"."rental_order_payment_sessions" add constraint "rental_order_payment_sessions_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.rental_invoices(id) ON DELETE SET NULL not valid;

alter table "public"."rental_order_payment_sessions" validate constraint "rental_order_payment_sessions_invoice_id_fkey";

alter table "public"."rental_order_payment_sessions" add constraint "rental_order_payment_sessions_invoice_payment_id_fkey" FOREIGN KEY (invoice_payment_id) REFERENCES public.rental_invoice_payments(id) ON DELETE SET NULL not valid;

alter table "public"."rental_order_payment_sessions" validate constraint "rental_order_payment_sessions_invoice_payment_id_fkey";

alter table "public"."rental_order_payment_sessions" add constraint "rental_order_payment_sessions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.rental_orders(id) ON DELETE CASCADE not valid;

alter table "public"."rental_order_payment_sessions" validate constraint "rental_order_payment_sessions_order_id_fkey";

alter table "public"."rental_order_payment_sessions" add constraint "rental_order_payment_sessions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'cancelled'::text]))) not valid;

alter table "public"."rental_order_payment_sessions" validate constraint "rental_order_payment_sessions_status_check";

alter table "public"."rental_order_reminder_events" add constraint "rental_order_reminder_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.rental_orders(id) ON DELETE CASCADE not valid;

alter table "public"."rental_order_reminder_events" validate constraint "rental_order_reminder_events_order_id_fkey";

alter table "public"."rental_order_reminder_events" add constraint "rental_order_reminder_events_provider_check" CHECK ((provider = ANY (ARRAY['mock'::text, 'resend'::text, 'ses'::text, 'postmark'::text]))) not valid;

alter table "public"."rental_order_reminder_events" validate constraint "rental_order_reminder_events_provider_check";

alter table "public"."rental_order_reminder_events" add constraint "rental_order_reminder_events_reminder_kind_check" CHECK ((reminder_kind = 'return'::text)) not valid;

alter table "public"."rental_order_reminder_events" validate constraint "rental_order_reminder_events_reminder_kind_check";

alter table "public"."rental_order_reminder_events" add constraint "rental_order_reminder_events_reminder_stage_check" CHECK ((reminder_stage = ANY (ARRAY['three_day'::text, 'one_day'::text, 'due_today'::text]))) not valid;

alter table "public"."rental_order_reminder_events" validate constraint "rental_order_reminder_events_reminder_stage_check";

alter table "public"."rental_order_reminder_events" add constraint "rental_order_reminder_events_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text]))) not valid;

alter table "public"."rental_order_reminder_events" validate constraint "rental_order_reminder_events_status_check";

alter table "public"."rental_orders" add constraint "rental_orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.rental_customers(id) ON DELETE SET NULL not valid;

alter table "public"."rental_orders" validate constraint "rental_orders_customer_id_fkey";

alter table "public"."rental_orders" add constraint "rental_orders_fulfillment_check" CHECK ((fulfillment = ANY (ARRAY['deliver'::text, 'self_collect'::text]))) not valid;

alter table "public"."rental_orders" validate constraint "rental_orders_fulfillment_check";

alter table "public"."rental_orders" add constraint "rental_orders_inspection_status_check" CHECK ((inspection_status = ANY (ARRAY['not_started'::text, 'pending'::text, 'passed'::text, 'issues_found'::text]))) not valid;

alter table "public"."rental_orders" validate constraint "rental_orders_inspection_status_check";

alter table "public"."rental_orders" add constraint "rental_orders_maintenance_buffer_days_applied_check" CHECK (((maintenance_buffer_days_applied IS NULL) OR (maintenance_buffer_days_applied >= 0))) not valid;

alter table "public"."rental_orders" validate constraint "rental_orders_maintenance_buffer_days_applied_check";

alter table "public"."rental_orders" add constraint "rental_orders_qty_check" CHECK ((qty > 0)) not valid;

alter table "public"."rental_orders" validate constraint "rental_orders_qty_check";

alter table "public"."rental_orders" add constraint "rental_orders_return_status_check" CHECK ((return_status = ANY (ARRAY['out'::text, 'returned'::text, 'completed'::text]))) not valid;

alter table "public"."rental_orders" validate constraint "rental_orders_return_status_check";

alter table "public"."rental_payment_allocations" add constraint "rental_payment_allocations_amount_cents_check" CHECK ((amount_cents > 0)) not valid;

alter table "public"."rental_payment_allocations" validate constraint "rental_payment_allocations_amount_cents_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.acquire_rental_availability_hold(p_checkout_reference text, p_equipment_id text, p_customer_id uuid, p_qty integer, p_rental_start date, p_rental_end date, p_expires_at timestamp with time zone, p_total_units integer, p_maintenance_buffer_days integer DEFAULT 7)
 RETURNS public.rental_availability_holds
 LANGUAGE plpgsql
AS $function$
declare
  v_existing public.rental_availability_holds%rowtype;
  v_committed_qty integer := 0;
  v_held_qty integer := 0;
  v_downtime_qty integer := 0;
  v_available_qty integer := 0;
  v_buffer_days integer := greatest(coalesce(p_maintenance_buffer_days, 0), 0);
begin
  if coalesce(trim(p_checkout_reference), '') = '' then
    raise exception 'checkout_reference is required';
  end if;

  if coalesce(trim(p_equipment_id), '') = '' then
    raise exception 'equipment_id is required';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be greater than 0';
  end if;

  if p_total_units is null or p_total_units < 0 then
    raise exception 'total_units must be zero or greater';
  end if;

  if p_rental_start is null or p_rental_end is null or p_rental_end < p_rental_start then
    raise exception 'invalid rental date range';
  end if;

  if p_expires_at is null then
    raise exception 'expires_at is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('rental_availability:' || p_equipment_id));

  select *
  into v_existing
  from public.rental_availability_holds h
  where h.checkout_reference = p_checkout_reference
    and h.equipment_id = p_equipment_id
    and h.rental_start = p_rental_start
    and h.rental_end = p_rental_end
    and h.status = 'active'
    and h.expires_at > now()
  order by h.created_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  select coalesce(count(*), 0)
  into v_committed_qty
  from public.rental_orders o
  join lateral generate_series(0, greatest(coalesce(o.qty, 0) - 1, 0)) as unit_idx(i) on true
  left join lateral (
    select bo.override_buffer_end_date
    from public.rental_order_buffer_overrides bo
    where bo.order_id = o.id
      and bo.order_unit_index = unit_idx.i
      and bo.status = 'active'
    order by bo.created_at desc
    limit 1
  ) bo on true
  where o.equipment_id = p_equipment_id
    and o.start_date <= p_rental_end
    and p_rental_start <= greatest(
      o.end_date,
      coalesce(
        bo.override_buffer_end_date,
        o.end_date + coalesce(o.maintenance_buffer_days_applied, v_buffer_days)
      )
    )
    and exists (
      select 1
      from public.rental_invoices i
      where i.order_id = o.id
        and i.status <> 'void'
    );

  select coalesce(sum(h.qty), 0)
  into v_held_qty
  from public.rental_availability_holds h
  where h.equipment_id = p_equipment_id
    and h.status = 'active'
    and h.expires_at > now()
    and h.rental_start <= p_rental_end
    and p_rental_start <= h.rental_end
    and h.checkout_reference <> p_checkout_reference
    and not exists (
      select 1
      from public.rental_invoices i
      where i.order_id = coalesce(h.order_id, h.checkout_reference)
        and i.status <> 'void'
    );

  select coalesce(sum(d.quantity_affected), 0)
  into v_downtime_qty
  from public.rental_equipment_downtime d
  where d.equipment_id = p_equipment_id
    and d.status = 'active'
    and d.start_date <= p_rental_end
    and p_rental_start <= d.end_date;

  v_available_qty := greatest(p_total_units - v_committed_qty - v_held_qty - v_downtime_qty, 0);

  if v_available_qty < p_qty then
    raise exception using
      errcode = 'P0001',
      message = 'INSUFFICIENT_AVAILABILITY',
      detail = json_build_object(
        'availableQty', v_available_qty,
        'requestedQty', p_qty,
        'committedQty', v_committed_qty,
        'heldQty', v_held_qty,
        'downtimeQty', v_downtime_qty,
        'totalUnits', p_total_units
      )::text;
  end if;

  insert into public.rental_availability_holds (
    checkout_reference,
    equipment_id,
    customer_id,
    qty,
    rental_start,
    rental_end,
    status,
    expires_at
  )
  values (
    p_checkout_reference,
    p_equipment_id,
    p_customer_id,
    p_qty,
    p_rental_start,
    p_rental_end,
    'active',
    p_expires_at
  )
  returning *
  into v_existing;

  return v_existing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.developer_delete_rental_order(p_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_order_exists boolean;
  v_invoice_ids uuid[] := '{}';
  v_payment_session_ids uuid[] := '{}';
  v_deposit_ids uuid[] := '{}';
  v_deleted_invoice_emails integer := 0;
  v_deleted_payment_allocations integer := 0;
  v_deleted_extensions integer := 0;
  v_deleted_holds integer := 0;
  v_deleted_invoices integer := 0;
  v_deleted_orders integer := 0;
begin
  select exists(select 1 from public.rental_orders where id = p_order_id)
    into v_order_exists;

  if not v_order_exists then
    return jsonb_build_object(
      'orderId', p_order_id,
      'deleted', false,
      'reason', 'not_found'
    );
  end if;

  select coalesce(array_agg(id), '{}') into v_invoice_ids
  from public.rental_invoices
  where order_id = p_order_id;

  select coalesce(array_agg(id), '{}') into v_payment_session_ids
  from public.rental_order_payment_sessions
  where order_id = p_order_id;

  select coalesce(array_agg(id), '{}') into v_deposit_ids
  from public.rental_order_deposits
  where order_id = p_order_id;

  if coalesce(array_length(v_invoice_ids, 1), 0) > 0 then
    delete from public.rental_invoice_emails
    where invoice_id = any(v_invoice_ids);
    get diagnostics v_deleted_invoice_emails = row_count;
  end if;

  delete from public.rental_payment_allocations
  where (
      coalesce(array_length(v_payment_session_ids, 1), 0) > 0
      and source_type = 'checkout_session'
      and source_id = any(v_payment_session_ids)
    )
    or (
      coalesce(array_length(v_invoice_ids, 1), 0) > 0
      and allocation_type = 'invoice'
      and target_id = any(v_invoice_ids)
    )
    or (
      coalesce(array_length(v_deposit_ids, 1), 0) > 0
      and allocation_type = 'deposit'
      and target_id = any(v_deposit_ids)
    );
  get diagnostics v_deleted_payment_allocations = row_count;

  delete from public.rental_order_extensions
  where order_id = p_order_id;
  get diagnostics v_deleted_extensions = row_count;

  delete from public.rental_availability_holds
  where order_id = p_order_id
    or (
      coalesce(array_length(v_payment_session_ids, 1), 0) > 0
      and payment_session_id = any(v_payment_session_ids)
    );
  get diagnostics v_deleted_holds = row_count;

  if coalesce(array_length(v_invoice_ids, 1), 0) > 0 then
    delete from public.rental_invoices
    where id = any(v_invoice_ids);
    get diagnostics v_deleted_invoices = row_count;
  end if;

  delete from public.rental_orders
  where id = p_order_id;
  get diagnostics v_deleted_orders = row_count;

  return jsonb_build_object(
    'orderId', p_order_id,
    'deleted', v_deleted_orders > 0,
    'invoiceEmailCount', v_deleted_invoice_emails,
    'paymentAllocationCount', v_deleted_payment_allocations,
    'extensionCount', v_deleted_extensions,
    'holdCount', v_deleted_holds,
    'invoiceCount', v_deleted_invoices,
    'orderCount', v_deleted_orders
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_rental_invoice_payment(p_invoice_id uuid, p_amount_cents integer, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(total_cents integer, paid_cents bigint, balance_cents bigint, payment_status text)
 LANGUAGE plpgsql
AS $function$
declare
  v_invoice public.rental_invoices%rowtype;
  v_paid_cents bigint;
  v_total_cents integer;
  v_balance_cents bigint;
begin
  select *
  into v_invoice
  from public.rental_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status <> 'issued' then
    raise exception 'Payments can only be recorded for issued invoices';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amountCents must be greater than 0';
  end if;

  v_total_cents := greatest(coalesce(v_invoice.total_incl_gst_cents, 0), 0);

  select coalesce(sum(amount_cents), 0)
  into v_paid_cents
  from public.rental_invoice_payments
  where invoice_id = p_invoice_id;

  v_balance_cents := greatest(v_total_cents - v_paid_cents, 0);

  if p_amount_cents > v_balance_cents then
    raise exception 'Payment amount exceeds outstanding balance';
  end if;

  insert into public.rental_invoice_payments (
    invoice_id,
    amount_cents,
    paid_at,
    method,
    reference,
    notes
  )
  values (
    p_invoice_id,
    p_amount_cents,
    coalesce(p_paid_at, now()),
    nullif(btrim(p_method), ''),
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), '')
  );

  v_paid_cents := v_paid_cents + p_amount_cents;
  v_balance_cents := greatest(v_total_cents - v_paid_cents, 0);

  total_cents := v_total_cents;
  paid_cents := v_paid_cents;
  balance_cents := v_balance_cents;
  payment_status := case
    when v_balance_cents <= 0 then 'paid'
    when v_invoice.due_date is not null and v_invoice.due_date < now() then 'overdue'
    when v_paid_cents > 0 then 'partially_paid'
    else 'unpaid'
  end;

  return next;
end;
$function$
;

grant delete on table "public"."customer_password_resets" to "anon";

grant insert on table "public"."customer_password_resets" to "anon";

grant references on table "public"."customer_password_resets" to "anon";

grant select on table "public"."customer_password_resets" to "anon";

grant trigger on table "public"."customer_password_resets" to "anon";

grant truncate on table "public"."customer_password_resets" to "anon";

grant update on table "public"."customer_password_resets" to "anon";

grant delete on table "public"."customer_password_resets" to "authenticated";

grant insert on table "public"."customer_password_resets" to "authenticated";

grant references on table "public"."customer_password_resets" to "authenticated";

grant select on table "public"."customer_password_resets" to "authenticated";

grant trigger on table "public"."customer_password_resets" to "authenticated";

grant truncate on table "public"."customer_password_resets" to "authenticated";

grant update on table "public"."customer_password_resets" to "authenticated";

grant delete on table "public"."customer_password_resets" to "service_role";

grant insert on table "public"."customer_password_resets" to "service_role";

grant references on table "public"."customer_password_resets" to "service_role";

grant select on table "public"."customer_password_resets" to "service_role";

grant trigger on table "public"."customer_password_resets" to "service_role";

grant truncate on table "public"."customer_password_resets" to "service_role";

grant update on table "public"."customer_password_resets" to "service_role";

grant delete on table "public"."rental_availability_holds" to "anon";

grant insert on table "public"."rental_availability_holds" to "anon";

grant references on table "public"."rental_availability_holds" to "anon";

grant select on table "public"."rental_availability_holds" to "anon";

grant trigger on table "public"."rental_availability_holds" to "anon";

grant truncate on table "public"."rental_availability_holds" to "anon";

grant update on table "public"."rental_availability_holds" to "anon";

grant delete on table "public"."rental_availability_holds" to "authenticated";

grant insert on table "public"."rental_availability_holds" to "authenticated";

grant references on table "public"."rental_availability_holds" to "authenticated";

grant select on table "public"."rental_availability_holds" to "authenticated";

grant trigger on table "public"."rental_availability_holds" to "authenticated";

grant truncate on table "public"."rental_availability_holds" to "authenticated";

grant update on table "public"."rental_availability_holds" to "authenticated";

grant delete on table "public"."rental_availability_holds" to "service_role";

grant insert on table "public"."rental_availability_holds" to "service_role";

grant references on table "public"."rental_availability_holds" to "service_role";

grant select on table "public"."rental_availability_holds" to "service_role";

grant trigger on table "public"."rental_availability_holds" to "service_role";

grant truncate on table "public"."rental_availability_holds" to "service_role";

grant update on table "public"."rental_availability_holds" to "service_role";

grant delete on table "public"."rental_customers" to "anon";

grant insert on table "public"."rental_customers" to "anon";

grant references on table "public"."rental_customers" to "anon";

grant select on table "public"."rental_customers" to "anon";

grant trigger on table "public"."rental_customers" to "anon";

grant truncate on table "public"."rental_customers" to "anon";

grant update on table "public"."rental_customers" to "anon";

grant delete on table "public"."rental_customers" to "authenticated";

grant insert on table "public"."rental_customers" to "authenticated";

grant references on table "public"."rental_customers" to "authenticated";

grant select on table "public"."rental_customers" to "authenticated";

grant trigger on table "public"."rental_customers" to "authenticated";

grant truncate on table "public"."rental_customers" to "authenticated";

grant update on table "public"."rental_customers" to "authenticated";

grant delete on table "public"."rental_customers" to "service_role";

grant insert on table "public"."rental_customers" to "service_role";

grant references on table "public"."rental_customers" to "service_role";

grant select on table "public"."rental_customers" to "service_role";

grant trigger on table "public"."rental_customers" to "service_role";

grant truncate on table "public"."rental_customers" to "service_role";

grant update on table "public"."rental_customers" to "service_role";

grant delete on table "public"."rental_deposit_transactions" to "anon";

grant insert on table "public"."rental_deposit_transactions" to "anon";

grant references on table "public"."rental_deposit_transactions" to "anon";

grant select on table "public"."rental_deposit_transactions" to "anon";

grant trigger on table "public"."rental_deposit_transactions" to "anon";

grant truncate on table "public"."rental_deposit_transactions" to "anon";

grant update on table "public"."rental_deposit_transactions" to "anon";

grant delete on table "public"."rental_deposit_transactions" to "authenticated";

grant insert on table "public"."rental_deposit_transactions" to "authenticated";

grant references on table "public"."rental_deposit_transactions" to "authenticated";

grant select on table "public"."rental_deposit_transactions" to "authenticated";

grant trigger on table "public"."rental_deposit_transactions" to "authenticated";

grant truncate on table "public"."rental_deposit_transactions" to "authenticated";

grant update on table "public"."rental_deposit_transactions" to "authenticated";

grant delete on table "public"."rental_deposit_transactions" to "service_role";

grant insert on table "public"."rental_deposit_transactions" to "service_role";

grant references on table "public"."rental_deposit_transactions" to "service_role";

grant select on table "public"."rental_deposit_transactions" to "service_role";

grant trigger on table "public"."rental_deposit_transactions" to "service_role";

grant truncate on table "public"."rental_deposit_transactions" to "service_role";

grant update on table "public"."rental_deposit_transactions" to "service_role";

grant delete on table "public"."rental_equipment" to "anon";

grant insert on table "public"."rental_equipment" to "anon";

grant references on table "public"."rental_equipment" to "anon";

grant select on table "public"."rental_equipment" to "anon";

grant trigger on table "public"."rental_equipment" to "anon";

grant truncate on table "public"."rental_equipment" to "anon";

grant update on table "public"."rental_equipment" to "anon";

grant delete on table "public"."rental_equipment" to "authenticated";

grant insert on table "public"."rental_equipment" to "authenticated";

grant references on table "public"."rental_equipment" to "authenticated";

grant select on table "public"."rental_equipment" to "authenticated";

grant trigger on table "public"."rental_equipment" to "authenticated";

grant truncate on table "public"."rental_equipment" to "authenticated";

grant update on table "public"."rental_equipment" to "authenticated";

grant delete on table "public"."rental_equipment" to "service_role";

grant insert on table "public"."rental_equipment" to "service_role";

grant references on table "public"."rental_equipment" to "service_role";

grant select on table "public"."rental_equipment" to "service_role";

grant trigger on table "public"."rental_equipment" to "service_role";

grant truncate on table "public"."rental_equipment" to "service_role";

grant update on table "public"."rental_equipment" to "service_role";

grant delete on table "public"."rental_equipment_downtime" to "anon";

grant insert on table "public"."rental_equipment_downtime" to "anon";

grant references on table "public"."rental_equipment_downtime" to "anon";

grant select on table "public"."rental_equipment_downtime" to "anon";

grant trigger on table "public"."rental_equipment_downtime" to "anon";

grant truncate on table "public"."rental_equipment_downtime" to "anon";

grant update on table "public"."rental_equipment_downtime" to "anon";

grant delete on table "public"."rental_equipment_downtime" to "authenticated";

grant insert on table "public"."rental_equipment_downtime" to "authenticated";

grant references on table "public"."rental_equipment_downtime" to "authenticated";

grant select on table "public"."rental_equipment_downtime" to "authenticated";

grant trigger on table "public"."rental_equipment_downtime" to "authenticated";

grant truncate on table "public"."rental_equipment_downtime" to "authenticated";

grant update on table "public"."rental_equipment_downtime" to "authenticated";

grant delete on table "public"."rental_equipment_downtime" to "service_role";

grant insert on table "public"."rental_equipment_downtime" to "service_role";

grant references on table "public"."rental_equipment_downtime" to "service_role";

grant select on table "public"."rental_equipment_downtime" to "service_role";

grant trigger on table "public"."rental_equipment_downtime" to "service_role";

grant truncate on table "public"."rental_equipment_downtime" to "service_role";

grant update on table "public"."rental_equipment_downtime" to "service_role";

grant delete on table "public"."rental_invoice_emails" to "anon";

grant insert on table "public"."rental_invoice_emails" to "anon";

grant references on table "public"."rental_invoice_emails" to "anon";

grant select on table "public"."rental_invoice_emails" to "anon";

grant trigger on table "public"."rental_invoice_emails" to "anon";

grant truncate on table "public"."rental_invoice_emails" to "anon";

grant update on table "public"."rental_invoice_emails" to "anon";

grant delete on table "public"."rental_invoice_emails" to "authenticated";

grant insert on table "public"."rental_invoice_emails" to "authenticated";

grant references on table "public"."rental_invoice_emails" to "authenticated";

grant select on table "public"."rental_invoice_emails" to "authenticated";

grant trigger on table "public"."rental_invoice_emails" to "authenticated";

grant truncate on table "public"."rental_invoice_emails" to "authenticated";

grant update on table "public"."rental_invoice_emails" to "authenticated";

grant delete on table "public"."rental_invoice_emails" to "service_role";

grant insert on table "public"."rental_invoice_emails" to "service_role";

grant references on table "public"."rental_invoice_emails" to "service_role";

grant select on table "public"."rental_invoice_emails" to "service_role";

grant trigger on table "public"."rental_invoice_emails" to "service_role";

grant truncate on table "public"."rental_invoice_emails" to "service_role";

grant update on table "public"."rental_invoice_emails" to "service_role";

grant delete on table "public"."rental_invoice_payments" to "anon";

grant insert on table "public"."rental_invoice_payments" to "anon";

grant references on table "public"."rental_invoice_payments" to "anon";

grant select on table "public"."rental_invoice_payments" to "anon";

grant trigger on table "public"."rental_invoice_payments" to "anon";

grant truncate on table "public"."rental_invoice_payments" to "anon";

grant update on table "public"."rental_invoice_payments" to "anon";

grant delete on table "public"."rental_invoice_payments" to "authenticated";

grant insert on table "public"."rental_invoice_payments" to "authenticated";

grant references on table "public"."rental_invoice_payments" to "authenticated";

grant select on table "public"."rental_invoice_payments" to "authenticated";

grant trigger on table "public"."rental_invoice_payments" to "authenticated";

grant truncate on table "public"."rental_invoice_payments" to "authenticated";

grant update on table "public"."rental_invoice_payments" to "authenticated";

grant delete on table "public"."rental_invoice_payments" to "service_role";

grant insert on table "public"."rental_invoice_payments" to "service_role";

grant references on table "public"."rental_invoice_payments" to "service_role";

grant select on table "public"."rental_invoice_payments" to "service_role";

grant trigger on table "public"."rental_invoice_payments" to "service_role";

grant truncate on table "public"."rental_invoice_payments" to "service_role";

grant update on table "public"."rental_invoice_payments" to "service_role";

grant delete on table "public"."rental_invoices" to "anon";

grant insert on table "public"."rental_invoices" to "anon";

grant references on table "public"."rental_invoices" to "anon";

grant select on table "public"."rental_invoices" to "anon";

grant trigger on table "public"."rental_invoices" to "anon";

grant truncate on table "public"."rental_invoices" to "anon";

grant update on table "public"."rental_invoices" to "anon";

grant delete on table "public"."rental_invoices" to "authenticated";

grant insert on table "public"."rental_invoices" to "authenticated";

grant references on table "public"."rental_invoices" to "authenticated";

grant select on table "public"."rental_invoices" to "authenticated";

grant trigger on table "public"."rental_invoices" to "authenticated";

grant truncate on table "public"."rental_invoices" to "authenticated";

grant update on table "public"."rental_invoices" to "authenticated";

grant delete on table "public"."rental_invoices" to "service_role";

grant insert on table "public"."rental_invoices" to "service_role";

grant references on table "public"."rental_invoices" to "service_role";

grant select on table "public"."rental_invoices" to "service_role";

grant trigger on table "public"."rental_invoices" to "service_role";

grant truncate on table "public"."rental_invoices" to "service_role";

grant update on table "public"."rental_invoices" to "service_role";

grant delete on table "public"."rental_order_buffer_overrides" to "anon";

grant insert on table "public"."rental_order_buffer_overrides" to "anon";

grant references on table "public"."rental_order_buffer_overrides" to "anon";

grant select on table "public"."rental_order_buffer_overrides" to "anon";

grant trigger on table "public"."rental_order_buffer_overrides" to "anon";

grant truncate on table "public"."rental_order_buffer_overrides" to "anon";

grant update on table "public"."rental_order_buffer_overrides" to "anon";

grant delete on table "public"."rental_order_buffer_overrides" to "authenticated";

grant insert on table "public"."rental_order_buffer_overrides" to "authenticated";

grant references on table "public"."rental_order_buffer_overrides" to "authenticated";

grant select on table "public"."rental_order_buffer_overrides" to "authenticated";

grant trigger on table "public"."rental_order_buffer_overrides" to "authenticated";

grant truncate on table "public"."rental_order_buffer_overrides" to "authenticated";

grant update on table "public"."rental_order_buffer_overrides" to "authenticated";

grant delete on table "public"."rental_order_buffer_overrides" to "service_role";

grant insert on table "public"."rental_order_buffer_overrides" to "service_role";

grant references on table "public"."rental_order_buffer_overrides" to "service_role";

grant select on table "public"."rental_order_buffer_overrides" to "service_role";

grant trigger on table "public"."rental_order_buffer_overrides" to "service_role";

grant truncate on table "public"."rental_order_buffer_overrides" to "service_role";

grant update on table "public"."rental_order_buffer_overrides" to "service_role";

grant delete on table "public"."rental_order_deposits" to "anon";

grant insert on table "public"."rental_order_deposits" to "anon";

grant references on table "public"."rental_order_deposits" to "anon";

grant select on table "public"."rental_order_deposits" to "anon";

grant trigger on table "public"."rental_order_deposits" to "anon";

grant truncate on table "public"."rental_order_deposits" to "anon";

grant update on table "public"."rental_order_deposits" to "anon";

grant delete on table "public"."rental_order_deposits" to "authenticated";

grant insert on table "public"."rental_order_deposits" to "authenticated";

grant references on table "public"."rental_order_deposits" to "authenticated";

grant select on table "public"."rental_order_deposits" to "authenticated";

grant trigger on table "public"."rental_order_deposits" to "authenticated";

grant truncate on table "public"."rental_order_deposits" to "authenticated";

grant update on table "public"."rental_order_deposits" to "authenticated";

grant delete on table "public"."rental_order_deposits" to "service_role";

grant insert on table "public"."rental_order_deposits" to "service_role";

grant references on table "public"."rental_order_deposits" to "service_role";

grant select on table "public"."rental_order_deposits" to "service_role";

grant trigger on table "public"."rental_order_deposits" to "service_role";

grant truncate on table "public"."rental_order_deposits" to "service_role";

grant update on table "public"."rental_order_deposits" to "service_role";

grant delete on table "public"."rental_order_extensions" to "anon";

grant insert on table "public"."rental_order_extensions" to "anon";

grant references on table "public"."rental_order_extensions" to "anon";

grant select on table "public"."rental_order_extensions" to "anon";

grant trigger on table "public"."rental_order_extensions" to "anon";

grant truncate on table "public"."rental_order_extensions" to "anon";

grant update on table "public"."rental_order_extensions" to "anon";

grant delete on table "public"."rental_order_extensions" to "authenticated";

grant insert on table "public"."rental_order_extensions" to "authenticated";

grant references on table "public"."rental_order_extensions" to "authenticated";

grant select on table "public"."rental_order_extensions" to "authenticated";

grant trigger on table "public"."rental_order_extensions" to "authenticated";

grant truncate on table "public"."rental_order_extensions" to "authenticated";

grant update on table "public"."rental_order_extensions" to "authenticated";

grant delete on table "public"."rental_order_extensions" to "service_role";

grant insert on table "public"."rental_order_extensions" to "service_role";

grant references on table "public"."rental_order_extensions" to "service_role";

grant select on table "public"."rental_order_extensions" to "service_role";

grant trigger on table "public"."rental_order_extensions" to "service_role";

grant truncate on table "public"."rental_order_extensions" to "service_role";

grant update on table "public"."rental_order_extensions" to "service_role";

grant delete on table "public"."rental_order_payment_sessions" to "anon";

grant insert on table "public"."rental_order_payment_sessions" to "anon";

grant references on table "public"."rental_order_payment_sessions" to "anon";

grant select on table "public"."rental_order_payment_sessions" to "anon";

grant trigger on table "public"."rental_order_payment_sessions" to "anon";

grant truncate on table "public"."rental_order_payment_sessions" to "anon";

grant update on table "public"."rental_order_payment_sessions" to "anon";

grant delete on table "public"."rental_order_payment_sessions" to "authenticated";

grant insert on table "public"."rental_order_payment_sessions" to "authenticated";

grant references on table "public"."rental_order_payment_sessions" to "authenticated";

grant select on table "public"."rental_order_payment_sessions" to "authenticated";

grant trigger on table "public"."rental_order_payment_sessions" to "authenticated";

grant truncate on table "public"."rental_order_payment_sessions" to "authenticated";

grant update on table "public"."rental_order_payment_sessions" to "authenticated";

grant delete on table "public"."rental_order_payment_sessions" to "service_role";

grant insert on table "public"."rental_order_payment_sessions" to "service_role";

grant references on table "public"."rental_order_payment_sessions" to "service_role";

grant select on table "public"."rental_order_payment_sessions" to "service_role";

grant trigger on table "public"."rental_order_payment_sessions" to "service_role";

grant truncate on table "public"."rental_order_payment_sessions" to "service_role";

grant update on table "public"."rental_order_payment_sessions" to "service_role";

grant delete on table "public"."rental_order_reminder_events" to "anon";

grant insert on table "public"."rental_order_reminder_events" to "anon";

grant references on table "public"."rental_order_reminder_events" to "anon";

grant select on table "public"."rental_order_reminder_events" to "anon";

grant trigger on table "public"."rental_order_reminder_events" to "anon";

grant truncate on table "public"."rental_order_reminder_events" to "anon";

grant update on table "public"."rental_order_reminder_events" to "anon";

grant delete on table "public"."rental_order_reminder_events" to "authenticated";

grant insert on table "public"."rental_order_reminder_events" to "authenticated";

grant references on table "public"."rental_order_reminder_events" to "authenticated";

grant select on table "public"."rental_order_reminder_events" to "authenticated";

grant trigger on table "public"."rental_order_reminder_events" to "authenticated";

grant truncate on table "public"."rental_order_reminder_events" to "authenticated";

grant update on table "public"."rental_order_reminder_events" to "authenticated";

grant delete on table "public"."rental_order_reminder_events" to "service_role";

grant insert on table "public"."rental_order_reminder_events" to "service_role";

grant references on table "public"."rental_order_reminder_events" to "service_role";

grant select on table "public"."rental_order_reminder_events" to "service_role";

grant trigger on table "public"."rental_order_reminder_events" to "service_role";

grant truncate on table "public"."rental_order_reminder_events" to "service_role";

grant update on table "public"."rental_order_reminder_events" to "service_role";

grant delete on table "public"."rental_orders" to "anon";

grant insert on table "public"."rental_orders" to "anon";

grant references on table "public"."rental_orders" to "anon";

grant select on table "public"."rental_orders" to "anon";

grant trigger on table "public"."rental_orders" to "anon";

grant truncate on table "public"."rental_orders" to "anon";

grant update on table "public"."rental_orders" to "anon";

grant delete on table "public"."rental_orders" to "authenticated";

grant insert on table "public"."rental_orders" to "authenticated";

grant references on table "public"."rental_orders" to "authenticated";

grant select on table "public"."rental_orders" to "authenticated";

grant trigger on table "public"."rental_orders" to "authenticated";

grant truncate on table "public"."rental_orders" to "authenticated";

grant update on table "public"."rental_orders" to "authenticated";

grant delete on table "public"."rental_orders" to "service_role";

grant insert on table "public"."rental_orders" to "service_role";

grant references on table "public"."rental_orders" to "service_role";

grant select on table "public"."rental_orders" to "service_role";

grant trigger on table "public"."rental_orders" to "service_role";

grant truncate on table "public"."rental_orders" to "service_role";

grant update on table "public"."rental_orders" to "service_role";

grant delete on table "public"."rental_payment_allocations" to "anon";

grant insert on table "public"."rental_payment_allocations" to "anon";

grant references on table "public"."rental_payment_allocations" to "anon";

grant select on table "public"."rental_payment_allocations" to "anon";

grant trigger on table "public"."rental_payment_allocations" to "anon";

grant truncate on table "public"."rental_payment_allocations" to "anon";

grant update on table "public"."rental_payment_allocations" to "anon";

grant delete on table "public"."rental_payment_allocations" to "authenticated";

grant insert on table "public"."rental_payment_allocations" to "authenticated";

grant references on table "public"."rental_payment_allocations" to "authenticated";

grant select on table "public"."rental_payment_allocations" to "authenticated";

grant trigger on table "public"."rental_payment_allocations" to "authenticated";

grant truncate on table "public"."rental_payment_allocations" to "authenticated";

grant update on table "public"."rental_payment_allocations" to "authenticated";

grant delete on table "public"."rental_payment_allocations" to "service_role";

grant insert on table "public"."rental_payment_allocations" to "service_role";

grant references on table "public"."rental_payment_allocations" to "service_role";

grant select on table "public"."rental_payment_allocations" to "service_role";

grant trigger on table "public"."rental_payment_allocations" to "service_role";

grant truncate on table "public"."rental_payment_allocations" to "service_role";

grant update on table "public"."rental_payment_allocations" to "service_role";

grant delete on table "public"."system_settings" to "anon";

grant insert on table "public"."system_settings" to "anon";

grant references on table "public"."system_settings" to "anon";

grant select on table "public"."system_settings" to "anon";

grant trigger on table "public"."system_settings" to "anon";

grant truncate on table "public"."system_settings" to "anon";

grant update on table "public"."system_settings" to "anon";

grant delete on table "public"."system_settings" to "authenticated";

grant insert on table "public"."system_settings" to "authenticated";

grant references on table "public"."system_settings" to "authenticated";

grant select on table "public"."system_settings" to "authenticated";

grant trigger on table "public"."system_settings" to "authenticated";

grant truncate on table "public"."system_settings" to "authenticated";

grant update on table "public"."system_settings" to "authenticated";

grant delete on table "public"."system_settings" to "service_role";

grant insert on table "public"."system_settings" to "service_role";

grant references on table "public"."system_settings" to "service_role";

grant select on table "public"."system_settings" to "service_role";

grant trigger on table "public"."system_settings" to "service_role";

grant truncate on table "public"."system_settings" to "service_role";

grant update on table "public"."system_settings" to "service_role";


