# Machinery Rental System Architecture

## Overview
- Machinery Rental System is a web application for managing rental inventory, customer orders, and tax invoices.
- The current implementation is frontend-first with incremental backend migration, especially in the Invoices module.

## Monorepo Structure (Current)
- `rental-system-frontend/`: Next.js App Router application (main product code).
- `.github/`: repository automation/workflow config.
- `docs/`: system documentation (this file).
- `node_modules/` (root + frontend): installed dependencies.
- `package.json` (root): top-level npm metadata/scripts.

## Stack Summary
- Framework/UI:
  - Next.js (App Router)
  - TypeScript
  - Tailwind CSS
- Data/infra:
  - Supabase Postgres (DB migration target for invoices)
  - Supabase Storage (PDF object storage)
- Email:
  - Resend (send/resend invoice emails)
- Documents:
  - `pdf-lib` for server-side invoice PDF generation

## Implemented Features (High-Level)
- Rental inventory admin:
  - Admin inventory management flows exist and currently use local repository patterns in the frontend module.
- Orders:
  - Admin orders page currently uses localStorage mock data.
- Invoices:
  - Draft / Issue / Void lifecycle is implemented.
  - Invoice detail flow now has DB API endpoints for fetch, draft update, issue, and void.
- Invoice PDF generation:
  - Server-side PDF rendering via `pdf-lib` (`/api/admin/rental/invoices/pdf`).
- Supabase Storage upload:
  - Invoice send flow uploads generated PDFs to Supabase Storage.
- Email send/resend:
  - `/api/admin/rental/invoices/send` supports send and resend behavior.
  - Reuse behavior:
    - If `invoice.pdfStorage.path` exists and hash validates, stored PDF is reused.
    - Otherwise PDF is regenerated and re-uploaded.
    - Response includes source state (`stored` vs `generated`).

## Current Data Sources
- localStorage (current):
  - Orders module data (`admin/rental/orders` mock flows).
  - Invoices list/orders integration still references local invoice mock flow in existing pages (To confirm after full migration).
- Supabase Postgres (current migration target):
  - Invoice detail API reads/writes invoice records via `db-invoice-repo`.
  - Default table name is `rental_invoices` (override via `SUPABASE_INVOICES_TABLE`).
- Supabase Storage (current):
  - Invoice PDF files stored in bucket defined by `SUPABASE_STORAGE_BUCKET`.

## Invoices Migration Status
- Phase 0 (existing):
  - `localInvoiceRepo` (localStorage-based invoices).
- Phase 1 (DB-first invoice detail page):
  - In progress / current focus: invoice detail page + DB APIs (`GET/PATCH`, `POST issue`, `POST void`).
- Phase 2 (future):
  - Migrate invoices list and orders integration to DB.
  - Remove `localInvoiceRepo` after cutover.

## API Routes Summary (`src/app/api`)
- Active routes:
  - `GET /api/env-check`
  - `ALL /api/backend/[...path]` (proxy to backend service)
  - `GET /api/admin/rental/storage/health`
  - `POST /api/admin/rental/invoices/pdf`
  - `POST /api/admin/rental/invoices/send`
  - `GET /api/admin/rental/invoices/[id]`
  - `PATCH /api/admin/rental/invoices/[id]`
  - `POST /api/admin/rental/invoices/[id]/issue`
  - `POST /api/admin/rental/invoices/[id]/void`
- Legacy/disabled (present under `_disabled`):
  - Admin drivers/jobs/tracking backend routes retained as disabled code paths.
- To confirm:
  - `src/app/api/admin.ts` appears to be an API helper module, not an App Router route handler.

## Environment Variables (Names Only)
- `NEXT_PUBLIC_USE_BACKEND`
- `NEXT_PUBLIC_API_BASE_URL`
- `BACKEND_INTERNAL_URL`
- `NEXT_PUBLIC_ADMIN_API_KEY`
- `NEXT_PUBLIC_ADMIN_DEMO_PASSWORD`
- `NEXT_PUBLIC_NEST_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_INVOICES_TABLE`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `NODE_ENV`

## Next Steps
- [ ] Finalize invoice DB schema and constraints (unique invoice number generation, status guards).
- [ ] Connect invoice send/PDF metadata persistence to DB repo methods (`setPdfStorage`, `appendEmailLog`).
- [ ] Migrate invoices list page from localStorage to DB APIs.
- [ ] Migrate orders page invoice linkage from local repo to DB APIs.
- [ ] Remove `localInvoiceRepo` after feature parity and regression checks.
- [ ] Add integration tests for issue/void/send flows.
