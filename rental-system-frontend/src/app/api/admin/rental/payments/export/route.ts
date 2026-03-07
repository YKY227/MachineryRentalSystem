import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  loadAdminPaymentsLedger,
  parseAdminPaymentsLedgerQuery,
} from "@/lib/rental/invoices/admin-payments-ledger";

export const runtime = "nodejs";

function requireInvoiceEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function escapeCsv(value: string | number | null | undefined) {
  const stringValue = value == null ? "" : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function buildCsv(rows: Array<Record<string, string | number | null | undefined>>) {
  const headers = [
    "paymentId",
    "invoiceId",
    "invoiceNumber",
    "invoiceStatus",
    "paymentStatus",
    "billToName",
    "billToContactName",
    "billToEmail",
    "amountCents",
    "paidAt",
    "method",
    "reference",
    "notes",
    "createdAt",
    "invoiceTotalInclGstCents",
    "invoicePaidCents",
    "invoiceBalanceCents",
    "dueDate",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    requireInvoiceEnv();

    const { searchParams } = new URL(req.url);
    const query = parseAdminPaymentsLedgerQuery(searchParams);
    const items = await loadAdminPaymentsLedger(query);

    const csv = buildCsv(
      items.map(({ payment, invoice, invoicePaymentStatus, invoicePaidCents, invoiceBalanceCents }) => ({
        paymentId: payment.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNo ?? "",
        invoiceStatus: invoice.status,
        paymentStatus: invoicePaymentStatus,
        billToName: invoice.billTo?.name ?? "",
        billToContactName: invoice.billTo?.contactName ?? "",
        billToEmail: invoice.billTo?.email ?? "",
        amountCents: payment.amountCents,
        paidAt: payment.paidAt,
        method: payment.method ?? "",
        reference: payment.reference ?? "",
        notes: payment.notes ?? "",
        createdAt: payment.createdAt,
        invoiceTotalInclGstCents: invoice.totalInclGstCents,
        invoicePaidCents,
        invoiceBalanceCents,
        dueDate: invoice.dueDate ?? "",
      }))
    );

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payments-ledger-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Payments export failed";
    return new Response(message, { status: 400 });
  }
}
