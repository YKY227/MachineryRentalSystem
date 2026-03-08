import "server-only";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { deliverInvoiceEmail } from "@/lib/rental/invoices/email-delivery";

export async function sendIssuedInvoiceEmail(input: {
  invoiceId: string;
  to: string;
  cc?: string;
  subject?: string;
  message?: string;
  mode?: "send" | "resend";
}) {
  const invoiceId = input.invoiceId.trim();
  if (!invoiceId) throw new Error("Missing invoiceId");

  const inv = await dbInvoiceRepo.get(invoiceId);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status !== "issued") throw new Error("Invoice must be issued before emailing");
  if (!inv.invoiceNo) throw new Error("Missing invoiceNo");

  const to = input.to.trim();
  if (!to) throw new Error("Missing recipient email");

  const cc = (input.cc ?? "").trim();
  const subject = (input.subject ?? `Tax Invoice ${inv.invoiceNo}`).trim() || `Tax Invoice ${inv.invoiceNo}`;
  const message =
    input.message ??
    `Dear Customer,\n\nPlease find attached your tax invoice ${inv.invoiceNo}.\n\nThank you.`;
  const mode = input.mode ?? (inv.emailLog?.length ? "resend" : "send");

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

  return {
    invoice: inv,
    provider: delivery.provider,
    providerMessageId: delivery.providerMessageId,
    pdf: delivery.pdf,
    mode,
  };
}
