# Phase 5 Multi-Rental Checkout Group Plan

## 1. Current State

Phase 4A and Phase 4B establish the enquiry/cart foundation without changing rental checkout internals.

- Phase 4A adds the public Buy enquiry flow and admin Sale Enquiries workflow.
- Phase 4B adds a browser localStorage cart using `rental_cart_v1`.
- The cart can contain rental lines and sale enquiry lines.
- Rental cart lines can currently proceed one at a time to the existing `/rental/checkout` query-string flow.
- Sale cart lines submit purchase enquiries only through the Phase 4A sale enquiry API.
- Existing rental checkout still creates one rental order/payment path for one equipment item.
- There is no combined checkout, checkout group, DB cart table, sale payment, sale invoice, or sale quantity.

Implementation status as of Phase 5B-5D:

- `rental_checkout_groups` and `rental_checkout_group_lines` have been added for multi-rental checkout attempts.
- `rental_availability_holds` now has nullable checkout group and checkout group line linkage.
- Strategy B is in use: checkout group lines are created first, and `rental_orders` are not created in this phase.
- The public cart can select rental lines and request grouped hold acquisition.
- A read-only customer checkout group page shows group status, line status, totals, and hold expiry.
- Grouped checkout still has no payment button and does not create orders, invoices, payment sessions, sale quantities, or checkout groups for sale lines.

## 2. Phase 5 Goal

Phase 5 should enable multiple rental cart lines to be checked out together while leaving sale lines as enquiry/admin-confirmation items.

Goals:

- Let a customer select multiple rental cart lines for one grouped rental checkout.
- Create a checkout group as the customer-facing checkout container.
- Link the group to child rental orders or pending rental order records.
- Acquire rental holds for every rental line all-or-nothing.
- If any rental line fails availability, release or roll back all acquired holds.
- Create at most one active payment path for the checkout group.
- Keep sale cart lines out of payment in Phase 5.

## 3. Non-Goals

Phase 5 should not introduce:

- Sale payment.
- Sale invoice.
- Sale quantity.
- Generalized order-line refactor across all rental and sale concepts.
- Extension or damage flow redesign.
- Rental deposit redesign unless a group-level payment total cannot be represented safely.
- Replacement of the existing one-equipment checkout path during the MVP.

## 4. Proposed Data Model

Recommended new tables:

- `rental_checkout_groups`
- `rental_checkout_group_lines`

### `rental_checkout_groups`

Proposed fields:

- `id uuid primary key default gen_random_uuid()`
- `customer_id text nullable` or matching current customer id type
- `customer_name text not null`
- `customer_email text not null`
- `customer_phone text nullable`
- `company_name text nullable`
- `status text not null default 'draft'`
- `currency text not null default 'SGD'`
- `rental_subtotal_cents integer not null default 0`
- `delivery_fee_cents integer not null default 0`
- `collection_fee_cents integer not null default 0`
- `gst_cents integer not null default 0`
- `deposit_cents integer not null default 0`
- `payable_total_cents integer not null default 0`
- `display_total_cents integer not null default 0`
- `payment_session_id uuid nullable`
- `provider_payment_request_id text nullable`
- `hold_group_id uuid nullable`
- `hold_expires_at timestamptz nullable`
- `child_order_ids jsonb not null default '[]'::jsonb`
- `failure_reason text nullable`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested statuses:

- `draft`
- `validating`
- `holds_acquired`
- `payment_pending`
- `paid`
- `payment_failed`
- `expired`
- `cancelled`
- `manual_review`

### `rental_checkout_group_lines`

Proposed fields:

- `id uuid primary key default gen_random_uuid()`
- `checkout_group_id uuid not null references rental_checkout_groups(id)`
- `line_index integer not null`
- `equipment_id text not null references rental_equipment(id)`
- `equipment_title_snapshot text not null`
- `equipment_image_url_snapshot text nullable`
- `pricing_snapshot jsonb not null`
- `qty integer not null`
- `start_date date not null`
- `end_date date not null`
- `fulfillment text not null`
- `delivery_address text nullable`
- `rental_subtotal_cents integer not null default 0`
- `delivery_fee_cents integer not null default 0`
- `collection_fee_cents integer not null default 0`
- `gst_cents integer not null default 0`
- `deposit_cents integer not null default 0`
- `payable_total_cents integer not null default 0`
- `display_total_cents integer not null default 0`
- `hold_id uuid nullable`
- `rental_order_id text nullable`
- `status text not null default 'pending'`
- `failure_reason text nullable`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested line statuses:

- `pending`
- `hold_acquired`
- `order_created`
- `paid`
- `failed`
- `released`
- `cancelled`

Indexes:

- `rental_checkout_groups(status, created_at desc)`
- `rental_checkout_groups(customer_id, created_at desc)`
- `rental_checkout_group_lines(checkout_group_id, line_index)`
- `rental_checkout_group_lines(equipment_id, start_date, end_date)`
- `rental_checkout_group_lines(rental_order_id)`
- `rental_checkout_group_lines(hold_id)`

## 5. Child Rental Order Strategy

Recommended MVP: create child rental orders after all holds are acquired and before payment session creation, with a clear `checkout_group_id` linkage.

Option A: each rental cart line becomes a child `rental_order` under the checkout group.

Pros:

- Preserves existing order-centric admin, calendar, invoice, deposit, extension, and damage workflows.
- Reduces the need to refactor downstream rental operations immediately.
- Keeps each equipment/date/quantity rental line independently operable after payment.

Cons:

- Payment and invoice logic must understand that several orders can be funded by one group payment.
- Partial post-payment failures require careful reconciliation.
- Existing assumptions that one payment session maps to one order may need guarded changes.

Option B: lines remain checkout group lines first, then become `rental_order` records only after payment.

Pros:

- Avoids creating unpaid orders that may never convert.
- Keeps failed/abandoned group attempts out of operational order lists.
- Lets payment truth finalize before operational order creation.

Cons:

- Existing checkout may rely on order creation before payment.
- Webhook processing becomes responsible for converting group lines to orders.
- Calendar/admin visibility before payment is weaker unless holds are displayed separately.

Recommendation:

- Prefer Option A only if child orders can be created in a pending/payment-pending state that existing admin and calendar screens already handle safely.
- If current order screens assume all orders are operationally active, use Option B for MVP and introduce explicit group-line visibility for pending checkouts.
- Before coding, audit existing order status semantics and payment-session linkage to choose the safer route.

## 6. Atomic Hold Strategy

The hold acquisition path is the critical Phase 5 safety boundary.

Preferred approach:

- Implement a Supabase/Postgres RPC that runs in one database transaction.
- Input: checkout group id, customer/session id, and normalized rental line array.
- Re-read equipment availability inside the transaction.
- Validate every line first:
  - equipment exists and is published
  - quantity is positive
  - date range is valid
  - fulfillment is allowed
  - requested quantity can fit after existing bookings, active holds, downtime, and lock rules
- Insert holds only if every line passes validation.
- Return all hold ids and a shared `hold_group_id`.

Required behavior:

- If any line fails availability, no holds remain.
- If hold insertion partially fails, the transaction rolls back.
- The RPC should be idempotent for a checkout group that already has active holds.
- A group should not acquire a second set of holds unless the first set has been explicitly released or expired.
- Add a unique constraint or lock around active hold acquisition per checkout group.

Concurrency notes:

- Use row locks or advisory locks around equipment/date availability checks.
- Lock ordering should be deterministic by equipment id to reduce deadlock risk.
- Expired holds should be ignored or released inside the same transaction.
- Duplicate browser submissions should return the existing active group/holds instead of creating another set.

## 7. Checkout Flow

Proposed customer flow:

1. Customer opens `/rental/cart`.
2. Customer selects rental items and clicks `Checkout selected rental items`.
3. Checkout page collects or confirms customer/contact details.
4. Server receives cart line payload and revalidates every line against current equipment records.
5. Server creates `rental_checkout_groups` with status `validating`.
6. Server creates `rental_checkout_group_lines` with authoritative snapshots and pricing.
7. Server calls atomic hold RPC for all rental lines.
8. If holds succeed, server links hold ids and sets group status to `holds_acquired`.
9. Server creates child rental orders or keeps pending group lines, depending on the selected strategy.
10. Server creates one payment session for the checkout group if payment is part of the Phase 5 MVP.
11. Customer is redirected to payment or group review/status.

Sale cart lines:

- Remain visible in the cart.
- Continue to submit Phase 4A sale enquiries.
- Are not included in group payment totals.

## 8. Payment and Invoice Strategy

Payment options:

Option A: one group payment session.

Pros:

- Customer pays once for multiple rental lines.
- Simplifies customer UX.
- Aligns with the checkout group concept.

Cons:

- Existing payment-session code may assume one order id.
- Webhook allocation must distribute one payment across child orders or group lines.
- Refunds, deposits, extensions, and damage invoices must avoid assuming the original payment maps to one order.

Option B: one payment session per child order.

Pros:

- Preserves existing one-order payment assumptions.
- Less risk to existing invoice/payment allocation code.

Cons:

- Poor customer UX for multi-rental checkout.
- Creates multiple payment links and higher abandonment risk.
- Does not fully deliver grouped checkout.

Invoice options:

- One group invoice covering all child rental orders.
- One invoice per child rental order.
- No invoice at checkout, only payment receipt, with invoices generated after payment.

Recommended safer MVP:

- Create one group payment session.
- Keep child rental order invoices separate only if existing invoice code can link each invoice to the group payment allocation safely.
- If invoice assumptions are tightly coupled to one order, delay invoice automation for checkout groups and use a group receipt/manual review path until allocation is designed.

Existing assumptions likely to break:

- Payment sessions with exactly one `order_id`.
- Invoice kinds tied to one base rental order.
- Deposit accounting tied to one rental order.
- Admin invoice detail expecting one order context.
- Customer account views listing payments by one order.

## 9. Admin UX

Add admin visibility before enabling public grouped checkout broadly.

Recommended admin pages:

- Checkout group list.
- Checkout group detail.

Group list should show:

- Group id/reference.
- Customer name/email.
- Status.
- Number of rental lines.
- Payment status.
- Hold status.
- Total payable estimate.
- Created date.

Group detail should show:

- Customer/contact details.
- Each rental line with equipment, dates, quantity, fulfillment, pricing, hold id, and child order link.
- Hold expiration and release state.
- Payment session/provider reference.
- Failure reason and manual review notes.
- Actions to release holds, cancel group, retry payment session, or mark manual review where safe.

Manual review states should cover:

- Payment received but order creation incomplete.
- Payment received for an expired group.
- Hold acquisition succeeded but payment session creation failed.
- Webhook status conflicts.
- Partial child order linkage.

## 10. Customer Account UX

Customer-facing account pages should avoid hiding the grouped nature of the purchase.

Possible display model:

- Show checkout group summary with total paid/payable and status.
- Show child rental orders beneath the group.
- Link each child order to its existing order detail/extension flows after payment.
- Show invoice links only when invoice allocation is authoritative.
- Show payment status at the group level.

Guest flow:

- Group status page should load by group/session reference without requiring account login.
- Customer account can later claim or display the group if email/customer id matches existing account rules.

## 11. Failure and Recovery

Hold acquisition failure:

- Return line-level availability errors.
- Do not leave any active holds.
- Keep the local cart unchanged so customer can edit/remove lines.

Partial order creation failure:

- Put group in `manual_review`.
- Release holds only if no payment session has been created or paid.
- If payment might be paid, block automatic release until reviewed.

Payment session creation failure:

- Release holds if no payable link exists.
- Mark group `payment_failed` or `manual_review` depending on whether provider state is known.

Customer abandons payment:

- Group remains `payment_pending` until hold expiry.
- Scheduled cleanup expires group and releases holds.
- Customer retry can reacquire holds if availability still exists.

Expired holds:

- Payment attempts after hold expiry should be blocked or sent to manual review.
- Provider links should be expired/cancelled when possible.

Webhook delay:

- Webhook remains payment-authoritative.
- Group status page should poll payment status but not mark paid without verified provider/webhook state.

Duplicate payment session attempt:

- Enforce one active pending group payment session per checkout group/provider/currency.
- Reuse same-amount active session if provider link is usable.
- Block new link if an older payable link cannot be expired safely.

Retry behavior:

- Retry validation from current equipment data.
- Reprice before reacquiring holds.
- Preserve old failed group attempts for audit instead of overwriting history.

## 12. Migration and Compatibility

Phase 5 must avoid breaking current rental operations.

Compatibility rules:

- Keep existing one-equipment checkout route working unchanged during rollout.
- Do not require checkout groups for existing rental orders.
- Add nullable `checkout_group_id` linkage to rental orders only after validating downstream code tolerates null.
- Do not change existing invoice kinds for base rental, extension, damage, or deposit flows without a separate migration plan.
- Keep deposits represented per child rental order unless a group-level deposit model is explicitly designed.
- Ensure admin order screens can render child orders without needing the group record.
- Ensure rental calendar continues to read orders/holds consistently.
- Keep extension and damage invoices attached to child rental orders, not the checkout group, unless a future generalized invoice model is introduced.

Migration sequencing:

- Add group tables first.
- Add nullable linkage columns and indexes second.
- Backfill nothing for existing orders unless needed for reporting.
- Keep old checkout path untouched.
- Gate public multi-rental checkout behind a narrow UI/API path until manual smoke tests pass.

## 13. Implementation Plan

### Phase 5A: Doc and Audit

- Audit current checkout, payment session, invoice, hold RPC, order repository, calendar, admin order, customer account, extension, and damage flows.
- Confirm whether existing order statuses support unpaid child orders.
- Confirm whether payment session schema can reference a checkout group.
- Write migration pre-check SQL.

### Phase 5B: Schema and Repos

Status: implemented for checkout-group and group-line storage only.

- Add `rental_checkout_groups`.
- Add `rental_checkout_group_lines`.
- Add nullable group linkage to `rental_availability_holds`.
- Do not add group linkage to rental orders/payment sessions yet.
- Add repositories and type mappings.
- Add customer-readable group/line read models.

### Phase 5C: API Create Checkout Group and Atomic Holds

Status: implemented without payment.

- Add server endpoint for grouped checkout creation.
- Revalidate cart lines server-side.
- Reprice every line authoritatively.
- Implement transactional hold RPC.
- Store hold ids on group lines and checkout-group linkage on holds.
- Return line-level validation errors without side effects.
- Do not create orders, invoices, payment sessions, or sale records.

### Phase 5D: Cart Page Multi-Rental Checkout Action

Status: implemented.

- Add selected-rental-lines UI.
- Add `Checkout selected rental items`.
- Keep one-item checkout fallback available during rollout.
- Keep sale lines excluded and labelled as enquiries.
- Show temporary-hold success/failure state and a read-only checkout group link.

### Phase 5E: Payment and Invoice Integration

- Add group payment session creation only after holds are acquired.
- Add webhook handling for checkout group payment status.
- Decide invoice MVP: group receipt/manual review, separate child invoices, or group invoice.
- Add idempotency constraints for group payment sessions.

Status: implemented as Phase 5E MVP with separate checkout group payment sessions, group-specific HitPay webhook routing, post-payment child rental order creation, one invoice per child order, and manual-review guards for unsafe conversion states.

### Phase 5F: Admin and Customer Visibility

- Add admin checkout group list/detail.
- Add customer group status page.
- Link child rental orders.
- Add cleanup/retry/manual review states.

## 14. Open Questions

- Should Phase 5 create one invoice for the checkout group or one invoice per child rental order?
- Should Phase 5 create one payment session for the group or one payment session per child order?
- Should child rental orders be created before payment, after payment, or only after webhook confirmation?
- How should refundable deposits be represented across multiple rental lines?
- Should delivery and collection fees be per line, per delivery address, or grouped by address/date?
- Can one checkout group contain rental lines with different delivery addresses?
- Should all grouped rental lines require the same customer account?
- How long should grouped checkout holds last?
- Should expired group payment links be actively cancelled with the payment provider?
- Should the existing one-item checkout eventually become a single-line checkout group internally?
- What admin action should recover a paid group where one child order failed to create?
