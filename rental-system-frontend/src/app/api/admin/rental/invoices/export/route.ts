import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  loadAdminInvoiceListExport,
  parseAdminInvoiceListQuery,
} from "@/lib/rental/invoices/admin-invoice-list";

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
    "invoiceNumber",
    "invoiceStatus",
    "paymentStatus",
    "billToName",
    "billToContactName",
    "billToEmail",
    "totalInclGstCents",
    "paidCents",
    "balanceCents",
    "dueDate",
    "createdAt",
    "lastEmailType",
    "lastEmailAt",
    "emailCount",
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
    const query = parseAdminInvoiceListQuery(searchParams);
    const items = await loadAdminInvoiceListExport(query);

    const csv = buildCsv(
      items.map(({ invoice, paymentTotals, emailSummary }) => ({
        invoiceNumber: invoice.invoiceNo ?? "",
        invoiceStatus: invoice.status,
        paymentStatus: paymentTotals.status,
        billToName: invoice.billTo?.name ?? "",
        billToContactName: invoice.billTo?.contactName ?? "",
        billToEmail: invoice.billTo?.email ?? "",
        totalInclGstCents: invoice.totalInclGstCents,
        paidCents: paymentTotals.paidCents,
        balanceCents: paymentTotals.balanceCents,
        dueDate: invoice.dueDate ?? "",
        createdAt: invoice.createdAt,
        lastEmailType: emailSummary?.lastEmailType ?? "",
        lastEmailAt: emailSummary?.lastEmailAt ?? "",
        emailCount: emailSummary?.emailCount ?? 0,
      }))
    );

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoices-export-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice export failed";
    return new Response(message, { status: 400 });
  }
}
