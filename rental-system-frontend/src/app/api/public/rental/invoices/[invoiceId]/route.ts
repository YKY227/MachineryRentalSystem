import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { loadCustomerInvoiceDetail } from "@/lib/rental/invoices/customer-invoice-access";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const customer = await assertCustomer(req);
    const { invoiceId } = await ctx.params;
    const detail = await loadCustomerInvoiceDetail(customer.id, invoiceId);
    return NextResponse.json(detail);
  } catch (error) {
    if (isCustomerUnauthorized(error)) return customerUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Invoice detail failed";
    const status = message === "Invoice not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
