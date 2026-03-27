import { NextResponse } from "next/server";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { resolveInvoiceBillToContext } from "@/lib/rental/invoices/invoice-bill-to";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    const { id } = await ctx.params;

    const invoice = await dbInvoiceRepo.get(id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status !== "draft") {
      return NextResponse.json({ error: "Only draft invoices can load Bill To from customer account" }, { status: 400 });
    }

    const order = await dbOrderRepo.get(invoice.orderId);
    if (!order) return NextResponse.json({ error: "Linked order not found" }, { status: 404 });

    const billToContext = await resolveInvoiceBillToContext({
      customerId: order.customerId,
      customerSnapshot: order.customerSnapshot,
    });

    if (!billToContext.hasCustomerAccount) {
      return NextResponse.json({ error: "No linked registered customer account is available for this draft invoice" }, { status: 400 });
    }

    const updatedInvoice = await dbInvoiceRepo.updateDraft(id, {
      billTo: billToContext.billTo,
    });

    return NextResponse.json({
      invoice: updatedInvoice,
      customerAccountBillTo: billToContext.billTo,
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Failed to load Bill To from customer account";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
