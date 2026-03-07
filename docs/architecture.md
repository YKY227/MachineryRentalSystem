# Machinery Rental System Architecture

## Overview
Machinery Rental System is a web application for managing rental inventory, customer orders, and tax invoices. The system started as a frontend-first mock (localStorage) and has now migrated **Orders + Invoices + Send/Resend + PDF storage** to **Supabase (Postgres + Storage)** with **server-enforced admin auth**.

---

## Monorepo Structure (Current)
- `rental-system-frontend/`: Next.js App Router application (main product code + API routes).
- `.github/`: repository automation/workflow config.
- `docs/`: documentation (`architecture.md`, `migration-log.md`, SQL scripts, etc.)
- `package.json` (root): top-level scripts/metadata.
- `node_modules/` (root + frontend): installed dependencies.

> Note: Next.js app + `.env.local` live inside `rental-system-frontend/`.

---

## Stack Summary
### Frontend
- Next.js (App Router)
- TypeScript
- Tailwind CSS

### Data / Infra
- Supabase Postgres (primary DB)
- Supabase Storage (PDF object storage)

### Email
- Resend (invoice send/resend)

### Documents
- `pdf-lib` (server-side invoice PDF generation)

---

## Security / Auth (Admin)
**Server-enforced admin protection is enabled for `/api/admin/**`.**
- Guard: `assertAdmin(req)` in `src/lib/auth/admin.ts`
- Auth mechanism:
  - Admin login calls `POST /api/admin/auth/token`
  - On success, server sets **HttpOnly cookie** `admin_key`
  - Admin logout calls `DELETE /api/admin/auth/token`
- Demo login supported:
  - `ops@example.com` / `demo1234`
- Also supports API key login:
  - `ADMIN_API_KEY` is server-only (stored in `.env.local`)

---

## Data Model (DB-First)

### Orders (DB)
- Table: `rental_orders`
- Admin Orders page is DB-first and refresh-safe.
- Public checkout creates orders via DB route:
  - `POST /api/public/rental/orders`
- Temporary compatibility:
  - public checkout may still write localStorage (until fully removed)
  - dev import route exists to migrate local orders into DB

### Invoices (DB)
- Table: `rental_invoices`
- Lifecycle:
  - `draft` → `issued` → `void`
- One invoice per order:
  - invoice has `order_id`
  - server reuses existing non-void invoice for the same `order_id`
- PDF metadata:
  - stored in `rental_invoices.pdf_storage` (jsonb): `{ path, generatedAt, sha256 }`

### Invoice Email Events (DB)
- Table: `rental_invoice_emails`
- Send/Resend events are appended as rows (newest-first ordering in UI)
- Invoice detail page fetches emails separately and renders Email History from DB.

### PDF Storage (Supabase Storage)
- Bucket: `SUPABASE_STORAGE_BUCKET` (e.g. `rental-pdfs`)
- Stored file path example:
  - `invoices/INV-YYYYMM-00001.pdf`
- Source logic:
  - If invoice has `pdf_storage.path` and hash matches → download/reuse
  - Else generate server-side → upload → save pdf_storage

---

## Implemented Features (High-Level)

### Inventory (Admin)
- Admin inventory management exists (still uses local repo patterns for now).

### Orders
- Admin Orders page loads from DB (`rental_orders`)
- Dev-only helpers:
  - reset orders (dev)
  - import local orders into DB (dev)

### Invoices
- Invoices list + detail are DB-first (refresh-safe)
- Create invoice is DB-first:
  - `POST /api/admin/rental/invoices { orderId }`
  - server loads the order from DB and creates/reuses invoice

### Invoice PDF generation
- Server-side PDF rendering with `pdf-lib`
- PDF bytes generated server-side (Next.js API route runtime = nodejs)

### Email send/resend (DB-first)
- `POST /api/admin/rental/invoices/send`
- Request body uses `{ invoiceId, to, cc, subject, message }`
- Route loads invoice from DB, attaches real PDF bytes, sends via Resend
- Writes:
  - `rental_invoice_emails` insert
  - `rental_invoices.pdf_storage` update (if generated/uploaded)

---

## Current Data Sources (Truth)
- Supabase Postgres is the source of truth for:
  - Orders
  - Invoices
  - Email history
  - PDF metadata
- Supabase Storage is the source of truth for:
  - Invoice PDF files
- LocalStorage:
  - May still exist in public checkout for temporary compatibility only
  - `localInvoiceRepo` is legacy (no longer relied upon for DB-first flows)

---

## API Routes Summary (`src/app/api`)

### Admin Auth
- `POST /api/admin/auth/token` (login → sets HttpOnly cookie)
- `DELETE /api/admin/auth/token` (logout → clears cookie)

### Admin Orders (protected)
- `GET /api/admin/rental/orders` (list)
- `POST /api/admin/rental/orders` (create)
- `DELETE /api/admin/rental/orders` (dev-only reset)
- `GET /api/admin/rental/orders/[id]` (get by id)
- `POST /api/admin/rental/orders/import-local` (dev-only upsert many from local)

### Public Orders
- `POST /api/public/rental/orders` (checkout → create order in DB)

### Admin Invoices (protected)
- `GET /api/admin/rental/invoices` (list / lookup by orderId(s))
- `POST /api/admin/rental/invoices` (create/reuse invoice by orderId)
- `GET /api/admin/rental/invoices/[id]` (returns `{ invoice, emails }`)
- `PATCH /api/admin/rental/invoices/[id]` (update draft fields)
- `POST /api/admin/rental/invoices/[id]/issue`
- `POST /api/admin/rental/invoices/[id]/void`
- `POST /api/admin/rental/invoices/send` (send/resend with PDF)

### Storage Health (protected)
- `GET /api/admin/rental/storage/health`

---

## Environment Variables (Names Only)
Frontend flags / proxy:
- `NEXT_PUBLIC_USE_BACKEND`
- `NEXT_PUBLIC_API_BASE_URL`
- `BACKEND_INTERNAL_URL`
- `NEXT_PUBLIC_NEST_URL`
- `NODE_ENV`

Admin auth:
- `ADMIN_API_KEY`

Supabase:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_INVOICES_TABLE` (optional override)
- (orders table env override optional if added)

Email:
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `RESEND_FROM`

---

## Next Steps (Recommended)
1. **Resend domain verification** for production sending (avoid gmail/unverified-domain errors).
2. **Remove localStorage write** in public checkout once DB orders are stable.
3. Add **DB constraints + indexes**:
   - unique(invoice_no)
   - unique(order_id) where status != 'void' (or enforce in app logic)
4. Decide **RLS strategy** (admin-only service role vs user-scoped access).
5. Add a **Payments module** (optional next milestone):
   - payment records per invoice
   - computed status: unpaid/partial/paid/overdue
6. Add minimal integration tests for:
   - create order → create invoice → issue → send → resend (stored PDF reuse)