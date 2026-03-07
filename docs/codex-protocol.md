TASK:
Make /admin/rental/invoices/[id] DB-first by using existing API routes.

SCOPE:
- src/app/admin/rental/invoices/[id]/page.tsx
- src/app/api/admin/rental/invoices/[id]/*
- src/lib/rental/invoices/db-invoice-repo.ts
- src/lib/supabase/server.ts

DO NOT TOUCH:
- orders pages
- invoices list page
- localInvoiceRepo
- any UI markup unless required

ACCEPTANCE:
- Invoice detail loads from DB
- Save Draft persists after refresh
- Issue assigns invoiceNo and locks invoice
- Void persists reason and status after refresh

TEST:
- Manual flow: create invoice -> open detail -> edit -> save -> refresh -> issue -> refresh -> send -> refresh -> void -> refresh
OUTPUT:
- Summarize files changed