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
