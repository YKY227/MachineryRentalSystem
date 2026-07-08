# Phase 5E Group Payment and Invoice Plan

## 1. Current Payment and Invoice Assumptions

Phase 5B-5D introduced checkout groups, checkout group lines, and atomic grouped rental holds. Payment, invoices, and child rental orders are still intentionally absent from grouped checkout.

Implementation status:

- Phase 5E MVP uses a separate `rental_checkout_group_payment_sessions` table.
- Group payment links are created from `/rental/checkout-groups/[id]` only while grouped rental holds are active.
- HitPay webhook handling checks group payment sessions first, then falls back to the existing one-order payment session path.
- Child `rental_orders` are created only after provider-verified paid group payment.
- One base rental invoice is created per child rental order.
- Sale payment, sale invoice, sale quantity, extension/damage redesign, and one-item checkout replacement remain out of scope.

Current one-item checkout assumptions:

- `rental_order_payment_sessions` is order-centric. The table and repository require `order_id`, and the TypeScript type exposes `orderId` as required.
- Existing `/api/public/rental/checkout/start-payment` creates or updates a real `rental_order` before creating a HitPay payment session.
- Existing checkout creates one order, one active availability hold keyed by the order checkout reference, one payment session, and then relies on webhook/status reconciliation to complete invoice/deposit/hold consumption.
- Existing credit checkout also creates the rental order before invoice automation.
- Existing `payment-status` reads by `sessionId` or `orderId`, then loads one order, one active invoice for that order, and the order deposit summary.
- Existing HitPay webhook finds a `rental_order_payment_sessions` row by provider payment request id, refreshes provider status, marks the session paid, and runs payment-session automation.
- Existing reconciliation supports `checkout`, `customer_invoice`, and `order_extension` modes only. The default/blank mode means one-order checkout.
- Existing checkout invoice automation assumes one paid session maps to one rental order, creates or reuses one `base_rental` invoice for that order, records one invoice payment, records that order's deposit collection, updates session invoice markers, sends invoice email, and consumes the availability hold by order id.
- Deposit accounting is order-scoped through `rental_order_deposits` and `rental_deposit_transactions`.
- Invoice creation is order-scoped. `rental_invoices.order_id` is required in the current repo model, and extension/damage flows attach later invoices to child rental orders.
- Hold consumption is checkout-reference based in the existing flow. For one-item checkout, the checkout reference is the order id.

Implication: group payment should not be pushed through the existing `rental_order_payment_sessions` checkout path until a group-aware conversion and allocation layer exists.

## 2. Recommended Payment Session Model

### Option A: Reuse `rental_order_payment_sessions` with nullable `checkout_group_id`

Pros:

- Reuses provider lookup, webhook update, admin reconciliation, and payment status patterns.
- Keeps one provider payment session table.

Cons:

- Requires making `order_id` nullable or adding a placeholder order id, which conflicts with current type/repo assumptions.
- Existing webhook automation defaults blank/checkout mode to one-order checkout and would try to invoice a single order.
- Existing admin/customer/session reads assume `session.orderId` is present.
- Harder to isolate group-payment idempotency and manual-review states.

### Option B: Create `rental_checkout_group_payment_sessions`

Pros:

- Preserves existing one-item checkout, invoice, extension, damage, and customer-invoice payment behavior unchanged.
- Avoids nullable `order_id` drift in the order payment session model.
- Allows strict group-scoped idempotency: one active pending provider/currency session per checkout group.
- Allows group-specific webhook/reconciliation to validate holds, create child orders after verified payment, allocate invoice/deposit amounts, and mark manual review without tripping one-order automation.

Cons:

- Requires a parallel provider webhook lookup path.
- Requires new group status and reconciliation UI.
- Payment reporting needs to include both order sessions and group sessions later.

### Option C: Create child rental orders before payment and reuse existing flow

Pros:

- Reuses existing one-order checkout payment, invoice, deposit, and hold consumption machinery.
- Minimal new payment schema.

Cons:

- Violates Strategy B.
- Creates unpaid rental orders that may appear in admin orders, rental calendar, customer account, extension/damage surfaces, and invoice reports as operational bookings.
- One group payment still does not naturally map to multiple existing order sessions.

Recommendation: use Option B. Add a separate `rental_checkout_group_payment_sessions` table and group-aware payment automation. Do not create unpaid child `rental_orders`.

Implemented MVP: Option B.

## 3. Group Payment Idempotency

Rules:

- A checkout group can have at most one active pending HitPay payment session per provider/currency.
- Same amount, usable provider link: return the existing redirect URL.
- Same amount, local pending but provider request missing: block or retry provider creation only if the local session is still explicitly `initializing`.
- Different amount while a pending provider link may still be payable: block with a 409-style response. Do not create a second live link.
- Different amount where provider link is confirmed expired/cancelled: mark old local session `expired` or `superseded`, then create a new session.
- Duplicate submit should be safe under a DB unique index and transaction. If two requests race, one creates the pending row and the other re-reads/reuses or returns a safe conflict.
- Webhook can arrive before the browser returns, after the browser polls status, or more than once. Reconciliation must be idempotent.
- Provider status refresh should be supported from group status page and admin reconcile action.

Suggested statuses:

- `initializing`
- `pending`
- `paid`
- `failed`
- `expired`
- `cancelled`
- `superseded`
- `manual_review`

## 4. Post-Payment Conversion

Verified paid group session should convert the checkout group into operational rental orders.

Conversion design:

- Lock the checkout group row and payment session row.
- Verify payment session is paid, amount and currency match the current group payable total, and the checkout group belongs to the same customer.
- Verify group status is `holds_acquired` or a defined payment-ready status.
- Verify active group holds still exist and are unexpired before conversion.
- Create one child `rental_order` per checkout group line.
- Link each child order back to `checkout_group_id` and `checkout_group_line_id`.
- Link each group line to its child `rental_order_id` and mark it `order_created`.
- Consume each line hold with the new child order id and group payment session id.
- Mark checkout group `paid` or `orders_created` only after all child orders and hold consumption succeed.

Partial failure handling:

- If any child order creation, hold consumption, invoice creation, deposit accounting, or allocation step fails after payment is verified, mark group and session `manual_review`.
- Preserve all successfully created child order links.
- Never silently release paid holds or void created orders automatically.
- Admin manual review should show exactly which line failed and which child records already exist.

## 5. Invoice Strategy

### Option A: One invoice per child rental order

Pros:

- Aligns with current invoice schema and repo assumptions.
- Keeps extension and damage invoices naturally attached to child rental orders later.
- Keeps deposit records order-scoped.
- Admin and customer invoice screens can continue to reason about invoices by order.

Cons:

- One group payment must be allocated across multiple invoices.
- Invoice email strategy needs care to avoid sending many confusing emails at once.

### Option B: One group invoice

Pros:

- Customer receives one invoice for one group payment.
- Simpler customer-facing payment receipt.

Cons:

- Current `rental_invoices` is order-scoped.
- Extension/damage flows later attach to individual rental orders, creating a split model.
- Requires larger invoice schema/reporting/admin changes.

### Option C: Group receipt first, invoices later/manual review

Pros:

- Simplest first paid-group safety path.
- Avoids overfitting invoice allocation before operational testing.

Cons:

- Leaves paid customers without normal invoices until manual/secondary automation.
- Weakens customer account and admin invoice consistency.

Recommendation: Option A for the Phase 5E MVP, but implement after a conversion transaction design is explicit. Create one base rental invoice per child rental order and allocate the one group payment across those invoices deterministically. Use manual review if any invoice/deposit/allocation step cannot complete.

Implemented MVP: Option A. Group invoice payments are recorded with `source_checkout_group_payment_session_id`, and line-level allocations are stored in `rental_checkout_group_payment_allocations`.

## 6. Payment Allocation Strategy

If one group payment covers multiple child orders:

- Compute each line's invoice amount from `payableTotalCents` excluding refundable deposit.
- Compute each line's deposit amount from `depositCents`.
- Group payment amount should equal `sum(line.payableTotalCents + line.depositCents)` if `payableTotalCents` excludes deposit. Confirm current Phase 5 group totals before coding because `displayTotalCents` includes deposit while `payableTotalCents` does not.
- Allocate invoice payments line by line in checkout group line order.
- Record one invoice payment per child invoice using the group payment session id as source.
- Use a new allocation/link table if existing `source_payment_session_id` uniqueness cannot represent one session across multiple invoices.
- Record one deposit collection transaction per child order using that line's deposit amount.
- GST should come from each line's authoritative pricing snapshot.
- Delivery/collection fees should stay on the line invoice produced from that line's pricing snapshot.
- Rounding should be handled by integer cents in group lines; any residual cent should be assigned to the final line and logged in metadata.

## 7. Hold Expiry and Payment Timing

Rules:

- Do not create a payment link unless group holds are active and unexpired.
- Payment link expiry should be no later than hold expiry if HitPay supports expiry/cancellation.
- Status page should block payment if hold expiry has passed.
- If customer pays after hold expiry, webhook must not create child orders automatically. Mark session/group `manual_review` with reason `paid_after_hold_expiry`.
- If provider link can be expired/cancelled, expire it when holds expire or group is cancelled.
- If provider link cannot be safely expired, block new links and surface manual review.
- Provider return/status polling should refresh provider state but should not mark paid without provider/webhook verification.

Manual review cases:

- Paid after hold expiry.
- Paid amount/currency mismatch.
- Paid group with missing or released holds.
- Duplicate paid sessions for one group.
- Child order creation partially failed.
- Invoice/deposit allocation partially failed.
- Provider status unknown after local pending session exists.

## 8. Required Schema Changes

Recommended migrations:

- Add `rental_checkout_group_payment_sessions`.
- Add group payment/session linkage fields on checkout group and group lines where needed.
- Add child order linkage fields after confirming downstream surfaces tolerate nullable columns.
- Add allocation table for group payment to child invoices/orders.

Proposed `rental_checkout_group_payment_sessions` fields:

- `id uuid primary key default gen_random_uuid()`
- `checkout_group_id uuid not null references rental_checkout_groups(id) on delete cascade`
- `provider text not null`
- `provider_payment_request_id text null`
- `provider_reference_number text null`
- `amount_cents integer not null check (amount_cents >= 0)`
- `currency text not null default 'SGD'`
- `status text not null check (...)`
- `payment_purpose text null`
- `redirect_url text null`
- `webhook_payload jsonb null`
- `paid_at timestamptz null`
- `converted_at timestamptz null`
- `manual_review_reason text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes and constraints:

- Unique `(provider, provider_payment_request_id)` where provider request id is not null.
- Unique active pending `(checkout_group_id, provider, currency)` where status in `('initializing', 'pending')`.
- Index `(checkout_group_id, created_at desc)`.
- Index `(status, created_at desc)`.

Proposed checkout group fields:

- `payment_session_id uuid null references rental_checkout_group_payment_sessions(id) on delete set null`
- `paid_at timestamptz null`
- `converted_at timestamptz null`
- Add reserved future statuses only when implemented: `payment_pending`, `paid`, `orders_created`.

Proposed checkout group line fields:

- `rental_order_id text null references rental_orders(id) on delete set null`
- `invoice_id uuid null references rental_invoices(id) on delete set null`
- `invoice_payment_id uuid null references rental_invoice_payments(id) on delete set null`
- Add line statuses only when implemented: `order_created`, `invoice_created`, `converted`.

Proposed child order linkage:

- Add nullable `checkout_group_id uuid` to `rental_orders`.
- Add nullable `checkout_group_line_id uuid` to `rental_orders`.
- Add indexes on both fields.

Proposed allocation table:

- `rental_checkout_group_payment_allocations`
- `id uuid primary key default gen_random_uuid()`
- `checkout_group_payment_session_id uuid not null`
- `checkout_group_id uuid not null`
- `checkout_group_line_id uuid not null`
- `rental_order_id text not null`
- `invoice_id uuid not null`
- `invoice_payment_id uuid null`
- `invoice_amount_cents integer not null`
- `deposit_amount_cents integer not null`
- `total_allocated_cents integer not null`
- `created_at timestamptz not null default now()`
- Unique `(checkout_group_payment_session_id, checkout_group_line_id)`.

## 9. Required API Changes

Recommended endpoints:

- `POST /api/public/rental/checkout-groups/[id]/payment-session`
  - Customer-authenticated.
  - Revalidates group ownership, group status, active holds, expiry, amount, and currency.
  - Creates or reuses a group payment session.
  - Returns HitPay redirect URL.

- `GET /api/public/rental/checkout-groups/[id]/payment-status`
  - Customer-authenticated.
  - Reads group, group lines, payment session, provider/refreshed status if requested, conversion status, child orders, invoices, and manual review state.

- HitPay webhook update:
  - First look up group payment session by provider request id.
  - If found, run group payment reconciliation.
  - Otherwise fall back to existing order payment session lookup.

- `POST /api/admin/rental/checkout-groups/[id]/reconcile`
  - Admin-only.
  - Refreshes provider status and reruns group conversion/allocation where safe.

## 10. Admin and Customer UX

Customer:

- `/rental/checkout-groups/[id]` should show a payment button only when holds are active, group is payment-ready, and no unsafe pending session exists.
- Show clear states: holds acquired, payment pending, paid converting, confirmed, manual review, expired, cancelled.
- After conversion, show child rental order links and invoice links.
- If webhook is delayed, show "Payment received by provider is being confirmed" only after provider refresh confirms paid.

Admin:

- Add checkout group list/detail.
- Show customer, group status, hold expiry, payment session, provider reference, total amount, line statuses, child order links, invoice links, and allocation status.
- Manual review panel should show reason, failed stage, created records, missing records, and safe next actions.

## 11. Failure Recovery

- Payment created but provider redirect missing: keep session `initializing` briefly, allow provider status refresh, then mark `failed` or `manual_review`.
- Paid webhook arrives twice: reconciliation must detect existing conversion/allocation records and return already applied.
- Paid webhook after hold expiry: mark `manual_review`; do not create orders automatically.
- Child order creation partially fails: mark group/session `manual_review`; preserve created child orders and line-level markers.
- Invoice creation partially fails: mark `manual_review`; do not reallocate payment blindly.
- Hold consumption fails: mark `manual_review` after recording which holds remain active.
- Duplicate payment link attempts: use unique active pending constraint; second request reuses same usable link or returns conflict.
- Customer refreshes status before webhook: status endpoint can refresh provider status and, if paid, invoke reconciliation with the same idempotency guards.

## 12. Implementation Sub-Phases

### 5E-1 Schema and Repo

- Add `rental_checkout_group_payment_sessions`.
- Add group payment status fields.
- Add nullable group/line linkage fields for future child orders.
- Add allocation table.
- Add typed repo methods for create/reuse/read/update/reconcile markers.

Status: implemented.

### 5E-2 Create Group Payment Link

- Add customer endpoint to create/reuse group payment session.
- Revalidate group ownership, active holds, expiry, amount, and currency.
- Create HitPay request with redirect to group status page.
- Enforce pending-session idempotency and stale-link blocking.

Status: implemented.

### 5E-3 Payment Status and Webhook Reconciliation

- Add group payment status endpoint.
- Extend HitPay webhook to route provider request ids to group sessions before falling back to order sessions.
- Add group-aware reconciliation with manual-review guards.

Status: implemented.

### 5E-4 Post-Payment Child Order Creation

- Convert paid, unexpired, fully held group lines into child rental orders.
- Link orders to group and lines.
- Consume holds.
- Mark incomplete conversion as manual review.

Status: implemented.

### 5E-5 Invoice and Deposit Allocation

- Create one base rental invoice per child order.
- Allocate group payment across child invoices.
- Record deposit held per child order.
- Mark allocation idempotency and invoice/deposit completion per line.

Status: implemented for the MVP with one invoice payment per child invoice and per-order deposit collection markers.

### 5E-6 Admin and Customer Visibility

- Add admin checkout group list/detail and reconcile action.
- Upgrade customer group status page with payment/conversion states, child order links, and invoice links.

Status: partially implemented. Customer group status has payment/conversion states, payment action, manual-review messaging, and child order links. Admin checkout group list/detail remains a follow-up.

## 13. Explicit Non-Goals

Phase 5E should not implement:

- Sale payment.
- Sale invoice.
- Sale quantity.
- Generalized order-line refactor.
- Extension/damage redesign.
- Replacement of existing one-item checkout.
- Unpaid child rental orders.
