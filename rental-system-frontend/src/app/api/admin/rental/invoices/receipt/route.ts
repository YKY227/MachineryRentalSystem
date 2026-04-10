import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { buildPaymentReceiptTemplate } from "@/lib/email/email-template-registry";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { deliverInvoiceEmail } from "@/lib/rental/invoices/email-delivery";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";

export const runtime = "nodejs";

type ReceiptBody = {
  invoiceId?: string;
};

function moneyFromCents(cents: number) {
  const v = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v / 100);
}

function formatDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
}

function paymentStatusLabel(status: "unpaid" | "partially_paid" | "paid" | "overdue") {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Partially Paid";
    case "overdue":
      return "Overdue";
    case "unpaid":
    default:
      return "Unpaid";
  }
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const body = (await req.json()) as ReceiptBody;
    const invoiceId = (body.invoiceId ?? "").trim();
    if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

    const invoice = await dbInvoiceRepo.get(invoiceId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status !== "issued") {
      return NextResponse.json({ error: "Receipts are only allowed for issued invoices" }, { status: 400 });
    }

    const paymentTotals = await dbPaymentRepo.getTotals(invoice.id);
    if (paymentTotals.paidCents <= 0) {
      return NextResponse.json({ error: "Receipts are only allowed after payment is recorded" }, { status: 400 });
    }

    const to = (invoice.billTo?.email ?? "").trim();
    if (!to) {
      return NextResponse.json({ error: "Invoice bill-to email is missing" }, { status: 400 });
    }

    const customerName = invoice.billTo?.contactName || invoice.billTo?.name || "Customer";
    const template = await buildPaymentReceiptTemplate({
      customerName,
      invoiceNo: invoice.invoiceNo ?? invoice.id,
      totalCents: paymentTotals.totalCents,
      paidCents: paymentTotals.paidCents,
      balanceCents: paymentTotals.balanceCents,
      paymentStatus: paymentStatusLabel(paymentTotals.status),
      dueDate: invoice.dueDate,
    });

    const delivery = await deliverInvoiceEmail({
      invoice,
      to,
      subject: template.subject,
      html: template.html,
    });

    const sentAt = new Date().toISOString();

    await dbInvoiceRepo.createEmailEvent({
      invoiceId: invoice.id,
      type: "receipt",
      to,
      subject: template.subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
      sentAt,
    });

    await dbInvoiceRepo.appendEmailLog(invoice.id, {
      type: "receipt",
      to,
      subject: template.subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
      paymentStatus: paymentTotals.status,
      paidCents: paymentTotals.paidCents,
      balanceCents: paymentTotals.balanceCents,
      pdf: delivery.pdf,
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Receipt send failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
