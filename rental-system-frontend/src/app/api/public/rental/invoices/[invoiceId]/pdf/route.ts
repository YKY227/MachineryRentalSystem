import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { sha256OfBytes } from "@/lib/rental/invoices/hash";
import { renderInvoicePdf } from "@/lib/rental/invoices/invoice-pdf";
import { loadCustomerInvoiceDetail } from "@/lib/rental/invoices/customer-invoice-access";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

function sanitizeFilename(value: string) {
  return value.replace(/[^\w\-]+/g, "_");
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const customer = await assertCustomer(req);
    const { invoiceId } = await ctx.params;
    const { invoice } = await loadCustomerInvoiceDetail(customer.id, invoiceId);

    if (invoice.status !== "issued") {
      return NextResponse.json({ error: "Invoice PDF is only available for issued invoices" }, { status: 400 });
    }

    const pdfBytes = await renderInvoicePdf(invoice);
    const hash = await sha256OfBytes(pdfBytes);
    const filename = `${sanitizeFilename(invoice.invoiceNo ?? invoice.id)}.pdf`;
    const body = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-PDF-SHA256": hash,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isCustomerUnauthorized(error)) return customerUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Invoice PDF failed";
    const status = message === "Invoice not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
