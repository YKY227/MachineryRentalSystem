// src/app/api/admin/rental/invoices/send/route.ts
import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { deliverInvoiceEmail } from "@/lib/rental/invoices/email-delivery";

export const runtime = "nodejs";

type SendInvoiceBody = {
  invoiceId: string;
  to: string;
  cc?: string;
  subject?: string;
  message?: string;
  mode?: "send" | "resend";
};

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const body = (await req.json()) as SendInvoiceBody;
    const invoiceId = (body.invoiceId ?? "").trim();
    if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

    const inv = await dbInvoiceRepo.get(invoiceId);
    if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    if (inv.status !== "issued") {
      return NextResponse.json({ error: "Invoice must be issued before emailing" }, { status: 400 });
    }
    if (!inv.invoiceNo) {
      return NextResponse.json({ error: "Missing invoiceNo" }, { status: 400 });
    }

    const to = (body.to ?? "").trim();
    if (!to) return NextResponse.json({ error: "Missing recipient email" }, { status: 400 });

    const cc = (body.cc ?? "").trim();
    const subject = (body.subject ?? `Tax Invoice ${inv.invoiceNo}`).trim() || `Tax Invoice ${inv.invoiceNo}`;
    const message =
      body.message ??
      `Dear Customer,\n\nPlease find attached your tax invoice ${inv.invoiceNo}.\n\nThank you.`;
    const mode = body.mode ?? (inv.emailLog?.length ? "resend" : "send");

    const delivery = await deliverInvoiceEmail({
      invoice: inv,
      to,
      cc: cc || undefined,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif; line-height:1.5">
          <p>${String(message).replace(/\n/g, "<br/>")}</p>
          <hr/>
          <p style="color:#666; font-size:12px">
            Invoice: <b>${inv.invoiceNo}</b><br/>
            Bill To: ${inv.billTo?.name ?? "-"}<br/>
            PDF attached for reference.
          </p>
        </div>
      `,
    });

    const emailType = mode === "resend" ? "resent" : "sent";
    const sentAt = new Date().toISOString();

    await dbInvoiceRepo.createEmailEvent({
      invoiceId: inv.id,
      type: emailType,
      to,
      cc: cc || undefined,
      subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
      sentAt,
    });

    await dbInvoiceRepo.appendEmailLog(inv.id, {
      type: emailType,
      to,
      cc: cc || undefined,
      subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
      pdf: delivery.pdf,
      mode,
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
