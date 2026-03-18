import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { sha256OfBytes } from "@/lib/rental/invoices/hash";
import { loadCustomerPaymentReceiptDetail } from "@/lib/rental/invoices/customer-payment-receipt-access";
import { renderReceiptPdf } from "@/lib/rental/invoices/receipt-pdf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

function sanitizeFilename(value: string) {
  return value.replace(/[^\w\-]+/g, "_");
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const customer = await assertCustomer(req);
    const { paymentId } = await ctx.params;
    const detail = await loadCustomerPaymentReceiptDetail(customer.id, paymentId);
    const pdfBytes = await renderReceiptPdf(detail);
    const hash = await sha256OfBytes(pdfBytes);
    const filename = `${sanitizeFilename(detail.invoice.invoiceNo ?? detail.invoice.id)}-receipt-${sanitizeFilename(
      detail.payment.id
    )}.pdf`;
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
    const message = error instanceof Error ? error.message : "Receipt PDF failed";
    const status = message === "Payment not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
