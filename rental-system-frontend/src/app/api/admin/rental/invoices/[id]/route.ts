import { NextResponse } from "next/server";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { resolveInvoiceBillToContext } from "@/lib/rental/invoices/invoice-bill-to";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { InvoiceBillToSnapshot } from "@/lib/rental/invoices/types";
import type { Invoice } from "@/lib/rental/invoices/types";
import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function requireInvoiceEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    assertAdmin(_req);
    requireInvoiceEnv();
    const { id } = await ctx.params;
    console.log("[invoice-api] GET by id", { id });
    const invoice = await dbInvoiceRepo.get(id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const emails = await dbInvoiceRepo.listEmails(id);

    let customerAccountBillTo: InvoiceBillToSnapshot | null = null;
    if (invoice.status === "draft") {
      const order = await dbOrderRepo.get(invoice.orderId);
      if (order) {
        const billToContext = await resolveInvoiceBillToContext({
          customerId: order.customerId,
          customerSnapshot: order.customerSnapshot,
        });
        if (billToContext.hasCustomerAccount) {
          customerAccountBillTo = billToContext.billTo;
        }
      }
    }

    return NextResponse.json({ invoice, emails, customerAccountBillTo });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice read failed";
    console.log("[invoice-api] GET by id failed", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireInvoiceEnv();
    const { id } = await ctx.params;
    console.log("[invoice-api] PATCH draft", { id });
    const raw = (await req.json()) as { patch?: Partial<Invoice> } | Partial<Invoice>;
    const patch = ((raw as { patch?: Partial<Invoice> })?.patch ?? raw) as Partial<Invoice>;
    const invoice = await dbInvoiceRepo.updateDraft(id, patch);
    return NextResponse.json({ invoice });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice update failed";
    console.log("[invoice-api] PATCH draft failed", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
