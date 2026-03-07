import { NextResponse } from "next/server";
import type { Invoice } from "@/lib/rental/invoices/types";
import { renderInvoicePdf } from "@/lib/rental/invoices/invoice-pdf";
import { sha256OfBytes } from "@/lib/rental/invoices/hash";
import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    const inv = (await req.json()) as Invoice;

    if (inv.status !== "issued") {
      return NextResponse.json({ error: "Invoice must be issued." }, { status: 400 });
    }

    const pdfBytes = await renderInvoicePdf(inv);
    const hash = await sha256OfBytes(pdfBytes);

    const filename =
      (inv.invoiceNo ?? "invoice").replace(/[^\w\-]+/g, "_") + ".pdf";

    // ⚠️ MVP storage simulation
    // In production, upload pdfBytes to S3/Supabase here.

    const normalizedPdfBytes = Uint8Array.from(pdfBytes);
    const body = new Blob([normalizedPdfBytes], { type: "application/pdf" });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-PDF-SHA256": hash,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Failed to generate PDF";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
