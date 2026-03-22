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

## 2026-03-09 | Scope: credit control v1 summary semantics refinement
Summary:
- Refined the existing credit-control helper so the returned status reflects the effective current state, adding an explicit `control_disabled` result ahead of automated overdue/limit checks while keeping manual hold as highest priority.

Files changed:
- `src/lib/rental/credit-control/db-rental-credit-control.ts`
- `src/app/admin/rental/customers/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Existing customer overview payload now returns `recommendedDecision = control_disabled` and `recommendedReasonCode = credit_control_disabled` when credit control is disabled and there is no manual hold.
- Admin customer Credit Control badges/labels now distinguish disabled control from blocked states.

Risks / follow-up notes:
- This remains a current-state summary helper only; projected order exposure and checkout enforcement should stay in a later server-side checkout task.

## 2026-03-09 | Scope: admin customer credit policy editing
Summary:
- Extended the existing admin customer PATCH path and customer detail page so credit policy fields can be edited with a dedicated save action, while keeping derived credit exposure read-only and reloading the overview after save.

Files changed:
- `src/app/api/admin/rental/customers/[id]/route.ts`
- `src/lib/rental/customers/db-rental-customer-repo.ts`
- `src/app/admin/rental/customers/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Existing `PATCH /api/admin/rental/customers/[id]` now accepts `creditLimit`, `creditControlEnabled`, and `creditHoldReason`, validates non-negative credit limits, trims hold reasons, and stamps `creditLastReviewedAt` when policy values change.
- `/admin/rental/customers/[id]` now has a separate editable Credit Policy section with its own `Save Credit Policy` button; derived credit exposure remains read-only.

Risks / follow-up notes:
- `creditLastReviewedBy` is still left unchanged because the current admin auth path does not expose a trustworthy acting admin identity.

## 2026-03-09 | Scope: credit control v1 checkout enforcement
Summary:
- Added a dedicated server-side credit checkout evaluator that reuses the current credit summary helper plus proposed order exposure, and wired it into the existing checkout decision path so credit customers are blocked from invoice-later checkout on manual hold, overdue balance, or limit exceed while disabled control bypasses overdue/limit checks.

Files changed:
- `src/lib/rental/credit-control/checkout-credit-evaluator.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/rental/checkout/page.tsx`
- `src/app/rental/checkout/status/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Existing `POST /api/public/rental/checkout/start-payment` now evaluates baseline credit eligibility plus current exposure and proposed booking exposure before any credit invoice path runs.
- Baseline-eligible credit customers continue through invoice-later only when allowed; blocked credit customers fall back to the existing upfront payment flow with a structured `creditDecision` payload and a user-facing notice.
- Checkout and checkout-status pages now show the server-provided blocked-credit fallback notice without duplicating credit rules in the browser.

Risks / follow-up notes:
- Current projected exposure uses the payable invoice total from the checkout pricing snapshot and still does not reserve exposure for concurrent in-flight unpaid orders before invoice issuance.

## 2026-03-09 | Scope: credit checkout selective fallback refinement
Summary:
- Refined the existing credit checkout enforcement so manual hold now hard-stops checkout before any writes, while overdue balance and credit-limit exceed continue to fall back to the existing upfront-payment flow with explicit server response flags and user-facing messaging.

Files changed:
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/rental/checkout/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Existing `POST /api/public/rental/checkout/start-payment` now returns explicit `creditCheckoutBlocked` and `creditCheckoutFallbackToUpfront` flags.
- `manual_hold` now returns a hard-stop response before any order, invoice, or payment-session write.
- `overdue_balance` and `credit_limit_exceeded` still bypass the credit invoice path and continue through the existing upfront-payment flow with a server-provided notice.

Risks / follow-up notes:
- Baseline inactive-account blocking remains handled by the pre-existing account-status guard earlier in checkout and was not broadened in this refinement.

## 2026-03-09 | Scope: equipment availability locking v1
Summary:
- Added a DB-backed rental availability hold model plus atomic hold acquisition for checkout, enforced server-side availability before downstream writes, and wired hold lifecycle into credit checkout success and paid checkout completion while letting expired holds fall out of availability reads automatically.

Files changed:
- `docs/sql/rental_availability_holds_v1.sql`
- `src/lib/rental/server-equipment-config.ts`
- `src/lib/rental/holds/db-rental-availability-hold-repo.ts`
- `src/lib/rental/holds/db-rental-availability-service.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `src/app/rental/checkout/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL for `rental_availability_holds` plus `acquire_rental_availability_hold(...)` to lock per equipment, count overlapping active invoice-backed orders and active unexpired holds, and insert a temporary hold atomically.
- Run `docs/sql/rental_availability_holds_v1.sql` in Supabase SQL Editor.

API / Page changes:
- Existing `POST /api/public/rental/checkout/start-payment` now creates an availability hold before credit or payment-side writes and returns a structured `availabilityBlocked` response on insufficient stock.
- Checkout page now surfaces server-returned availability failures directly.
- Credit checkout marks the hold consumed after successful invoice-later completion; paid upfront checkout marks the hold consumed from the existing webhook invoice-automation path.

Risks / follow-up notes:
- Current inventory-unit configuration is still sourced from the existing seed equipment config on the server because the equipment catalog itself is not yet DB-backed; admin local inventory edits are not authoritative for server availability enforcement.
- The atomic hold acquisition is DB-backed, but committed-quantity reads still assume invoice-backed orders are the authoritative confirmed bookings in the current architecture.

## 2026-03-10 | Scope: DB-backed rental equipment catalog foundation
Summary:
- Added a production-ready `rental_equipment` table plus a server-side equipment repo, switched the main admin rental inventory screen to DB-backed create/edit/publish flows, moved the public rental catalog/detail/checkout pages onto published equipment APIs, and updated server-side availability config to read DB equipment totals instead of seed data.

Files changed:
- `docs/sql/rental_equipment_v1.sql`
- `src/lib/rental/types.ts`
- `src/lib/rental/equipment/types.ts`
- `src/lib/rental/equipment/db-rental-equipment-repo.ts`
- `src/app/api/admin/rental/equipment/route.ts`
- `src/app/api/admin/rental/equipment/[id]/route.ts`
- `src/app/api/public/rental/equipment/route.ts`
- `src/app/api/public/rental/equipment/[id]/route.ts`
- `src/lib/rental/server-equipment-config.ts`
- `src/lib/rental/holds/db-rental-availability-service.ts`
- `src/app/admin/rental/page.tsx`
- `src/app/rental/page.tsx`
- `src/app/rental/[id]/page.tsx`
- `src/app/rental/checkout/page.tsx`
- `docs/migration-log.md`

## 2026-03-14 | Scope: developer-only rental order delete tools

Summary:
- Added a DB-backed admin setting to enable developer delete tools, defaulting off and requiring explicit confirmation before exposing destructive UI controls.
- Added transactional rental order deletion cleanup for test data, including linked invoice emails, payment allocations, extensions, holds, invoices, and cascaded order-linked records.
- Added protected single-order and bulk delete admin endpoints plus gated delete controls in admin rental orders.

Files changed:
- `docs/sql/rental_order_developer_delete_v1.sql`
- `src/lib/settings/db-admin-settings-repo.ts`
- `src/app/api/admin/settings/route.ts`
- `src/app/admin/settings/page.tsx`
- `src/lib/rental/orders/delete-rental-order-service.ts`
- `src/app/api/admin/rental/orders/route.ts`
- `src/app/api/admin/rental/orders/[id]/route.ts`
- `src/app/api/admin/rental/orders/bulk-delete/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_order_developer_delete_v1.sql` for DB-backed developer delete orchestration.
- Reused the existing `system_settings` store for the developer delete tools toggle instead of introducing a separate feature-flag path.

API / Page changes:
- Added protected `DELETE /api/admin/rental/orders/[id]` and `POST /api/admin/rental/orders/bulk-delete`.
- Existing `GET /api/admin/rental/orders` now exposes whether developer delete tools are enabled so the page can gate destructive controls.
- Admin settings now exposes the developer delete tools toggle and admin rental orders now shows single and bulk delete actions only when enabled.

Risks / follow-up notes:
- This is a developer/test-data cleanup feature only and should be removed or replaced with a safer archive/cancel flow before final customer handover.
- Bulk delete is processed per order using the shared transactional delete path, so a failure on one order does not automatically roll back the rest of the batch.

## 2026-03-14 | Scope: landing/account auth polish and admin checkout guard

Summary:
- Made the public landing page auth-aware for guests, signed-in customers, and signed-in admins while keeping rental browsing primary on the public site.
- Polished the customer account page with Lucide-backed hero, summary cards, section headers, notices, and empty states without changing portal workflows.
- Added admin-session checkout blocking in the public detail page, checkout page, and server-side public checkout/order APIs so admin sessions cannot proceed through customer checkout.

Files changed:
- `src/lib/auth/admin.ts`
- `src/app/api/public/rental/auth/me/route.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/api/public/rental/orders/route.ts`
- `src/app/(public-pages)/page.tsx`
- `src/app/rental/[id]/page.tsx`
- `src/app/rental/checkout/page.tsx`
- `src/app/rental/account/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- Existing `GET /api/public/rental/auth/me` now also exposes admin-session awareness for public UI state.
- Existing public checkout start-payment and order-create routes now reject admin-session attempts so checkout remains customer-only.
- The landing page now renders guest, signed-in customer, and signed-in admin states without changing the public browsing flow.

Risks / follow-up notes:
- Public equipment browsing remains available to admins by design; only customer checkout progression is blocked.
- The current public auth-aware UI depends on shared customer/admin session helpers, so future auth-state changes should reuse those helpers rather than duplicating cookie logic.

## 2026-03-14 | Scope: landing hero brand refinement

Summary:
- Refined the public landing hero to use the Teesin red palette more intentionally while keeping the page mostly neutral and public-first.
- Added “Teesin Machinery Pte Ltd” as the hero brand anchor without inserting the logo asset.
- Replaced the right-side hero action card with a branded trust/operations panel and kept auth awareness as lightweight status content only.

Files changed:
- `src/app/(public-pages)/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The landing page now presents branded hero content and lightweight auth-aware status without duplicating header login or portal actions inside the hero panel.

Risks / follow-up notes:
- Brand colors are still applied inline on this page; if the same palette is reused across more public pages, shared theme tokens would reduce drift.

## 2026-03-14 | Scope: branded auth shell polish

Summary:
- Added a shared branded auth-shell treatment for customer sign-in, customer registration, and admin login using the locked Teesin palette and Lucide-backed context framing.
- Added clear back-to-landing navigation on all three auth entry pages without changing auth logic, validation, or redirect behavior.
- Refined customer auth pages to feel warmer and customer-first, while keeping admin login visually aligned but more restrained and operational.

Files changed:
- `src/components/auth/AuthShell.tsx`
- `src/app/rental/account/login/page.tsx`
- `src/app/rental/account/register/page.tsx`
- `src/app/admin/login/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Customer sign-in, customer registration, and admin login now share a branded auth-shell presentation while preserving existing auth submission and redirect behavior.

Risks / follow-up notes:
- This shared auth-shell is intentionally presentation-focused; deeper form grouping or auth-flow changes should be handled separately if needed.

## 2026-03-10 | Scope: server-side checkout repricing from DB equipment
Summary:
- Added authoritative server-side checkout repricing from DB-backed equipment in the central start-payment path, replaced client pricing snapshot trust with a server-built pricing snapshot before credit, order, invoice, and payment flows, and reused the shared pricing helper on the rental pages for display consistency.

Files changed:
- `src/lib/rental/orders/pricing.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/app/rental/[id]/page.tsx`
- `src/app/rental/checkout/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Existing `POST /api/public/rental/checkout/start-payment` now fetches the published DB equipment row, recomputes the authoritative pricing snapshot server-side, uses that snapshot for credit exposure, order persistence, credit invoicing, and HitPay session amount, and may return a `pricingNotice` when stale client totals were refreshed.
- Rental detail and checkout pages now reuse the shared pricing helper for display estimates, while server repricing remains authoritative at checkout.

Risks / follow-up notes:
- Delivery and collection fees remain fixed values in the shared pricing helper, matching the current architecture; if fulfillment pricing becomes configurable later, this helper should become the single source for that rule as well.
- The client still sends a pricing snapshot for UX continuity, but it is no longer trusted as financial truth in checkout.

## 2026-03-10 | Scope: one-time rental equipment seed backfill path
Summary:
- Added a one-time admin-only seed import path and wrapper command to populate `rental_equipment` from the legacy in-repo seed equipment definitions, using an idempotent seed-missing-rows-only policy that skips existing DB rows by legacy `id` or `slug` to avoid overwriting admin-managed records.

Files changed:
- `src/lib/rental/equipment/db-rental-equipment-repo.ts`
- `src/lib/rental/equipment/seed-import.ts`
- `src/app/api/admin/rental/equipment/import-seed/route.ts`
- `scripts/import-rental-equipment-seed.mjs`
- `package.json`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Added admin-only `POST /api/admin/rental/equipment/import-seed` for one-time seed backfill.
- Added `npm run backfill:rental-equipment` to call the admin import route and print inserted/updated/skipped counts.

Risks / follow-up notes:
- The backfill intentionally skips existing DB rows instead of updating them; this is the lowest-risk merge policy, but if you need a later demo-data refresh for untouched rows, add an explicit opt-in importer rather than broadening this one.
- The wrapper script expects a running app plus `ADMIN_API_KEY`, and uses `APP_BASE_URL` or defaults to `http://localhost:3000`.

## 2026-03-10 | Scope: migrate remaining active localEquipmentRepo reads
Summary:
- Migrated the remaining production-relevant `localEquipmentRepo` reads in active admin flows to the DB-backed admin equipment API, so admin orders and the shared admin equipment selection hook now read authoritative DB equipment data instead of local demo inventory.

Files changed:
- `src/lib/rental/hooks/useAdminEquipments.ts`
- `src/app/admin/rental/orders/page.tsx`
- `src/app/admin/rental/calendar/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Admin orders page now loads equipment metadata from `GET /api/admin/rental/equipment`.
- `useAdminEquipments` now loads admin equipment from the DB-backed admin equipment API instead of `localEquipmentRepo`.
- Admin rental calendar no longer imports `localEquipmentRepo`; it uses the DB-backed hook for equipment selection.

Risks / follow-up notes:
- The older calendar screen still has localStorage-backed order/hold behavior in parts of the view, but its equipment metadata source is now DB-backed; migrating those operational datasets can be handled separately without reintroducing equipment split-truth.
- `src/lib/rental/equipment-repo.ts` remains in the codebase as legacy/demo-only code, but no active page or hook now imports `localEquipmentRepo`.

## 2026-03-10 | Scope: overdue automation v1 foundation
Summary:
- Added a reusable overdue reminder service that reuses existing invoice payment totals, overdue status logic, PDF email delivery, and invoice email history to process overdue reminders safely with a DB-backed guard window.
- Extended the existing admin reminder route to support both single-invoice reminder sends and batch overdue reminder runs with structured reporting and optional dry-run behavior.

Files changed:
- `src/lib/rental/invoices/overdue-reminder-service.ts`
- `src/app/api/admin/rental/invoices/remind/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- No schema changes.
- No new migrations.

API / Page changes:
- Existing `POST /api/admin/rental/invoices/remind` now supports:
  - single invoice processing via `invoiceId`
  - batch overdue processing when `invoiceId` is omitted
  - configurable `guardWindowHours`
  - optional `dryRun`
  - structured per-invoice results and summary totals

Risks / follow-up notes:
- The v1 duplicate guard uses existing `rental_invoice_emails` reminder history and a time window; it intentionally avoids broader sequencing logic such as reminder cadence stages.
- Batch runs currently iterate issued invoices through application logic rather than a dedicated SQL candidate query; this keeps reuse high and risk low for v1, but can be optimized later if invoice volume grows materially.

## 2026-03-10 | Scope: reminder automation v2 staged policy + admin settings
Summary:
- Added DB-backed system settings storage for admin org/notification settings plus rental invoice reminder policy, and moved the existing admin settings page onto local Next.js admin settings routes.
- Upgraded overdue reminders from a simple guard-window model to staged first/second/final reminder logic derived from existing reminder email history, with DB-configured reminder thresholds, guard window, and batch limit.

Files changed:
- `docs/sql/system_settings_v1.sql`
- `src/lib/settings/db-admin-settings-repo.ts`
- `src/app/api/admin/settings/route.ts`
- `src/app/api/admin/settings/test-email/route.ts`
- `src/app/admin/settings/page.tsx`
- `src/lib/rental/invoices/overdue-reminder-service.ts`
- `src/app/api/admin/rental/invoices/remind/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/system_settings_v1.sql` to create `system_settings` and seed defaults for admin org settings, notification routing, and rental invoice reminder policy.

API / Page changes:
- Added `GET/PUT /api/admin/settings` backed by `system_settings`.
- Added `POST /api/admin/settings/test-email` for the existing admin settings page test-email action.
- Existing `POST /api/admin/rental/invoices/remind` now uses DB-backed reminder policy by default and returns staged reminder results plus effective policy.
- Admin settings page now includes reminder automation controls for enable/disable, first/second/final overdue days, guard window hours, and batch limit.

Risks / follow-up notes:
- Reminder stage derivation relies on existing reminder email history and subject parsing; older generic reminder sends are mapped sequentially as first/second/final to preserve idempotency without adding mutable invoice stage state.
- The new local admin settings routes replace the previous backend-proxy usage for this page; if other external services still depend on the old backend settings endpoint, that integration should be reviewed separately.

## 2026-03-10 | Scope: deposit accounting v1
Summary:
- Added an explicit deposit ledger model using `rental_order_deposits` plus `rental_deposit_transactions`, so deposit requirement, held amount, outstanding amount, and payment/invoice linkage are now auditable without treating refundable deposits as rental revenue.
- Updated checkout so upfront payment sessions charge rental invoice amount plus refundable deposit together, while server-side automation splits that payment into invoice settlement vs deposit-held accounting; credit checkout now persists deposit requirement explicitly as pending.

Files changed:
- `docs/sql/rental_order_deposits_v1.sql`
- `src/lib/rental/deposits/types.ts`
- `src/lib/rental/deposits/db-rental-deposit-repo.ts`
- `src/lib/rental/payments/db-payment-allocation-repo.ts`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `src/lib/rental/invoices/checkout-credit-automation.ts`
- `src/app/api/admin/rental/invoices/route.ts`
- `src/app/api/admin/rental/orders/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/app/admin/rental/customers/[id]/page.tsx`
- `src/app/rental/checkout/page.tsx`
- `src/app/rental/checkout/status/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_order_deposits_v1.sql` to create:
  - `rental_order_deposits`
  - `rental_deposit_transactions`
- Reused existing `rental_payment_allocations` by adding deposit allocations in application logic (`allocation_type = 'deposit'`) without changing historical invoice allocation behavior.

API / Page changes:
- Existing `POST /api/public/rental/checkout/start-payment` now charges upfront sessions for rental invoice amount plus refundable deposit when deposit is required, while credit exposure remains based on rental charges only.
- Checkout payment automation now records invoice payment against the rental invoice amount only, and separately records held deposit accounting linked to the same payment session.
- Existing `GET /api/admin/rental/orders` now includes `depositSummariesByOrderId`.
- Admin rental orders page and admin customer overview now show deposit required / held / outstanding state.
- Customer checkout and checkout status pages now distinguish rental charges from refundable deposit in the displayed totals.

Risks / follow-up notes:
- Deposit v1 records requirement and collection only. Refund, release, partial retention, and admin deposit workflows are intentionally left for a future pass, but the ledger schema is ready for them.
- Credit checkout currently records deposit requirement as pending rather than collecting it immediately; if deposit collection should be mandatory for credit customers, that should be added in a separate server-side policy task.

## 2026-03-10 | Scope: deposit release / refund workflow v2
Summary:
- Extended the deposit ledger so admin can record full release, full retention, or split release-plus-retention against held deposits with explicit transaction history, validation, and unresolved-balance tracking.
- Added a minimal admin resolution workflow on the existing rental orders page plus a focused admin deposit route, while keeping release as an accounting-recorded refund/release event rather than pretending gateway refunds are automated.

Files changed:
- `docs/sql/rental_order_deposits_resolution_v2.sql`
- `src/lib/rental/deposits/types.ts`
- `src/lib/rental/deposits/db-rental-deposit-repo.ts`
- `src/app/api/admin/rental/orders/[id]/deposit/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/app/rental/checkout/status/page.tsx`
- `src/app/api/public/rental/checkout/payment-status/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_order_deposits_resolution_v2.sql` to extend:
  - `rental_order_deposits` with latest resolution metadata and resolved timestamp
  - `rental_deposit_transactions` with `recorded_by` and `external_reference`

API / Page changes:
- Added admin-protected `GET/POST /api/admin/rental/orders/[id]/deposit`:
  - `GET` returns current deposit summary plus transaction history
  - `POST` records release / retain / split resolution against held deposit with structured response data
- Admin rental orders page now supports inline deposit resolution and shows recent deposit activity.
- Public checkout status now surfaces current deposit state when a deposit exists.

Risks / follow-up notes:
- Release/refund in v2 is an explicit accounting event only. No HitPay refund API integration is performed yet, so any actual payout must still be executed outside this flow and optionally recorded via reference.
- The current admin auth model still does not provide a trustworthy per-admin identity for ledger writes, so `recorded_by` remains available for future use but is not populated automatically in this version.

## 2026-03-11 | Scope: customer portal improvements v1
Summary:
- Added a logged-in customer portal at `/rental/account` backed by a new authenticated overview route that reuses existing DB-first customer, invoice, payment, deposit, and credit-control aggregation without exposing admin-only fields.
- Extended the shared customer overview read model with invoice outstanding balances and deposit resolution amounts so the portal can show invoices, payments, overdue status, notices, and deposit state from existing accounting truth.

Files changed:
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/lib/rental/customers/portal-types.ts`
- `src/lib/rental/customers/db-rental-customer-portal-overview.ts`
- `src/app/api/public/rental/account/overview/route.ts`
- `src/app/rental/account/page.tsx`
- `src/app/rental/page.tsx`
- `src/app/rental/checkout/status/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.
- Reused existing authenticated customer resolution and DB-backed overview/accounting reads.

API / Page changes:
- Added `GET /api/public/rental/account/overview` for authenticated customer-safe portal data only.
- Added `/rental/account` with Account Summary, Recent Orders, Invoices, Payments, Deposit Status, and Account Notices sections.
- Added minimal `My account` entry points from the rental catalog and checkout status pages.

Risks / follow-up notes:
- Invoice PDF/download access is still admin-oriented; the customer portal currently exposes invoice/payment visibility but not customer self-service downloads.
- The portal currently surfaces recent notice history from existing invoice email events. If broader customer-safe notice types are added later, they should be folded into the same read model rather than creating parallel state.

## 2026-03-14 | Scope: admin customer detail workspace polish

Summary:
- Polished the admin customer detail page into a stronger account workspace with a richer customer identity header, grouped financial summary cards, and a more cohesive credit-control module.
- Added Lucide-backed section identity across customer info, finance, credit, account settings, notes, and recent activity tables without changing overview data or business logic.
- Replaced older sky-blue accents on the page with the locked Teesin admin palette for focus states, selected emphasis, and primary save actions.

Files changed:
- `src/app/admin/rental/customers/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin customer detail page now presents the same overview data in a more structured customer-account workspace without changing save or navigation behavior.

Risks / follow-up notes:
- The page remains a large single component; a later maintainability pass could extract presentation-only sections without changing customer or credit-control logic.

## 2026-03-14 | Scope: admin invoice detail finance workspace polish

Summary:
- Polished the admin invoice detail page into a clearer finance workspace with a stronger invoice header, grouped action bands, and a more deliberate right-side finance control rail.
- Improved payment emphasis, section identity, and lower payment/email activity areas using Lucide icons and the locked Teesin admin palette without changing invoice, payment, email, or PDF behavior.
- Replaced older sky-blue accents on the page with Teesin-aligned focus and action styling while preserving semantic finance state colors.

Files changed:
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin invoice detail page now groups finance actions and payment context more clearly while preserving the existing invoice preview, payment history, email history, and PDF workflows.

Risks / follow-up notes:
- Direct customer-account navigation was not added because the current invoice detail payload does not expose a reusable customer route target without new data fetching.

## 2026-03-15 | Scope: admin settings workspace split

Summary:
- Split the admin settings UI into a sidebar-based workspace with dedicated pages for organisation, notifications, operations, reminder automation, and developer tools.
- Added a shared frontend settings hook so each settings page continues to load with `GET /api/admin/settings` and save the full settings object with `PUT /api/admin/settings`.
- Replaced older indigo accents in the settings UI with the Teesin admin palette and kept all existing backend DTOs, API routes, and behaviors unchanged.

Files changed:
- `src/lib/admin-settings/use-admin-settings.ts`
- `src/app/admin/settings/layout.tsx`
- `src/app/admin/settings/page.tsx`
- `src/app/admin/settings/_components.tsx`
- `src/app/admin/settings/organisation/page.tsx`
- `src/app/admin/settings/notifications/page.tsx`
- `src/app/admin/settings/operations/page.tsx`
- `src/app/admin/settings/reminders/page.tsx`
- `src/app/admin/settings/developer/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- `/admin/settings` now acts as a sidebar-based workspace entry point and routes the user into dedicated settings sections while preserving the existing `GET /api/admin/settings` and `PUT /api/admin/settings` behavior.

Risks / follow-up notes:
- Each settings page loads settings independently through the shared hook; if cross-page unsaved-state persistence is needed later, that should be added as a separate provider-based enhancement.

## 2026-03-15 | Scope: admin sidebar nav highlight fix

Summary:
- Tightened admin sidebar path matching so `Rental Inventory` only highlights on the exact `/admin/rental` route instead of all deeper rental subpages.
- Replaced the remaining sky-blue sidebar active and brand treatments with restrained Teesin palette accents while preserving the existing hover-expand layout and nav structure.

Files changed:
- `src/app/admin/layout.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Sidebar active-state matching now distinguishes exact versus prefix matches so rental subpages highlight the correct navigation item.

Risks / follow-up notes:
- If more admin rental subroutes are added later, they should explicitly choose exact or prefix matching in the same sidebar config to avoid reintroducing broad base-path highlights.

## 2026-03-15 | Scope: organisation billing identity settings

Summary:
- Extended admin organisation settings to store richer billing identity and bank details, using the existing settings persistence path without changing API routes or DTO grouping structure.
- Reworked the Organisation Details UI into grouped business identity, contact, and payment sections while preserving the current settings workspace flow.
- Updated the admin invoice detail preview to use organisation settings as the primary source for supplier identity and payment instructions, with graceful fallback to the existing invoice supplier snapshot when fields are missing.

Files changed:
- `src/lib/settings/db-admin-settings-repo.ts`
- `src/app/api/admin/settings/route.ts`
- `src/lib/admin-settings/use-admin-settings.ts`
- `src/app/admin/settings/organisation/page.tsx`
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.
- Reused the existing `system_settings` storage for richer organisation billing identity and bank details instead of introducing a separate billing-profile store.

API / Page changes:
- Existing `GET /api/admin/settings` and `PUT /api/admin/settings` now carry the expanded organisation fields through the same settings DTO shape.
- Admin settings `Organisation` now exposes grouped company identity, contact, and payment detail fields.
- Admin invoice detail preview now prefers organisation settings for supplier identity and payment instructions while falling back to the stored invoice supplier snapshot.

Risks / follow-up notes:
- The invoice preview is now aligned to organisation settings, but other render paths that still read invoice supplier snapshots directly may need the same organisation-first resolution separately.

## 2026-03-15 | Scope: PDF supplier identity alignment

Summary:
- Updated invoice and receipt PDF rendering to prefer organisation settings for supplier identity and bank/payment details while keeping invoice supplier snapshots as fallback.
- Added a small shared server-side supplier-profile resolver so admin invoice preview and generated PDFs now follow the same organisation-first sourcing approach.
- Preserved existing invoice calculations, lifecycle rules, and PDF layout structure while removing hardcoded bank placeholders from the invoice PDF path.

Files changed:
- `src/lib/rental/invoices/pdf-supplier-profile.ts`
- `src/lib/rental/invoices/invoice-pdf.ts`
- `src/lib/rental/invoices/receipt-pdf.ts`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Invoice and receipt PDFs now resolve supplier identity and invoice-payment instructions using the same organisation-settings-first logic as the admin invoice preview.

Risks / follow-up notes:
- Persisted `inv.supplier` snapshot data remains as fallback for older invoices and for resilience when organisation settings are incomplete.

## 2026-03-15 | Scope: admin settings GET cache bypass

Summary:
- Marked `GET /api/admin/settings` as explicitly dynamic with zero revalidation so admin settings reads always come from the latest persisted Supabase values after save and refresh.
- Kept the existing settings repo, response DTO shape, and PUT save path unchanged.

Files changed:
- `src/app/api/admin/settings/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- Existing `GET /api/admin/settings` is now forced dynamic with zero revalidation so saved settings values are read fresh from Supabase after refresh.

Risks / follow-up notes:
- If stale reads are still observed after this fix, the next likely source would be client-side fetch caching rather than the settings repo or API route itself.

## 2026-03-11 | Scope: customer invoice detail/pdf + customer password reset
Summary:
- Added customer-owned invoice detail and PDF download flows using existing invoice repos, payment totals, deposit summaries, and the shared invoice PDF renderer with strict customer ownership checks.
- Added a DB-backed forgot/reset password flow for customer accounts with hashed reset tokens, expiry, single-use semantics, per-customer resend/rate guards, and reset email delivery using the existing email-provider pattern.

Files changed:
- `docs/sql/customer_password_resets_v1.sql`
- `src/lib/auth/customer-password-reset-repo.ts`
- `src/lib/auth/customer-password-reset.ts`
- `src/lib/rental/invoices/customer-invoice-access.ts`
- `src/app/api/public/rental/invoices/[invoiceId]/route.ts`
- `src/app/api/public/rental/invoices/[invoiceId]/pdf/route.ts`
- `src/app/api/public/rental/auth/forgot-password/route.ts`
- `src/app/api/public/rental/auth/reset-password/route.ts`
- `src/app/rental/account/page.tsx`
- `src/app/rental/account/invoices/[invoiceId]/page.tsx`
- `src/app/rental/account/login/page.tsx`
- `src/app/rental/forgot-password/page.tsx`
- `src/app/rental/reset-password/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/customer_password_resets_v1.sql` for hashed customer reset tokens with expiry and single-use tracking.
- Reused existing Supabase customer auth, invoice/payment repos, deposit ledger, and invoice PDF renderer instead of introducing parallel systems.

API / Page changes:
- Added `GET /api/public/rental/invoices/[invoiceId]` for authenticated customer-safe invoice detail.
- Added `GET /api/public/rental/invoices/[invoiceId]/pdf` for authenticated customer-owned invoice PDF download.
- Added `POST /api/public/rental/auth/forgot-password` and `GET/POST /api/public/rental/auth/reset-password`.
- Added `/rental/account/invoices/[invoiceId]`, `/rental/forgot-password`, and `/rental/reset-password`.
- Customer portal invoice cards now link to detail pages and expose PDF download for issued invoices.

Risks / follow-up notes:
- Password reset email delivery uses the same provider/env pattern as the current email infrastructure, but there is still no dedicated customer email log/history table for reset emails.
- Reset token invalidation is DB-backed and safe for normal reruns, but it is not wrapped in a DB transaction with the auth password update; if stronger cross-system atomicity is needed later, that should be handled in a dedicated auth hardening pass.

## 2026-03-11 | Scope: checkout page pricing access crash fix
Summary:
- Fixed the customer checkout runtime crash caused by one stale direct `equipment.pricing.deposit` read when some DB-backed equipment payloads do not include a nested pricing block at render time.
- Normalized checkout pricing access to use a single safe pricing source and the existing repriced deposit value, keeping deposit display aligned with current pricing logic.

Files changed:
- `src/app/rental/checkout/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- Customer checkout page now uses normalized pricing access and no longer dereferences `equipment.pricing` directly in the deposit card.

Risks / follow-up notes:
- The DB-backed equipment repo still intends to return nested `pricing`; this fix hardens the checkout page against incomplete payloads without changing catalog or repricing behavior.

## 2026-03-11 | Scope: customer invoice payment v1
Summary:
- Added customer-owned invoice payment initiation from the portal using HitPay for the current DB-authoritative outstanding balance only, with strict auth-based ownership checks and no client-supplied amount trust.
- Reused the existing payment session table and HitPay webhook flow by adding a focused customer-invoice settlement automation branch that records invoice payment and allocation only after webhook-confirmed payment.

Files changed:
- `src/lib/rental/invoices/customer-invoice-payment-automation.ts`
- `src/app/api/public/rental/invoices/[invoiceId]/pay/route.ts`
- `src/app/api/public/rental/payments/hitpay/webhook/route.ts`
- `src/app/rental/account/invoices/[invoiceId]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.
- Reused existing `rental_order_payment_sessions`, invoice payment recording, payment allocation, and HitPay request/webhook infrastructure.

API / Page changes:
- Added `POST /api/public/rental/invoices/[invoiceId]/pay` for authenticated customer-owned invoice payment session creation.
- Customer invoice detail page now shows `Pay Now` only for payable issued invoices with outstanding balance and redirects to HitPay.
- Customer invoice detail page shows a lightweight submitted notice on return while webhook-confirmed payment status catches up.

Risks / follow-up notes:
- v1 only supports paying the full current outstanding balance for one invoice at a time.
- If an invoice balance changes after the payment session is created but before webhook settlement, the automation applies up to the remaining balance and records any residual as unapplied in session metadata for audit; a fuller overpayment/reconciliation workflow would be a separate follow-up.

## 2026-03-11 | Scope: equipment return and inspection workflow v1
Summary:
- Added an admin-driven post-rental workflow for recording return state, inspection state, returned timestamp, and operational notes directly on rental orders, while keeping deposit release and retention as a separate follow-on workflow.
- Extended customer portal recent-order visibility with customer-safe return and inspection status so customers can see post-rental progress without operational editing or internal note exposure.

Files changed:
- `docs/sql/rental_order_return_inspection_v1.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/app/api/admin/rental/orders/[id]/operations/route.ts`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/lib/rental/customers/portal-types.ts`
- `src/app/admin/rental/orders/page.tsx`
- `src/app/rental/account/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_order_return_inspection_v1.sql` to extend `rental_orders` with explicit return and inspection workflow fields.
- Reused the existing `rental_orders` table and order repo instead of introducing a disconnected operational subsystem for v1.

API / Page changes:
- Added `POST /api/admin/rental/orders/[id]/operations` for admin-only return and inspection updates.
- Admin rental orders page now includes a `Return / Inspect` panel for recording returned state, inspection outcome, notes, and workflow completion.
- Customer portal recent orders now show customer-safe return status, returned date, inspection status, and workflow completion date.

Risks / follow-up notes:
- v1 stores the current return and inspection state directly on `rental_orders`; detailed checklists, condition grading, and photo evidence should be added later in a dedicated return module if needed.
- Per-admin actor identity is still not recorded because the current admin auth path does not expose a trustworthy individual admin identity.

## 2026-03-11 | Scope: customer receipt self-service and statement summary improvements
Summary:
- Audited the existing portal and finance stack and found that recent payments, invoice visibility, and receipt email history already existed, but customer-owned receipt downloads and aging-bucket statement summaries were still missing.
- Added a customer-safe receipt PDF download route for owned invoice payments and extended the portal overview with open-invoice counts, current vs overdue balances, and aging buckets derived from invoice and payment truth.

Files changed:
- `src/lib/rental/invoices/db-payment-repo.ts`
- `src/lib/rental/invoices/customer-payment-receipt-access.ts`
- `src/lib/rental/invoices/receipt-pdf.ts`
- `src/app/api/public/rental/payments/[paymentId]/receipt/route.ts`
- `src/lib/rental/customers/portal-types.ts`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/lib/rental/customers/db-rental-customer-portal-overview.ts`
- `src/app/rental/account/page.tsx`
- `src/app/rental/account/invoices/[invoiceId]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.
- Reused existing invoice, payment, customer-auth, and portal overview infrastructure instead of introducing a parallel statement store.

API / Page changes:
- Added `GET /api/public/rental/payments/[paymentId]/receipt` for authenticated customer-owned receipt PDF download.
- Customer invoice detail payment history now exposes receipt download links per recorded payment.
- Customer portal recent payments now expose receipt download links and the account page now includes a read-only statement summary with open invoices and aging buckets.

Risks / follow-up notes:
- Receipt PDFs are newly rendered from current payment and invoice truth; they are not yet stored as durable receipt artifacts.
- Aging buckets are derived from current invoice due dates and outstanding balances, which is appropriate for v1 but not a substitute for a formal month-end statement snapshot if that is needed later.

## 2026-03-11 | Scope: rental extension workflow v1
Summary:
- Added a DB-backed rental extension request model linked to the original order, with server-side request-window checks, extension pricing estimates, availability checks, admin review, and customer-safe portal visibility.
- Reused the existing availability, pricing, credit-control, invoice, HitPay session, and webhook-confirmed payment infrastructure so approved upfront extensions require payment before confirmation, while eligible credit extensions can be confirmed on invoice terms.

Files changed:
- `docs/sql/rental_order_extensions_v1.sql`
- `src/lib/rental/extensions/types.ts`
- `src/lib/rental/extensions/db-rental-order-extension-repo.ts`
- `src/lib/rental/extensions/rental-extension-service.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/app/api/public/rental/orders/[id]/extensions/route.ts`
- `src/app/api/public/rental/extensions/[extensionId]/pay/route.ts`
- `src/app/api/admin/rental/orders/[id]/extensions/route.ts`
- `src/app/api/admin/rental/orders/[id]/extensions/[extensionId]/route.ts`
- `src/app/api/public/rental/payments/hitpay/webhook/route.ts`
- `src/lib/rental/customers/portal-types.ts`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/lib/rental/customers/db-rental-customer-portal-overview.ts`
- `src/app/rental/account/page.tsx`
- `src/app/admin/rental/orders/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_order_extensions_v1.sql` to create `rental_order_extensions` with auditable request, review, payment, and confirmation state.
- Reused existing `rental_order_payment_sessions`, invoice issuance, invoice payment mapping, credit evaluation, and order period update paths rather than mutating order dates directly from the customer portal.

API / Page changes:
- Added `POST /api/public/rental/orders/[id]/extensions` for authenticated customer extension requests.
- Added `POST /api/public/rental/extensions/[extensionId]/pay` for customer-owned approved extension payment initiation.
- Added `GET /api/admin/rental/orders/[id]/extensions` and `POST /api/admin/rental/orders/[id]/extensions/[extensionId]` for admin review.
- Existing HitPay webhook now handles `paymentMode = "order_extension"` to confirm paid extensions server-side.
- Customer portal now shows extension requests per order, allows lightweight request submission, and exposes payment actions only when admin approval requires upfront payment.
- Admin rental orders page now includes an inline extension review panel for approve/reject actions.

Risks / follow-up notes:
- v1 stores only the extension request/review/payment workflow. It does not add negotiation threads, auto-suggested alternatives, or extension-specific reminder automation.
- Extension invoices are created as separate invoices linked to the same parent order. That preserves auditability for v1, but if a future finance policy requires a distinct extension-order or more formal statement grouping, that should be handled in a dedicated accounting pass.

## 2026-03-12 | Scope: extension request customer-safe wording
Summary:
- Audited the existing customer extension flow and found the submit/status wording did not clearly state that pending review does not reserve availability.
- Reused the existing extension service and customer portal surfaces to show `Extension request submitted for review.` plus `Approval depends on availability and account review.` without changing workflow logic or schema.

Files changed:
- `src/lib/rental/extensions/customer-messages.ts`
- `src/lib/rental/extensions/rental-extension-service.ts`
- `src/app/rental/account/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- Existing `POST /api/public/rental/orders/[id]/extensions` now returns the clarified customer-safe review wording for new pending requests.
- Customer portal extension cards and request area now show the same non-reservation clarification while status is `awaiting_admin_review`.

Risks / follow-up notes:
- Older pending extension rows keep their original stored `customerMessage`, so the portal now applies the clarified wording at render time for `awaiting_admin_review` records without rewriting historical data.

## 2026-03-12 | Scope: return reminder + extension CTA automation v1
Summary:
- Audited the existing reminder stack and confirmed overdue invoice reminders, admin reminder triggering, and invoice email history already existed, but return-date reminder automation and non-invoice reminder idempotency did not.
- Added a DB-backed return reminder event log, a safe admin-triggered return reminder engine for active rentals nearing end date, and customer-safe extension CTA messaging that does not imply availability is reserved.

Files changed:
- `docs/sql/rental_order_reminder_events_v1.sql`
- `src/lib/rental/invoices/email-delivery.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/lib/rental/orders/db-order-reminder-event-repo.ts`
- `src/lib/rental/orders/return-reminder-service.ts`
- `src/app/api/admin/rental/orders/return-reminders/route.ts`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_order_reminder_events_v1.sql` for non-invoice rental order reminder events with per-order/stage sent dedupe.
- Reused the existing email provider wiring and admin reminder service pattern instead of redesigning the mail stack or altering overdue reminder automation.

API / Page changes:
- Added protected `POST /api/admin/rental/orders/return-reminders` for dry-run or live return reminder processing by order or batch.
- Active return reminders now send a customer-safe extension CTA that points customers back to the existing portal workflow and states that approval depends on availability and account review.

Risks / follow-up notes:
- v1 keeps return reminder policy route-driven with safe defaults (`3`, `1`, and optionally `0` days) rather than expanding admin settings/UI in the same pass.
- The sent-stage dedupe is DB-backed and safe for reruns; like the existing overdue reminder flow, it is not a fully transactional send-lock for simultaneous parallel runs.

## 2026-03-12 | Scope: equipment maintenance / downtime blocking v1
Summary:
- Audited the rental scheduling stack and confirmed per-equipment maintenance buffer days, DB-backed availability holds, DB-backed equipment inventory, and admin settings already existed, but explicit downtime blocking was still missing from production availability truth and the calendar still relied on localStorage for operational order/hold data.
- Added a DB-backed equipment downtime model, wired downtime into checkout hold acquisition and extension availability reads, replaced the calendar’s authoritative operational data with DB-backed orders/downtime, and added a minimal admin downtime workflow plus an admin/settings operations default for maintenance buffer fallback.

Files changed:
- `docs/sql/rental_equipment_downtime_v1.sql`
- `src/lib/rental/downtime/types.ts`
- `src/lib/rental/downtime/db-rental-equipment-downtime-repo.ts`
- `src/app/api/admin/rental/downtime/route.ts`
- `src/app/api/admin/rental/downtime/[id]/route.ts`
- `src/lib/rental/holds/db-rental-availability-service.ts`
- `src/lib/rental/extensions/rental-extension-service.ts`
- `src/app/admin/rental/calendar/page.tsx`
- `src/app/admin/rental/orders/page.tsx`
- `src/app/admin/rental/page.tsx`
- `src/lib/settings/db-admin-settings-repo.ts`
- `src/app/api/admin/settings/route.ts`
- `src/app/admin/settings/page.tsx`
- `src/lib/rental/server-equipment-config.ts`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_equipment_downtime_v1.sql` to create `rental_equipment_downtime` and to extend `acquire_rental_availability_hold(...)` so checkout hold acquisition counts active downtime against available units.
- Reused the existing `system_settings` table for a minimal operations policy (`defaultMaintenanceBufferDays`) instead of introducing a separate settings store.

API / Page changes:
- Added protected `GET/POST /api/admin/rental/downtime` and `PATCH /api/admin/rental/downtime/[id]` for minimal downtime create/list/cancel workflows.
- Checkout availability snapshots and extension availability evaluation now subtract active downtime quantities.
- Admin rental calendar now loads DB-backed orders and downtime instead of localStorage for production scheduling data, while preserving local lane-assignment persistence as a UI-only aid.
- Admin settings now expose a minimal operations default for maintenance buffer fallback only.

Risks / follow-up notes:
- v1 models operational blocking only; it does not add work orders, technician workflows, recurring schedules, or maintenance completion checklists.
- The calendar still keeps lane-assignment persistence in localStorage as a presentation aid, but orders and downtime are now DB-backed operational truth.

## 2026-03-12 | Scope: admin rental calendar downtime UX refinement

Summary:
- Extended DB-backed downtime records with optional unit assignments for lane-targeted downtime while preserving legacy quantity-based compatibility.
- Added server-authoritative downtime conflict preview and confirmation against active orders, overlapping downtime, and pending or approved extension periods.
- Refined the admin rental calendar with quick filters, a scrollable downtime list, richer downtime drawer details, and clearer admin-facing buffer behavior messaging.

Files changed:
- `docs/sql/rental_equipment_downtime_v1_5_unit_assignments.sql`
- `src/lib/rental/downtime/types.ts`
- `src/lib/rental/downtime/db-rental-equipment-downtime-repo.ts`
- `src/lib/rental/downtime/downtime-conflicts.ts`
- `src/app/api/admin/rental/downtime/route.ts`
- `src/app/api/admin/rental/downtime/[id]/route.ts`
- `src/app/admin/rental/calendar/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_equipment_downtime_v1_5_unit_assignments.sql` to extend downtime rows with optional unit assignments while keeping quantity-based compatibility.

API / Page changes:
- Existing `POST /api/admin/rental/downtime` now supports conflict preview and conflict-confirmed create flow using the same server-authoritative validation path.
- Admin rental calendar now supports unit-targeted downtime creation, quick filters, richer drawer details, and a more usable downtime list without changing downtime business rules.

Risks / follow-up notes:
- Unit assignment remains pseudo-unit scheduling based on equipment unit count, not a full physical asset registry.
- Order conflict checks remain equipment-level because orders themselves are not assigned to physical unit identities.

## 2026-03-14 | Scope: admin rental calendar workspace polish

Summary:
- Polished the admin rental calendar into a clearer operational workspace with stronger header hierarchy, grouped controls, and selected-equipment context.
- Refined downtime creation, current downtime, legend, conflict surfacing, timeline readability, and detail-drawer presentation using restrained Teesin-brand accents and Lucide icons.
- Kept calendar, downtime, availability, and drawer behavior unchanged while improving scanability and operator orientation.

Files changed:
- `src/app/admin/rental/calendar/page.tsx`
- `src/app/admin/dashboard/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin rental calendar now presents the same planning controls and workflows with clearer hierarchy, selected-equipment context, and detail-drawer grouping.

Risks / follow-up notes:
- `src/app/admin/dashboard/page.tsx` was touched only to restore it as a valid module so TypeScript could pass; no dashboard behavior was redesigned in this pass.

## 2026-03-14 | Scope: admin rental calendar layout rebalance

Summary:
- Rebalanced the admin rental calendar so the timeline sits higher as the primary workspace, with compact scope controls above it and lower-priority display controls moved lower in the page flow.
- Made the right-side detail drawer usable for long content by keeping a fixed shell/header and a scrollable content region.
- Kept calendar, downtime, availability, lane assignment, and drawer actions unchanged while reducing top-heaviness and improving operator access to controls and details.

Files changed:
- `src/app/admin/rental/calendar/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin rental calendar now places equipment/date scope controls above the timeline while moving lower-priority display controls and supporting panels lower in the page flow.

Risks / follow-up notes:
- The page still carries a large amount of presentation and workflow logic in one file; this entry only rebalanced layout and drawer overflow handling.

## 2026-03-14 | Scope: admin rental orders workspace polish

Summary:
- Refined the admin rental orders page into a more operations-led workspace with clearer header hierarchy, triage filters, attention-focused summary cards, and improved row scanability.
- Simplified row actions by separating primary actions from secondary actions and moved return, inspection, deposit, and extension workflows into a contained right-side order workspace instead of inline expanding table rows.
- Kept the existing DB-backed order, invoice, deposit, return/inspection, extension, downtime, and developer-delete behavior unchanged while improving usability and operator focus.

Files changed:
- `src/app/admin/rental/orders/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin rental orders page now emphasizes triage, operations state, and contained right-side workflow handling without changing the underlying order workflows or endpoints.

Risks / follow-up notes:
- Extension-attention filtering still relies on the extension data loaded into the page state; if broader server-backed triage is needed later, that should be added as a separate enhancement.

## 2026-03-14 | Scope: admin invoice list finance workspace polish

Summary:
- Refined the admin invoice list into a calmer finance and credit-control workspace with a stronger header, finance-first summary cards, and clearer filter/control grouping.
- Improved invoice row scanability by emphasizing due dates, overdue and unpaid states, outstanding balances, and communication status while keeping the existing DB-backed listing, filters, sorting, pagination, and export behavior intact.
- Applied restrained Teesin-brand accents and Lucide icons for page identity and utility actions without changing invoice or payment business logic.

Files changed:
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin invoice list now presents the same DB-backed receivables data with stronger finance hierarchy, summary signals, and control grouping.

Risks / follow-up notes:
- Top-level finance summaries are still derived from the currently loaded result set rather than a separate global receivables aggregate.

## 2026-03-17 | Scope: admin user manual added

Summary:
- Added a concise admin user manual covering the main rental admin workspaces: overview, inventory, orders, calendar, customers, and invoices.
- Documented page purpose, key concepts, step-by-step use, and operational warnings using real UI terminology rather than developer internals.
- Kept the documentation user-facing and aligned to currently implemented features only.

Files changed:
- `docs/admin-user-manual/01-overview.md`
- `docs/admin-user-manual/02-equipment.md`
- `docs/admin-user-manual/03-orders.md`
- `docs/admin-user-manual/04-calendar.md`
- `docs/admin-user-manual/05-customers.md`
- `docs/admin-user-manual/06-invoices.md`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Added user-manual documentation only; no application behavior changed.

Risks / follow-up notes:
- The manual should be updated alongside future UI changes so labels and step-by-step guidance stay aligned with the product.

## 2026-03-14 | Scope: admin invoice top-section tightening

Summary:
- Tightened the admin invoice page top-right action area by grouping secondary actions more compactly and keeping the main CSV export visually primary.
- Updated the lifecycle snapshot card to display Draft, Issued, and Void horizontally in a single balanced row.
- Kept all invoice actions, exports, metrics, and business behavior unchanged while refining only the top section layout.

Files changed:
- `src/app/admin/rental/invoices/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin invoice list top section now presents export and utility actions more compactly and shows the lifecycle snapshot as a single horizontal row.

Risks / follow-up notes:
- If more utility actions are added later, the header may need an overflow pattern rather than continued horizontal expansion.

## 2026-03-14 | Scope: admin rental customers workspace polish

Summary:
- Refined the admin rental customers page into a clearer customer-account workspace with a stronger header, more polished search area, clearer customer-state chips, and improved selected-row visibility.
- Strengthened the right-side master-detail panel into a more deliberate customer summary and controls workspace with grouped account controls, notes, and follow-through actions.
- Replaced older sky/blue accents with restrained Teesin-aligned styling and added Lucide icons where they improved hierarchy and scanability without changing customer business logic.

Files changed:
- `src/app/admin/rental/customers/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- The admin rental customers page now presents the same searchable master-detail workflow with stronger customer state visibility and a more deliberate detail panel.

Risks / follow-up notes:
- The customer list remains a simple table-based triage view; if higher-volume customer operations are needed later, quick filters can be added separately without changing the underlying workflow.

## 2026-03-14 | Scope: buffer snapshots, early release, and public availability fixes

Summary:
- Fixed the maintenance buffer read path so equipment without an explicit override uses the saved operations default instead of a hardcoded fallback.
- Added order-level maintenance buffer snapshots plus DB-backed per-order-unit buffer release overrides so future bookings use the latest default while existing bookings keep their original applied buffer.
- Added a public availability endpoint and updated customer rental detail and checkout pages to show server-authoritative available units for the selected date range.

Files changed:
- `docs/sql/rental_order_buffer_controls_v1.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/lib/rental/orders/db-order-buffer-override-repo.ts`
- `src/lib/rental/availability.ts`
- `src/lib/rental/holds/db-rental-availability-service.ts`
- `src/lib/rental/extensions/rental-extension-service.ts`
- `src/lib/rental/equipment/db-rental-equipment-repo.ts`
- `src/app/api/admin/rental/orders/route.ts`
- `src/app/api/admin/rental/orders/[id]/buffer-release/route.ts`
- `src/app/api/public/rental/equipment/[id]/availability/route.ts`
- `src/app/admin/rental/calendar/page.tsx`
- `src/app/admin/rental/orders/page.tsx`
- `src/app/admin/rental/page.tsx`
- `src/app/rental/[id]/page.tsx`
- `src/app/rental/checkout/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added append-only SQL migration `docs/sql/rental_order_buffer_controls_v1.sql` for order-level maintenance buffer snapshots and per-order-unit buffer overrides.
- Reused the existing availability and equipment settings infrastructure instead of changing the overall buffer model.

API / Page changes:
- Added admin `POST /api/admin/rental/orders/[id]/buffer-release` for DB-backed early buffer release.
- Added public `GET /api/public/rental/equipment/[id]/availability` for server-authoritative date-range availability.
- Customer rental detail and checkout now show actual available units for the selected range, and admin calendar now reflects stored buffer snapshots plus any early release override.

Risks / follow-up notes:
- Older historical orders without a stored applied buffer still rely on fallback behavior, so only new or updated snapshot-backed records are fully insulated from future default buffer changes.

## 2026-03-17 | Scope: admin user manual operational refinement
Summary:
- Refined the admin user manuals in place so they are more useful for day-to-day operations, adding practical workflows, clearer explanations of system behavior, common warnings, and related-page guidance.
- Expanded the rental calendar manual to explain lanes, buffers, holds, unassigned blocks, overbooking, and practical block inspection without introducing unimplemented workflows.

Files changed:
- `docs/admin-user-manual/01-overview.md`
- `docs/admin-user-manual/02-equipment.md`
- `docs/admin-user-manual/03-orders.md`
- `docs/admin-user-manual/04-calendar.md`
- `docs/admin-user-manual/05-customers.md`
- `docs/admin-user-manual/06-invoices.md`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Documentation only; no application behavior changed.

Risks / follow-up notes:
- The manuals now better match operational use, but they should be updated whenever labels, warnings, or page-to-page workflows change.

## 2026-03-17 | Scope: admin rental manual testing documentation set
Summary:
- Added a manual testing documentation set for the currently visible admin rental workflows, including a concise test plan, module-based test cases, edge cases, and a simple bug log template.
- Kept the testing docs user-facing and limited them to supported UI behavior only, with explicit notes where something is not part of normal testing.

Files changed:
- `docs/testing/test-plan.md`
- `docs/testing/test-cases/01-equipment.md`
- `docs/testing/test-cases/02-orders.md`
- `docs/testing/test-cases/03-calendar.md`
- `docs/testing/test-cases/04-customers.md`
- `docs/testing/test-cases/05-invoices.md`
- `docs/testing/edge-cases.md`
- `docs/testing/bug-log.md`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Documentation only; no application behavior changed.

Risks / follow-up notes:
- The testing pack is based on currently visible workflows and should be updated when admin page labels, actions, or supported states change.

## 2026-03-17 | Scope: manual testing pack execution refinement
Summary:
- Refined the manual testing pack so testers can run it more consistently by adding a dedicated test data setup guide, clearer bug severity guidance, and explicit test type labels across module test cases.
- Tightened expected results to be more concrete and observable for manual execution without changing the underlying testing scope.

Files changed:
- `docs/testing/test-data-setup.md`
- `docs/testing/bug-log.md`
- `docs/testing/test-cases/01-equipment.md`
- `docs/testing/test-cases/02-orders.md`
- `docs/testing/test-cases/03-calendar.md`
- `docs/testing/test-cases/04-customers.md`
- `docs/testing/test-cases/05-invoices.md`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Documentation only; no application behavior changed.

Risks / follow-up notes:
- Test data coverage still depends on the environment having suitable records for extension review, planning warnings, and invoice payment states.
## 2026-03-20 | Scope: rental account/auth prerender suspense fix
Summary:
- Fixed the rental customer account, login, register, and reset-password App Router pages so `useSearchParams()` is consumed inside `Suspense`-wrapped inner client components, matching the existing checkout pattern and unblocking Vercel prerender validation.
- Preserved the existing customer auth/account flow, redirects, and server-authoritative behavior without changing routes, APIs, or validation rules.

Files changed:
- `src/app/rental/account/page.tsx`
- `src/app/rental/account/login/page.tsx`
- `src/app/rental/account/register/page.tsx`
- `src/app/rental/reset-password/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.

API / Page changes:
- No API contract changes.
- Added minimal `Suspense` boundaries around the route-level client subtrees that read URL search params.

Risks / follow-up notes:
- This fix is intentionally narrow to the reported prerender blocker; other rental pages using `useSearchParams()` should continue following the same wrapped-inner-component pattern to avoid future App Router build regressions.
## 2026-03-22 | Scope: rental damage-deposit-credit current-state audit
Summary:
- Audited the current DB-first rental implementation for return inspection, deposit tracking, and credit control to map what is already implemented before any damage-assessment redesign work.
- Confirmed inspection currently lives as order operational state, deposit resolution lives in a separate explicit ledger/action flow, and credit control is driven by invoice/payment receivables plus customer credit-policy fields.

Files reviewed:
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/app/api/admin/rental/orders/[id]/operations/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `docs/sql/rental_order_return_inspection_v1.sql`
- `src/lib/rental/deposits/types.ts`
- `src/lib/rental/deposits/db-rental-deposit-repo.ts`
- `src/app/api/admin/rental/orders/[id]/deposit/route.ts`
- `docs/sql/rental_order_deposits_v1.sql`
- `docs/sql/rental_order_deposits_resolution_v2.sql`
- `src/lib/rental/credit-control/db-rental-credit-control.ts`
- `src/lib/rental/credit-control/checkout-credit-evaluator.ts`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/lib/rental/customers/db-rental-customer-portal-overview.ts`
- `src/lib/rental/customers/db-rental-customer-repo.ts`
- `src/app/api/admin/rental/customers/[id]/route.ts`
- `src/app/admin/rental/customers/[id]/page.tsx`
- `src/app/api/public/rental/checkout/start-payment/route.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `src/lib/rental/invoices/checkout-credit-automation.ts`
- `src/lib/rental/invoices/customer-invoice-access.ts`
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/lib/rental/invoices/db-payment-repo.ts`
- `docs/sql/rental_customers_credit_control_v1.sql`
- `docs/migration-log.md`

DB / Infra changes:
- No migration added.
- Audit/documentation only; no runtime behavior changed.

API / Page changes:
- No API or page behavior changed.
- This entry records the reviewed current-state map only.

Risks / follow-up notes:
- UI copy in a few places suggests damage-related deposit reasoning, but the current implementation still keeps inspection state and deposit resolution as separate explicit workflows.


## 2026-03-22 | Scope: rental damage assessment v1
Summary:
- Added a separate DB-backed rental order damage assessment evidence module with draft/finalized workflow, structured issue categories, estimated retention, and recommended deposit action fields.
- Integrated the assessment into the existing admin rental orders workspace and exposed only a conservative customer-facing review status while keeping deposit resolution, invoicing, and credit behavior unchanged.

Files changed:
- `docs/sql/rental_order_damage_assessments_v1.sql`
- `src/lib/rental/damage-assessments/types.ts`
- `src/lib/rental/damage-assessments/db-rental-damage-assessment-repo.ts`
- `src/lib/rental/damage-assessments/damage-assessment-service.ts`
- `src/app/api/admin/rental/orders/[id]/assessment/route.ts`
- `src/app/api/admin/rental/orders/[id]/assessment/finalize/route.ts`
- `src/components/admin/rental/OrderDamageAssessmentPanel.tsx`
- `src/app/api/admin/rental/orders/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `src/lib/rental/customers/db-rental-customer-overview.ts`
- `src/lib/rental/customers/portal-types.ts`
- `src/app/rental/account/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added `rental_order_damage_assessments` as a single-record-per-order evidence table for v1.
- No deposit, invoice, payment, or credit schema changed.

API / Page changes:
- Added protected admin damage assessment read/save/finalize endpoints under the existing rental orders API namespace.
- Added an assessment tab in the admin orders workspace and a conservative customer-visible review status label in the rental account portal.

Risks / follow-up notes:
- v1 intentionally stores one current assessment per order and does not yet include photo uploads, line-item evidence, or links from deposit resolution / invoicing to an assessment id.
## 2026-03-22 | Scope: rental deposit to damage assessment linkage
Summary:
- Added optional audit linkage from manual deposit resolution transactions to finalized damage assessments so admins can record the evidence used for a release or retention decision.
- Extended the existing admin deposit workflow to show advisory damage assessment context and allow explicit linking without automating deposit, invoice, or credit outcomes.

Files changed:
- `docs/sql/rental_order_deposit_assessment_links_v3.sql`
- `src/lib/rental/damage-assessments/db-rental-damage-assessment-repo.ts`
- `src/lib/rental/deposits/types.ts`
- `src/lib/rental/deposits/db-rental-deposit-repo.ts`
- `src/app/api/admin/rental/orders/[id]/deposit/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added nullable `damage_assessment_id` to `rental_deposit_transactions` with a foreign-key reference to `rental_order_damage_assessments`.
- No credit, invoice, payment, or deposit status derivation schema changed.

API / Page changes:
- Deposit resolution API now accepts an optional `damageAssessmentId` and validates that it belongs to the same order and is finalized before linking.
- Admin deposit resolution UI now shows damage assessment context and supports explicit linking of the finalized assessment to the manual deposit action.

Risks / follow-up notes:
- The linkage is recorded per resolution transaction for auditability; broader reporting or invoice follow-on flows can reference the same assessment later if approved.

## 2026-03-22 | Scope: manual rental damage charge invoicing
Summary:
- Added an explicit admin-only damage charge invoice draft workflow for returned/completed rental orders using the existing custom invoice creation path.
- Kept damage assessment and deposit references advisory/manual only by storing optional audit metadata on the invoice without automating deposit, invoicing, or credit decisions.

Files changed:
- `docs/sql/rental_invoice_damage_context_v1.sql`
- `src/lib/rental/invoices/types.ts`
- `src/lib/rental/invoices/db-invoice-repo.ts`
- `src/lib/rental/deposits/db-rental-deposit-repo.ts`
- `src/lib/rental/invoices/damage-charge-invoice-service.ts`
- `src/app/api/admin/rental/orders/[id]/damage-invoice/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `src/app/admin/rental/invoices/[id]/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added nullable invoice `metadata` support on `rental_invoices` for damage-charge audit context.
- No deposit ledger derivation, payment schema, or credit-control schema changed.

API / Page changes:
- Added a protected admin route to create a manual damage charge invoice draft for an order with optional finalized assessment and deposit resolution references.
- Added a manual damage invoice action in the admin rental orders deposit workflow and surfaced the linked damage-charge context on the standard admin invoice detail page.

Risks / follow-up notes:
- The created damage invoice becomes a normal receivable after creation, but broader reporting or customer-facing wording may need a later pass if damage-charge invoices should be more explicitly labeled outside the admin detail view.

## 2026-03-22 | Scope: new rental order admin notifications and acknowledgement state
Summary:
- Added a DB-backed new-order notification and acknowledgement state on `rental_orders`, plus notification routing support for `newOrderRecipients`.
- Added a server-side new-order admin email trigger on completed customer checkout paths and a subtle `NEW` indicator in the admin orders UI until the order is acknowledged.

Files changed:
- `docs/sql/rental_orders_new_order_tracking_v1.sql`
- `src/lib/rental/orders/types.ts`
- `src/lib/rental/orders/db-order-repo.ts`
- `src/lib/rental/orders/new-order-notification-service.ts`
- `src/lib/settings/db-admin-settings-repo.ts`
- `src/app/api/admin/settings/route.ts`
- `src/lib/admin-settings/use-admin-settings.ts`
- `src/app/admin/settings/notifications/page.tsx`
- `src/lib/rental/invoices/checkout-credit-automation.ts`
- `src/lib/rental/invoices/checkout-invoice-automation.ts`
- `src/app/api/admin/rental/orders/[id]/acknowledge/route.ts`
- `src/app/admin/rental/orders/page.tsx`
- `docs/migration-log.md`

DB / Infra changes:
- Added nullable `new_order_notified_at` and `new_order_acknowledged_at` columns to `rental_orders`.
- Added server-side idempotent notification claiming using `new_order_notified_at` so duplicate admin emails are suppressed on retried/completed checkout paths.

API / Page changes:
- Admin settings notification routing now supports `newOrderRecipients` using the existing settings API and hook flow.
- Added a protected admin order acknowledgement endpoint and updated the admin rental orders page to show a subtle `NEW` badge and green-tinted highlight until the order drawer is opened.

Risks / follow-up notes:
- The new-order email currently links to the main admin orders page with the order id in the query string; a later pass could auto-open the matching drawer from the URL if needed.
- A longer-term enhancement could add notification delivery logs or a dedicated admin inbox view without changing the current order acknowledgement model.

