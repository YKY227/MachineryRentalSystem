import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { Invoice, InvoicePayment, InvoicePaymentTotals } from "@/lib/rental/invoices/types";
import { getPdfSupplierProfile } from "@/lib/rental/invoices/pdf-supplier-profile";

function moneyFromCents(cents: number) {
  const value = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function pdfSafeText(input: unknown) {
  return String(input ?? "")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2022", "-")
    .replaceAll("\u00A0", " ");
}

export async function renderReceiptPdf(input: {
  invoice: Invoice;
  payment: InvoicePayment;
  paymentTotals: InvoicePaymentTotals;
}): Promise<Uint8Array> {
  const supplierProfile = await getPdfSupplierProfile(input.invoice);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const slate = rgb(0.12, 0.16, 0.23);
  const gray = rgb(0.45, 0.49, 0.55);
  const lightGray = rgb(0.92, 0.93, 0.95);
  const margin = 48;

  page.drawRectangle({
    x: 0,
    y: height - 110,
    width,
    height: 110,
    color: slate,
  });

  page.drawText(pdfSafeText("PAYMENT RECEIPT"), {
    x: margin,
    y: height - 54,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(pdfSafeText(supplierProfile.name || "Rental Supplier"), {
    x: margin,
    y: height - 78,
    size: 10,
    font,
    color: rgb(1, 1, 1),
  });

  const supplierAddress = (supplierProfile.addressLines ?? []).filter(Boolean).join(" | ");
  if (supplierAddress) {
    page.drawText(pdfSafeText(supplierAddress), {
      x: margin,
      y: height - 92,
      size: 9,
      font,
      color: rgb(1, 1, 1),
    });
  }

  const supplierMeta = [
    supplierProfile.email ? `Email: ${supplierProfile.email}` : "",
    supplierProfile.phone ? `Phone: ${supplierProfile.phone}` : "",
    supplierProfile.uen ? `UEN: ${supplierProfile.uen}` : "",
    supplierProfile.gstRegNo ? `GST: ${supplierProfile.gstRegNo}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  if (supplierMeta) {
    page.drawText(pdfSafeText(supplierMeta), {
      x: margin,
      y: height - 106,
      size: 9,
      font,
      color: rgb(1, 1, 1),
    });
  }

  page.drawText(pdfSafeText(`Receipt Ref: ${input.payment.id}`), {
    x: width - margin - 180,
    y: height - 54,
    size: 10,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  let y = height - 150;

  const sections: Array<[string, Array<[string, string]>]> = [
    [
      "Invoice",
      [
        ["Invoice No", input.invoice.invoiceNo ?? input.invoice.id],
        ["Invoice Date", formatDate(input.invoice.issueDate)],
        ["Due Date", formatDate(input.invoice.dueDate)],
        ["Customer", input.invoice.billTo?.name ?? "-"],
      ],
    ],
    [
      "Payment",
      [
        ["Paid On", formatDate(input.payment.paidAt)],
        ["Amount Received", moneyFromCents(input.payment.amountCents)],
        ["Method", input.payment.method ?? "-"],
        ["Reference", input.payment.reference ?? "-"],
      ],
    ],
    [
      "Balance",
      [
        ["Invoice Total", moneyFromCents(input.paymentTotals.totalCents)],
        ["Paid To Date", moneyFromCents(input.paymentTotals.paidCents)],
        ["Outstanding", moneyFromCents(input.paymentTotals.balanceCents)],
        ["Status", input.paymentTotals.status],
      ],
    ],
  ];

  for (const [title, rows] of sections) {
    page.drawRectangle({
      x: margin,
      y: y - 112,
      width: width - margin * 2,
      height: 112,
      borderColor: lightGray,
      borderWidth: 1,
    });
    page.drawText(pdfSafeText(title), {
      x: margin + 12,
      y: y - 20,
      size: 10,
      font: fontBold,
      color: gray,
    });

    let rowY = y - 42;
    for (const [label, value] of rows) {
      page.drawText(pdfSafeText(label), {
        x: margin + 12,
        y: rowY,
        size: 10,
        font,
        color: gray,
      });
      page.drawText(pdfSafeText(value), {
        x: margin + 180,
        y: rowY,
        size: 10,
        font: fontBold,
        color: slate,
      });
      rowY -= 18;
    }

    y -= 132;
  }

  page.drawLine({
    start: { x: margin, y: 110 },
    end: { x: width - margin, y: 110 },
    thickness: 1,
    color: lightGray,
  });
  page.drawText(pdfSafeText("This receipt confirms payment recorded against the invoice shown above."), {
    x: margin,
    y: 90,
    size: 9,
    font,
    color: gray,
  });
  page.drawText(
    pdfSafeText("Payment settlement remains subject to the system record and webhook-confirmed posting."),
    {
      x: margin,
      y: 74,
      size: 9,
      font,
      color: gray,
    }
  );

  return pdfDoc.save();
}
