# Migration Log

## How to use this log
- Add one entry in the same PR whenever code changes data source, schema/SQL, API routes, auth/security, or invoice/pdf/email flows.
- Keep each summary to 1-2 lines and list only concrete file paths that changed.
- Prefer appending entries in chronological order; do not rewrite older entries unless they are incorrect.
- Use `npm run log:migration -- --scope "<module>"` to append a new entry template quickly.
- Keep checklists practical: 3-6 manual checks that can be run by QA/developers.

## 2026-03-06 | Scope: rental admin auth + db-first orders/invoices/send-resend
Summary:
- Admin APIs now use cookie-based server auth, rental orders are DB-first via Supabase, invoice creation is orderId-only, and send/resend reuses stored PDFs with DB-backed email history.

Files changed:
- `src/lib/auth/admin.ts`
- `src/app/api/admin/auth/token/route.ts`
- `src/app/admin/login/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/api/admin/rental/orders/route.ts`
- `src/app/api/admin/rental/orders/[id]/route.ts`
- `src/app/api/admin/rental/orders/import-local/route.ts`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/app/admin/rental/orders/page.tsx`
- `src/app/api/admin/rental/invoices/route.ts`
- `src/app/api/admin/rental/invoices/send/route.ts`
- `src/app/api/admin/rental/invoices/[id]/route.ts`
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `src/app/api/public/rental/orders/route.ts`
- `src/app/rental/checkout/page.tsx`
- `docs/sql/rental_orders.sql`

DB/Infra changes:
- Added SQL for `rental_orders` table with indexes in `docs/sql/rental_orders.sql`.
- Invoice send route updates `rental_invoices.pdf_storage` and inserts rows into `rental_invoice_emails`.
- Requires server env: `ADMIN_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`.

API changes:
- Added `POST/DELETE /api/admin/auth/token` for admin cookie session set/clear.
- Added protected admin rental orders APIs: `GET/POST/DELETE /api/admin/rental/orders`, `GET /api/admin/rental/orders/[id]`, `POST /api/admin/rental/orders/import-local` (dev only).
- Added `POST /api/public/rental/orders` for checkout DB persistence.
- Changed `POST /api/admin/rental/invoices` body to `{ orderId }`.
- `POST /api/admin/rental/invoices/send` uses `{ invoiceId, to, cc, subject, message, mode? }` and returns `pdf.source` (`generated` or `stored`).

Manual test checklist:
- [ ] Admin login sets cookie via `/api/admin/auth/token`; unauthorized `/api/admin/**` returns 401 when logged out.
- [ ] Open `/admin/rental/orders` and verify list is loaded from DB and survives refresh.
- [ ] Create/View invoice from Orders page and confirm request body is `{ orderId }`.
- [ ] First send from invoice detail returns `pdf.source = "generated"` and creates one `rental_invoice_emails` row.
- [ ] Resend from invoice detail returns `pdf.source = "stored"` and appends another `rental_invoice_emails` row.
- [ ] Refresh invoice detail page and confirm email history + PDF metadata remain visible.

Rollback notes:
- Revert affected API routes/pages/repos in this entry and restore prior localStorage-only order flow plus pre-cookie admin auth.

## 2026-03-06 | Scope: rental invoice payments v1
Summary:
- Added DB-first invoice payment recording with derived payment status/totals and surfaced it on the admin invoice detail page only.

Files changed:
- `docs/sql/rental_invoice_payments.sql`
- `src/lib/rental/invoices/types.ts`
- `src/lib/rental/invoices/db-payment-repo.ts`
- `src/app/api/admin/rental/invoices/[id]/payments/route.ts`
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added SQL for `rental_invoice_payments` with `invoice_id` FK, positive `amount_cents` check, and `(invoice_id, paid_at desc)` index.
- Requires running `docs/sql/rental_invoice_payments.sql` in Supabase SQL Editor before using the payments API.

API changes:
- Added protected `GET /api/admin/rental/invoices/[id]/payments` returning `{ payments, totals }`.
- Added protected `POST /api/admin/rental/invoices/[id]/payments` to record payments for issued invoices only; rejects overpayment and non-positive amounts.

Manual test checklist:
- [ ] Run `docs/sql/rental_invoice_payments.sql` in Supabase SQL Editor.
- [ ] Open an issued invoice with no payments and confirm the page shows `Unpaid`, total paid `SGD 0.00`, and full balance outstanding.
- [ ] Record a partial payment and confirm the page updates to `Partially Paid` with the correct remaining balance after refresh.
- [ ] Record the remaining balance and confirm the page updates to `Paid` with balance `SGD 0.00` after refresh.
- [ ] Set an issued invoice due date in the past with remaining balance and confirm the page shows `Overdue`.
- [ ] Confirm draft and void invoices do not show a usable payment form, and POST requests to the payments API for them are rejected.
- [ ] Attempt an overpayment and confirm the API rejects it with no extra payment row inserted.

## 2026-03-07 | Scope: rental invoice payments concurrency hardening
Summary:
- Moved invoice payment write validation into a Postgres function that locks the invoice row and atomically rejects overpayment during concurrent submits.

Files changed:
- `docs/sql/rental_invoice_payments_atomic.sql`
- `src/lib/rental/invoices/db-payment-repo.ts`
- `docs/migration-log.md`

DB / Infra changes:
- Added `public.record_rental_invoice_payment(...)` to lock the target invoice row with `FOR UPDATE`, validate issued-only payments, compute outstanding inside the transaction, insert the payment, and return updated totals/status.
- Requires running `docs/sql/rental_invoice_payments_atomic.sql` in Supabase SQL Editor before using the hardened write path.

API changes:
- `POST /api/admin/rental/invoices/[id]/payments` now records payments through the DB function-backed repo path instead of app-only read-then-insert validation.
- `GET /api/admin/rental/invoices/[id]/payments` is unchanged.

Manual test checklist:
- [ ] Run `docs/sql/rental_invoice_payments_atomic.sql` in Supabase SQL Editor.
- [ ] Record a normal payment on an issued invoice and confirm the existing invoice detail UI still updates correctly.
- [ ] Submit two near-simultaneous payment POST requests whose combined amount exceeds outstanding balance; confirm only one succeeds and no over-collection occurs.
- [ ] Confirm overpayment is rejected even when the request reaches the DB write path directly.
- [ ] Confirm draft and void invoices are still rejected.

## 2026-03-07 | Scope: rental admin invoices list db-first migration
Summary:
- Migrated the admin invoice list page from localStorage to the DB-backed admin invoices route and surfaced separate payment status badges derived server-side.

Files changed:
- `src/lib/rental/invoices/types.ts`
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/lib/rental/invoices/db-payment-repo.ts`
- `src/app/api/admin/rental/invoices/route.ts`
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Invoice list payment status/totals are derived from `rental_invoices` and `rental_invoice_payments` on the server.

API changes:
- Extended protected `GET /api/admin/rental/invoices` so requests without query params return DB-backed invoice list items as `{ items }`, each containing the invoice plus derived payment totals/status.
- Existing `GET` by `orderId` / `orderIds` and `POST` create-draft behavior remain intact.

Manual test checklist:
- [ ] Open `/admin/rental/invoices` while logged in and confirm rows load after refresh with no localStorage dependency.
- [ ] Confirm lifecycle status and payment status both appear and remain separate for draft, issued, and void invoices.
- [ ] Compare payment status on the list page against invoice detail for unpaid, partially paid, paid, and overdue invoices.
- [ ] Confirm clicking `View` still opens the same invoice detail page.
- [ ] Confirm logged-out access to `/api/admin/rental/invoices` still returns 401.

## 2026-03-07 | Scope: rental admin invoices list filters + search
Summary:
- Added lightweight DB-backed lifecycle/payment-status filters and simple search to the admin invoice list, while preserving the existing table flow and auth protection.

Files changed:
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/app/api/admin/rental/invoices/route.ts`
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Lifecycle filtering now narrows the invoice DB query before payment-status derivation and response shaping.

API changes:
- Extended protected `GET /api/admin/rental/invoices` list mode to accept `lifecycleStatus`, `paymentStatus`, and `q` query params.
- Existing `orderId` / `orderIds` / `POST` behaviors remain intact.

Manual test checklist:
- [ ] Open `/admin/rental/invoices` and confirm the list loads with no filters applied.
- [ ] Search by invoice number, customer/company name, and contact person name; confirm matching rows update from the DB-backed route.
- [ ] Filter by lifecycle status and confirm draft / issued / void rows are narrowed correctly.
- [ ] Filter by payment status and confirm unpaid / partially paid / paid / overdue rows match invoice detail behavior.
- [ ] Combine search + lifecycle + payment filters and confirm the empty state appears when nothing matches.
- [ ] Confirm logged-out `GET /api/admin/rental/invoices` still returns 401.

## 2026-03-07 | Scope: rental admin invoices list pagination + sorting
Summary:
- Added lightweight server-backed pagination and whitelisted sorting to the admin invoice list while preserving existing DB-backed filters, search, and row navigation.

Files changed:
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/app/api/admin/rental/invoices/route.ts`
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Invoice list sorting is now mapped to whitelisted DB columns (`created_at`, `due_date`, `total_incl_gst_cents`, `invoice_no`).

API changes:
- Extended protected `GET /api/admin/rental/invoices` list mode to accept `page`, `pageSize`, `sortBy`, and `sortDir` and return `{ items, pagination }`.
- Existing `orderId` / `orderIds` / `POST` behavior remains intact.

Manual test checklist:
- [ ] Open `/admin/rental/invoices` and confirm page 1 loads with default `pageSize=20`, `sortBy=created_at`, `sortDir=desc`.
- [ ] Change page size between 10 / 20 / 50 and confirm results update and reset to page 1.
- [ ] Sort by created date, due date, total, and invoice number in both directions and confirm row order changes correctly.
- [ ] Click Previous / Next and confirm page navigation works without breaking filters or search.
- [ ] Combine pagination and sorting with lifecycle status, payment status, and search filters and confirm results remain consistent.
- [ ] Confirm logged-out `GET /api/admin/rental/invoices` still returns 401.

## 2026-03-07 | Scope: rental invoice payment reminders v1
Summary:
- Added manual payment reminder emails for eligible issued invoices by reusing the existing invoice PDF/email delivery path and logging reminder events in invoice email history.

Files changed:
- `src/lib/rental/invoices/types.ts`
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/lib/rental/invoices/email-delivery.ts`
- `src/app/api/admin/rental/invoices/send/route.ts`
- `src/app/api/admin/rental/invoices/remind/route.ts`
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Reminder emails reuse the existing stored invoice PDF path and `rental_invoice_emails` logging flow.

API changes:
- Added protected `POST /api/admin/rental/invoices/remind` for manual reminder sends.
- Reminder events are now logged alongside `sent` and `resent` email history entries.

Manual test checklist:
- [ ] Open an issued unpaid invoice with a bill-to email and confirm `Send Reminder` is visible.
- [ ] Send a reminder and confirm the existing invoice PDF is reused when available and the email history shows a `REMINDER` event after refresh.
- [ ] Confirm reminders are blocked for draft, void, and fully paid invoices.
- [ ] Confirm reminder email payload includes invoice number, total, amount paid, outstanding balance, and due date when present.
- [ ] Confirm logged-out `POST /api/admin/rental/invoices/remind` still returns 401.

## 2026-03-07 | Scope: rental invoice email history visibility
Summary:
- Improved invoice detail email history readability and added DB-backed email summary fields to the admin invoice list so admins can see latest invoice communication at a glance.

Files changed:
- `src/lib/rental/invoices/types.ts`
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/app/api/admin/rental/invoices/route.ts`
- `src/app/admin/rental/invoices/page.tsx`
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Invoice list email summary data is aggregated server-side from `rental_invoice_emails`.

API changes:
- Extended protected `GET /api/admin/rental/invoices` list mode so each invoice list item can include lightweight email summary fields (`emailCount`, `lastEmailType`, `lastEmailAt`, `lastEmailTo`).
- Existing `orderId` / `orderIds` / `POST` behavior remains intact.

Manual test checklist:
- [ ] Open an invoice detail page and confirm email history rows show a clear event label, recipient email, sent timestamp, and provider/status.
- [ ] Confirm reminder entries are visually distinct from send/resend entries in invoice detail history.
- [ ] Open `/admin/rental/invoices` and confirm invoices with prior email activity show a last-email badge and timestamp.
- [ ] Confirm invoices with no email history still render cleanly in the list.
- [ ] Confirm logged-out `GET /api/admin/rental/invoices` still returns 401.

## 2026-03-07 | Scope: rental invoice receipt flow v1
Summary:
- Added a manual receipt email flow for issued invoices with recorded payments and logged receipt events into the existing invoice email history.

Files changed:
- `src/lib/rental/invoices/types.ts`
- `src/app/api/admin/rental/invoices/receipt/route.ts`
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Receipt emails reuse the existing invoice PDF storage/email delivery path and `rental_invoice_emails` event log.

API changes:
- Added protected `POST /api/admin/rental/invoices/receipt` for manual receipt sends on issued invoices with `paidCents > 0`.
- Receipt events now appear alongside `sent`, `resent`, and `reminder` email history entries.

Manual test checklist:
- [ ] Open an issued invoice with recorded payments and confirm `Send Receipt` is visible.
- [ ] Send a receipt and confirm the existing invoice PDF is reused when available and the email history shows a `Receipt` event after refresh.
- [ ] Confirm receipts are blocked for draft, void, and issued invoices with zero recorded payments.
- [ ] Confirm the receipt email content includes invoice number, total amount, amount paid, outstanding balance, payment status, and due date when present.
- [ ] Confirm the invoice list `Last Email` badge shows `RECEIPT` after a receipt is sent.
- [ ] Confirm logged-out `POST /api/admin/rental/invoices/receipt` still returns 401.

## 2026-03-07 | Scope: rental invoice/payments csv export v1
Summary:
- Added a protected CSV export for the admin invoice list that reuses the same DB-backed filters, search, sorting, payment status derivation, and email summary fields as the UI list.

Files changed:
- `src/lib/rental/invoices/admin-invoice-list.ts`
- `src/app/api/admin/rental/invoices/route.ts`
- `src/app/api/admin/rental/invoices/export/route.ts`
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- CSV export reads the full filtered dataset from the existing DB-first invoice/payment/email sources without using localStorage.

API changes:
- Added protected `GET /api/admin/rental/invoices/export` returning a CSV download.
- Existing `GET /api/admin/rental/invoices` now reuses a shared server-side list helper so export and UI list stay aligned on filters/search/sort logic.

Manual test checklist:
- [ ] Open `/admin/rental/invoices`, apply search/filter/sort controls, click `Export CSV`, and confirm the download starts successfully.
- [ ] Confirm the CSV includes the full filtered dataset, not just the current page.
- [ ] Confirm exported rows include invoice lifecycle status, payment status, totals, balance, and email summary columns.
- [ ] Confirm sort order in the CSV matches the active list sort order.
- [ ] Confirm logged-out `GET /api/admin/rental/invoices/export` still returns 401.

## 2026-03-07 | Scope: rental payments ledger csv export v1
Summary:
- Added a protected payments-ledger CSV export with one row per payment, enriched with invoice context and derived invoice payment status/totals for reconciliation and finance review.

Files changed:
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/lib/rental/invoices/admin-payments-ledger.ts`
- `src/app/api/admin/rental/payments/export/route.ts`
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Payments-ledger export reads DB-backed payment rows from `rental_invoice_payments` and enriches them with invoice context from `rental_invoices`.

API changes:
- Added protected `GET /api/admin/rental/payments/export` returning a CSV download with one row per payment.
- Supports lightweight query params: `q`, `paymentMethod`, `paymentStatus`, `dateFrom`, `dateTo`, `sortBy`, and `sortDir`.

Manual test checklist:
- [ ] Open `/admin/rental/invoices` and click `Export Payments CSV`; confirm a CSV download starts.
- [ ] Confirm the CSV contains one row per recorded payment with invoice context and derived invoice payment status/totals.
- [ ] Confirm `q` and `paymentStatus` query params narrow exported rows when provided.
- [ ] Confirm sorting works for `paid_at`, `created_at`, `amount`, and `invoice_number`.
- [ ] Confirm logged-out `GET /api/admin/rental/payments/export` still returns 401.

## 2026-03-07 | Scope: rental invoice detail action ux hardening v1
Summary:
- Hardened invoice detail actions with shared in-flight button states and consistent success/error banner feedback for send/resend, reminder, receipt, and payment recording flows.

Files changed:
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No infrastructure changes.

API changes:
- No route contract changes.
- Invoice detail now prevents duplicate client-side submits while existing protected admin APIs remain the source of truth.

Manual test checklist:
- [ ] On invoice detail, click send/reminder/receipt/payment actions repeatedly and confirm duplicate requests are blocked while the action is in progress.
- [ ] Confirm action buttons show clearer in-flight labels such as `Sending...` and `Recording...`.
- [ ] Confirm success messages use the page banner consistently after send/resend, reminder, receipt, and payment record actions.
- [ ] Confirm failed actions re-enable buttons and show an error banner without leaving the page stuck.
- [ ] Confirm email history still refreshes after successful email actions and payment history/totals still refresh after recording payment.

## 2026-03-07 | Scope: public checkout hitpay sandbox foundation v1
Summary:
- Added a DB-backed HitPay sandbox payment-session foundation for public rental checkout, with hosted payment redirection, webhook/status sync, and a trusted public payment-status page.

Files changed:
- `docs/sql/rental_order_payment_sessions.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-payment-session-repo.ts`
- `src/lib/rental/orders/hitpay.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/api/public/rental/checkout/payment-status/route.ts`
- `src/app/api/public/rental/payments/hitpay/webhook/route.ts`
- `src/app/rental/checkout/page.tsx`
- `src/app/rental/checkout/status/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added SQL for `rental_order_payment_sessions` in `docs/sql/rental_order_payment_sessions.sql`.
- Requires server envs for HitPay sandbox and public redirects/webhook URLs: `HITPAY_API_KEY`, `HITPAY_API_BASE_URL` (optional override), `HITPAY_WEBHOOK_SALT`, and `APP_BASE_URL`.

API changes:
- Added public `POST /api/public/rental/checkout/start-payment` to persist the order, create a payment session, create a HitPay payment request, and return the hosted redirect URL.
- Added public `GET /api/public/rental/checkout/payment-status` to return trusted DB-backed order/payment-session state and reconcile pending sessions with HitPay when possible.
- Added public `POST /api/public/rental/payments/hitpay/webhook` for signed webhook processing and idempotent session updates.

Manual test checklist:
- [ ] Run `docs/sql/rental_order_payment_sessions.sql` in Supabase SQL Editor.
- [ ] Set sandbox env vars for HitPay and `APP_BASE_URL`.
- [ ] Start public checkout and confirm a `rental_orders` row and `rental_order_payment_sessions` row are created before redirecting to HitPay.
- [ ] Complete a sandbox payment and confirm the webhook updates the payment session to `paid`.
- [ ] Open `/rental/checkout/status?sessionId=...` and confirm status is loaded from the server-backed payment session, not only redirect query params.
- [ ] Confirm failed/cancelled sandbox flows still leave the session readable on the status page.

## 2026-03-08 | Scope: public checkout paid-session invoice automation
Summary:
- Added webhook-driven tax invoice automation for paid HitPay sessions: create/reuse + issue invoice, map payment into the DB invoice payment ledger exactly once, and auto-send the invoice softcopy through the existing PDF/email pipeline.

Files changed:
- `docs/sql/rental_order_payment_invoice_automation.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-payment-session-repo.ts`
- `src/lib/rental/invoices/db-payment-repo.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `src/app/api/public/rental/payments/hitpay/webhook/route.ts`
- `src/app/api/public/rental/checkout/payment-status/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL to link payment sessions to invoice automation state and to add `source_payment_session_id` uniqueness on `rental_invoice_payments` for idempotent payment mapping.
- Requires running `docs/sql/rental_order_payment_invoice_automation.sql` in Supabase SQL Editor.

API changes:
- `POST /api/public/rental/payments/hitpay/webhook` now triggers server-side invoice creation/issuance, invoice payment mapping, and invoice softcopy email send after a verified paid session.
- `GET /api/public/rental/checkout/payment-status` now returns DB-backed payment-session state only; webhook remains the trusted path for paid confirmation.

Manual test checklist:
- [ ] Run `docs/sql/rental_order_payment_invoice_automation.sql` in Supabase SQL Editor.
- [ ] Complete a paid HitPay sandbox checkout and confirm an invoice is created or reused for the linked order and ends up issued.
- [ ] Confirm exactly one `rental_invoice_payments` row is created for the paid checkout session, even if the webhook is replayed.
- [ ] Confirm the invoice appears in admin invoice detail with correct paid/balance/payment status.
- [ ] Confirm the invoice PDF is generated/reused and a `sent` invoice email event is logged once.
- [ ] Replay the webhook and confirm there are no duplicate invoices, duplicate payment rows, or duplicate invoice softcopy sends.

## 2026-03-08 | Scope: hitpay webhook form-hmac verification fix
Summary:
- Updated HitPay webhook verification to accept the actual sandbox form-urlencoded payload format using the `hmac` field, while preserving the existing verified webhook -> payment-session -> invoice automation flow.

Files changed:
- `src/lib/rental/orders/hitpay.ts`
- `src/app/api/public/rental/payments/hitpay/webhook/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No infrastructure changes.

API changes:
- `POST /api/public/rental/payments/hitpay/webhook` now verifies sandbox form-urlencoded callbacks against the payload `hmac` field instead of relying only on signature headers.
- Added clearer server-side logging for signature failures, missing payment request IDs, provider fetch/update failures, and invoice automation failures.

Manual test checklist:
- [ ] Trigger a HitPay sandbox webhook and confirm the route no longer returns 401 when the payload contains a valid `hmac`.
- [ ] Confirm verified webhook calls still update the linked `rental_order_payment_sessions` row.
- [ ] Confirm paid webhook calls still trigger invoice/payment/email automation successfully.
- [ ] Replay the same webhook and confirm idempotent behavior remains intact.
- [ ] Confirm invalid or tampered `hmac` payloads still return 401.

## 2026-03-08 | Scope: hitpay registered webhook verification fix
Summary:
- Updated HitPay webhook handling to verify the real registered JSON webhook format using the `Hitpay-Signature` header, while keeping old form `hmac` callbacks only as backward compatibility and removing the deprecated payment-request `webhook` parameter.

Files changed:
- `src/lib/rental/orders/hitpay.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/api/public/rental/payments/hitpay/webhook/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- HitPay should now rely on the dashboard-registered webhook endpoint instead of the deprecated request-level `webhook` parameter.

API changes:
- `POST /api/public/rental/payments/hitpay/webhook` now accepts the registered `application/json` HitPay webhook format signed via `Hitpay-Signature`, while still accepting legacy form `hmac` callbacks if they arrive.
- `POST /api/public/rental/checkout/start-payment` no longer sends the deprecated `webhook` parameter when creating HitPay payment requests.

Manual test checklist:
- [ ] Trigger a registered HitPay sandbox webhook with `Content-Type: application/json` and `Hitpay-Signature`, and confirm the route no longer returns 401.
- [ ] Confirm the linked `rental_order_payment_sessions` row updates after a verified JSON webhook.
- [ ] Confirm paid webhooks still trigger invoice/payment/email automation exactly once.
- [ ] Confirm old form-urlencoded `hmac` callbacks still verify if they arrive during transition.
- [ ] Confirm invalid or missing signatures still return 401.

## 2026-03-08 | Scope: hitpay webhook invoice automation observability and recovery
Summary:
- Hardened the paid-session webhook flow with explicit stage-level logging, persisted automation-failure context on the payment session, and an admin-only reconcile endpoint to safely replay invoice automation for already-paid checkout sessions.

Files changed:
- `src/app/api/public/rental/payments/hitpay/webhook/route.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `src/app/api/admin/rental/orders/payment-sessions/reconcile/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Webhook failures after the payment session is marked paid are now recoverable through an admin replay path instead of requiring direct DB intervention.

API changes:
- `POST /api/public/rental/payments/hitpay/webhook` now separates provider-status fetch, payment-session update, and invoice-automation stages in logs, and records invoice-automation failures in the session webhook payload while returning a safe success response after the paid session is persisted.
- Added admin-only `POST /api/admin/rental/orders/payment-sessions/reconcile` to rerun invoice automation idempotently for an already-paid payment session.

Manual test checklist:
- [ ] Trigger a paid HitPay webhook and confirm the payment session still becomes `paid`.
- [ ] Force an invoice automation failure and confirm server logs identify the failing stage clearly.
- [ ] Confirm the failed paid session stores automation failure context in `webhook_payload`.
- [ ] Call `POST /api/admin/rental/orders/payment-sessions/reconcile` with the paid `sessionId` and confirm the invoice is created/reused, payment is mapped once, and email is not duplicated.
- [ ] Replay reconcile again and confirm idempotent behavior remains intact.

## 2026-03-08 | Scope: public checkout invoice amount alignment
Summary:
- Aligned public checkout payment composition with invoice payable totals by excluding deposit from the HitPay amount, including GST in the payable amount, and reusing a shared pricing helper so checkout payment sessions match invoice `total_incl_gst_cents`.

Files changed:
- `src/lib/rental/orders/pricing.ts`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/rental/checkout/page.tsx`
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- Order pricing snapshots created through checkout now carry explicit `gstAmount` and `payableTotal` values in JSON for invoice-aligned payment composition.

API changes:
- `POST /api/public/rental/checkout/start-payment` now charges the invoice-aligned payable amount (`rental + delivery/collection + GST`, excluding deposit) instead of the old display total.

Manual test checklist:
- [ ] Start a new public checkout and confirm the displayed `Payable now` amount equals rental + delivery/collection + GST, excluding deposit.
- [ ] Confirm the created `rental_order_payment_sessions.amount_cents` matches the eventual invoice `total_incl_gst_cents`.
- [ ] Complete a paid HitPay sandbox checkout and confirm invoice automation no longer fails with `Checkout payment exceeds invoice outstanding balance`.
- [ ] Confirm deposit is still visible in checkout and stored in the order/invoice snapshot, but not included in the online payment amount.

## 2026-03-08 | Scope: payment allocation layer foundation
Summary:
- Added a durable `rental_payment_allocations` table and DB repo, and routed checkout-session-to-invoice payment mapping through this allocation layer while preserving the existing `rental_invoice_payments` ledger and current webhook behavior.

Files changed:
- `docs/sql/rental_payment_allocations.sql`
- `src/lib/rental/payments/db-payment-allocation-repo.ts`
- `src/lib/rental/invoices/db-payment-repo.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL for `rental_payment_allocations` with source/target indexes and a uniqueness constraint for idempotent v1 checkout-session-to-invoice allocation.
- Run `docs/sql/rental_payment_allocations.sql` in Supabase SQL Editor.

API changes:
- No route shape changes.
- Webhook-driven checkout payment mapping now creates or reuses a durable allocation record alongside the existing invoice payment row.

Manual test checklist:
- [ ] Run `docs/sql/rental_payment_allocations.sql` in Supabase SQL Editor.
- [ ] Complete a paid checkout and confirm one `rental_payment_allocations` row is created with `source_type = 'checkout_session'` and `allocation_type = 'invoice'`.
- [ ] Replay the same webhook or reconcile flow and confirm no duplicate allocation row is created.
- [ ] Confirm the existing `rental_invoice_payments` row is still created exactly once and invoice paid/balance status remains correct.

## 2026-03-08 | Scope: pre-vetted vs non-vetted checkout branching
Summary:
- Added a DB-backed rental-customer eligibility model and server-side checkout branching so non-vetted customers continue through HitPay, while pre-vetted credit members skip gateway payment and receive an issued invoice softcopy immediately.

Files changed:
- `docs/sql/rental_customers_credit_terms.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/lib/rental/customers/db-rental-customer-repo.ts`
- `src/lib/rental/orders/hitpay.ts`
- `src/lib/rental/invoices/send-issued-invoice.ts`
- `src/lib/rental/invoices/checkout-credit-automation.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/api/public/rental/checkout/payment-status/route.ts`
- `src/app/rental/checkout/page.tsx`
- `src/app/rental/checkout/status/page.tsx`
- `src/app/api/admin/rental/invoices/send/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added `rental_customers` for member-code-based credit eligibility and added `customer_snapshot` to `rental_orders`.
- Run `docs/sql/rental_customers_credit_terms.sql` in Supabase SQL Editor.

API changes:
- `POST /api/public/rental/checkout/start-payment` now branches server-side:
  - non-vetted customers: order + HitPay session + hosted payment redirect
  - pre-vetted members: order + issue invoice + softcopy email + status-page redirect
- `GET /api/public/rental/checkout/payment-status` now accepts `sessionId` or `orderId` and can return invoice status for credit checkouts.

Manual test checklist:
- [ ] Run `docs/sql/rental_customers_credit_terms.sql` in Supabase SQL Editor.
- [ ] Insert a pre-vetted customer with `member_code`, `payment_terms = 'credit'`, and `credit_status = 'pre_vetted'`.
- [ ] Test checkout without a member code and confirm the current HitPay redirect flow remains unchanged.
- [ ] Test checkout with a valid pre-vetted member code + matching email and confirm no HitPay session is created, an invoice is issued, and the invoice email is sent once.
- [ ] Confirm invalid member code or mismatched email is rejected clearly.
- [ ] Confirm the checkout status page works for both `sessionId` and `orderId` flows.

## 2026-03-08 | Scope: customer account foundation v1
Summary:
- Added DB-backed rental customer account fields, customer-to-order linkage, separate customer auth endpoints/pages, and a protected admin customer management page while keeping the existing checkout/payment flow stable.

Files changed:
- `docs/sql/rental_customer_accounts_v1.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/lib/rental/customers/db-rental-customer-repo.ts`
- `src/lib/auth/customer.ts`
- `src/app/api/public/rental/auth/register/route.ts`
- `src/app/api/public/rental/auth/login/route.ts`
- `src/app/api/public/rental/auth/logout/route.ts`
- `src/app/api/public/rental/auth/me/route.ts`
- `src/app/rental/account/login/page.tsx`
- `src/app/rental/account/register/page.tsx`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/rental/checkout/page.tsx`
- `src/app/api/admin/rental/customers/route.ts`
- `src/app/api/admin/rental/customers/[id]/route.ts`
- `src/app/admin/rental/customers/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL to extend `rental_customers` with account/vetting/auth linkage fields and to add `rental_orders.customer_id`.
- Run `docs/sql/rental_customer_accounts_v1.sql` in Supabase SQL Editor.

API changes:
- Added customer auth endpoints:
  - `POST /api/public/rental/auth/register`
  - `POST /api/public/rental/auth/login`
  - `POST /api/public/rental/auth/logout`
  - `GET /api/public/rental/auth/me`
- Added admin customer management endpoints:
  - `GET /api/admin/rental/customers`
  - `PATCH /api/admin/rental/customers/[id]`
- `POST /api/public/rental/checkout/start-payment` now links authenticated customers to orders and uses account state before falling back to the legacy member-code credit check.

Manual test checklist:
- [ ] Run `docs/sql/rental_customer_accounts_v1.sql` in Supabase SQL Editor.
- [ ] Register a new customer account and confirm a `rental_customers` row is created with `vetting_status = 'new'`, `payment_terms = 'upfront'`, and `account_status = 'active'`.
- [ ] Log in as that customer and confirm `/api/public/rental/auth/me` returns the linked customer record.
- [ ] Start checkout while logged in and confirm the created `rental_orders` row is linked via `customer_id`.
- [ ] Open `/admin/rental/customers`, search for the customer, and update vetting/payment terms/account status/internal notes.
- [ ] Confirm the existing non-vetted HitPay checkout path still works and the existing member-code fallback remains intact.

## 2026-03-08 | Scope: account-based checkout vetting cleanup
Summary:
- Removed the temporary `member_code` checkout path and switched checkout branching to authenticated customer-account state only, with admin-managed vetting/payment terms/account status as the sole source of truth.

Files changed:
- `docs/sql/rental_customer_account_only_v1.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/customers/db-rental-customer-repo.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/rental/checkout/page.tsx`
- `src/app/admin/rental/customers/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL to drop the obsolete `member_code` and `credit_status` columns from `rental_customers`.
- Run `docs/sql/rental_customer_account_only_v1.sql` in Supabase SQL Editor after the earlier customer-account migrations.

API changes:
- `POST /api/public/rental/checkout/start-payment` now requires an authenticated customer account and branches only on account state:
  - `account_status = active`
  - `vetting_status = pre_vetted`
  - `payment_terms = credit`
  for invoice-later credit checkout; all other active customers continue through HitPay.

Manual test checklist:
- [ ] Run `docs/sql/rental_customer_account_only_v1.sql` in Supabase SQL Editor.
- [ ] Confirm checkout without login is blocked.
- [ ] Confirm an authenticated active upfront customer still goes through the existing HitPay payment path.
- [ ] Confirm an authenticated active pre-vetted credit customer skips HitPay, gets an issued invoice, and receives the tax invoice email.
- [ ] Confirm admin customer management still updates vetting/payment terms/account status and those changes immediately affect checkout branching.

## 2026-03-08 | Scope: admin customer detail / account overview
Summary:
- Added a DB-backed admin customer overview route and customer detail page showing account info, booking history, invoice history, payment history, email activity, and a lightweight financial summary, while reusing the existing customer update endpoint for editable account settings and notes.

Files changed:
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/app/api/admin/rental/customers/[id]/overview/route.ts`
- `src/app/admin/rental/customers/[id]/page.tsx`
- `src/app/admin/rental/customers/page.tsx`
- `docs/migration-log.md`

API additions:
- Added `GET /api/admin/rental/customers/[id]/overview` for DB-backed customer account overview data.

Manual test checklist:
- [ ] Open `/admin/rental/customers` and click a customer company name or `Open Account Overview`.
- [ ] Confirm `/admin/rental/customers/[id]` loads customer account info, booking history, invoice history, payment history, recent email activity, and financial summary.
- [ ] Confirm invoice rows open the related admin invoice detail page.
- [ ] Confirm updating vetting status, payment terms, account status, or internal notes from the detail page persists through the existing customer update endpoint.
- [ ] Confirm the customer list page still loads and remains admin-auth protected.

## 2026-03-08 | Scope: admin customer detail layout refinement rollback
Summary:
- Reverted the customer detail SaaS-style redesign and restored the earlier customer overview layout and edit behavior.

Files changed:
- `src/lib/rental/customers/db-rental-customer-repo.ts`
- `src/app/api/admin/rental/customers/[id]/route.ts`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/app/admin/rental/customers/[id]/page.tsx`
- `docs/migration-log.md`

API additions:
- No API additions.

Manual test checklist:
- [ ] Open `/admin/rental/customers/[id]` and confirm the earlier customer overview layout is restored.
- [ ] Confirm account editing is back to vetting status, payment terms, account status, and internal notes only.
- [ ] Confirm recent invoices, payments, orders, and email activity still load correctly.

## 2026-03-08 | Scope: credit control v1 foundation
Summary:
- Added append-only customer credit-policy fields and a server-side credit-control summary derived from existing invoice and payment ledger data, then exposed that summary on the admin customer overview page without changing checkout or payment flows.

Files changed:
- `docs/sql/rental_customers_credit_control_v1.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/customers/db-rental-customer-repo.ts`
- `src/lib/rental/credit-control/db-rental-credit-control.ts`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/app/admin/rental/customers/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL for `rental_customers.credit_limit`, `credit_control_enabled`, `credit_hold_reason`, `credit_last_reviewed_at`, and `credit_last_reviewed_by`.
- Run `docs/sql/rental_customers_credit_control_v1.sql` in Supabase SQL Editor.

API / Page changes:
- Existing `GET /api/admin/rental/customers/[id]/overview` now includes a `creditControl` summary section with computed credit usage, overdue exposure, and display-only recommended decision codes.
- `/admin/rental/customers/[id]` now shows a Credit Control panel in the existing overview layout.

Risks / follow-up notes:
- Current collectible-invoice logic assumes only `issued` invoices should count toward credit usage and excludes `void`; if more invoice lifecycle statuses are introduced later, the helper should be updated centrally.
- `credit_last_reviewed_by` is stored as `text` because the current admin auth path is API-key based and does not expose a DB-backed admin user UUID.
- Recommended next task: enforce the same helper during checkout server-side before allowing invoice-later credit orders.
