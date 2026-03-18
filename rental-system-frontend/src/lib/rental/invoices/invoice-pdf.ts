// src/lib/rental/invoices/invoice-pdf.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { Invoice } from "./types";
import { getPdfSupplierProfile } from "./pdf-supplier-profile";

function moneyFromCents(cents: number) {
  const v = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v / 100);
}

function pdfSafeText(input: unknown) {
  return String(input ?? "")
    .replaceAll("\u2192", "->")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2022", "-")
    .replaceAll("\u00A0", " ");
}

function fmtDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
}

function joinLines(lines?: string[]) {
  return (lines ?? []).filter(Boolean).join("\n") || "-";
}

export async function renderInvoicePdf(inv: Invoice): Promise<Uint8Array> {
  if (inv.status !== "issued") throw new Error("Invoice must be issued to generate PDF.");
  if (!inv.invoiceNo) throw new Error("Missing invoiceNo.");
  if (!inv.items?.length) throw new Error("Invoice has no items.");

  const supplierProfile = await getPdfSupplierProfile(inv);

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);
  let { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const lineGap = 14;

  const slate = rgb(0.12, 0.16, 0.23);
  const gray = rgb(0.45, 0.49, 0.55);
  const lightGray = rgb(0.92, 0.93, 0.95);

  let y = height - margin;

  page.drawRectangle({
    x: 0,
    y: height - 110,
    width,
    height: 110,
    color: slate,
  });

  page.drawText(pdfSafeText(supplierProfile.name || "-"), {
    x: margin,
    y: height - 52,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(pdfSafeText(joinLines(supplierProfile.addressLines)), {
    x: margin,
    y: height - 72,
    size: 9,
    font,
    color: rgb(1, 1, 1),
    lineHeight: 12,
  });

  const gstUen = [
    supplierProfile.gstRegNo ? `GST Reg No: ${supplierProfile.gstRegNo}` : "GST Reg No: -",
    supplierProfile.uen ? `UEN: ${supplierProfile.uen}` : "",
  ]
    .filter(Boolean)
    .join("  •  ");

  page.drawText(pdfSafeText(gstUen), {
    x: margin,
    y: height - 98,
    size: 9,
    font,
    color: rgb(1, 1, 1),
  });

  const contactLines = [
    supplierProfile.email ? `Email: ${supplierProfile.email}` : "",
    supplierProfile.phone ? `Phone: ${supplierProfile.phone}` : "",
  ]
    .filter(Boolean)
    .join("  •  ");

  if (contactLines) {
    page.drawText(pdfSafeText(contactLines), {
      x: margin,
      y: height - 108,
      size: 9,
      font,
      color: rgb(1, 1, 1),
    });
  }

  page.drawText(pdfSafeText("TAX INVOICE"), {
    x: width - margin - 120,
    y: height - 48,
    size: 10,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(pdfSafeText(inv.invoiceNo), {
    x: width - margin - 180,
    y: height - 74,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  y = height - 140;

  const boxW = (width - margin * 2 - 16) / 2;
  const boxH = 120;

  page.drawRectangle({
    x: margin,
    y: y - boxH,
    width: boxW,
    height: boxH,
    borderColor: lightGray,
    borderWidth: 1,
  });
  page.drawText(pdfSafeText("BILL TO"), {
    x: margin + 12,
    y: y - 20,
    size: 9,
    font: fontBold,
    color: gray,
  });

  const billLines = [
    inv.billTo?.name ?? "-",
    inv.billTo?.uen ? `UEN: ${inv.billTo.uen}` : "",
    joinLines(inv.billTo?.addressLines),
    inv.billTo?.email ? `Email: ${inv.billTo.email}` : "",
  ].filter(Boolean);

  page.drawText(pdfSafeText(billLines.join("\n")), {
    x: margin + 12,
    y: y - 38,
    size: 10,
    font,
    color: slate,
    lineHeight: 13,
    maxWidth: boxW - 24,
  });

  const metaX = margin + boxW + 16;
  page.drawRectangle({
    x: metaX,
    y: y - boxH,
    width: boxW,
    height: boxH,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: lightGray,
    borderWidth: 1,
  });
  page.drawText(pdfSafeText("INVOICE META"), {
    x: metaX + 12,
    y: y - 20,
    size: 9,
    font: fontBold,
    color: gray,
  });

  const metaRows: Array<[string, string]> = [
    ["Invoice No", inv.invoiceNo ?? "-"],
    ["Invoice Date", fmtDate(inv.issueDate)],
    ["Due Date", fmtDate(inv.dueDate)],
    ["Order Ref", inv.orderId ?? "-"],
  ];

  let my = y - 38;
  for (const [k, v] of metaRows) {
    page.drawText(pdfSafeText(k), { x: metaX + 12, y: my, size: 10, font, color: gray });
    page.drawText(pdfSafeText(v), {
      x: metaX + 120,
      y: my,
      size: 10,
      font: fontBold,
      color: slate,
    });
    my -= 16;
  }

  y = y - boxH - 24;

  page.drawText(pdfSafeText("DESCRIPTION"), { x: margin, y, size: 9, font: fontBold, color: gray });
  page.drawText(pdfSafeText("QTY"), { x: width - margin - 210, y, size: 9, font: fontBold, color: gray });
  page.drawText(pdfSafeText("UNIT (EXCL GST)"), {
    x: width - margin - 150,
    y,
    size: 9,
    font: fontBold,
    color: gray,
  });
  page.drawText(pdfSafeText("AMOUNT (EXCL GST)"), {
    x: width - margin - 60,
    y,
    size: 9,
    font: fontBold,
    color: gray,
  });

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: lightGray });
  y -= 14;

  for (const it of inv.items) {
    if (y < 220) {
      page = pdfDoc.addPage([595.28, 841.89]);
      ({ width, height } = page.getSize());
      y = height - margin;

      page.drawText(pdfSafeText("Items (continued)"), {
        x: margin,
        y,
        size: 11,
        font: fontBold,
        color: slate,
      });
      y -= 20;
    }

    page.drawText(pdfSafeText(it.description ?? "-"), {
      x: margin,
      y,
      size: 10,
      font,
      color: slate,
      maxWidth: width - margin * 2 - 240,
    });

    page.drawText(pdfSafeText(String(it.qty ?? 0)), {
      x: width - margin - 210,
      y,
      size: 10,
      font,
      color: slate,
    });

    page.drawText(pdfSafeText(moneyFromCents(it.unitPriceExclGstCents ?? 0)), {
      x: width - margin - 150,
      y,
      size: 10,
      font,
      color: slate,
    });

    page.drawText(pdfSafeText(moneyFromCents(it.amountExclGstCents ?? 0)), {
      x: width - margin - 60,
      y,
      size: 10,
      font: fontBold,
      color: slate,
    });

    y -= lineGap + 4;
  }

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: lightGray });

  const totalsX = width - margin - 260;
  y -= 18;

  const rows: Array<[string, string, boolean]> = [
    ["Subtotal (Excl GST)", moneyFromCents(inv.subtotalExclGstCents ?? 0), false],
    [`GST (${Math.round((inv.gstRate ?? 0) * 100)}%)`, moneyFromCents(inv.gstAmountCents ?? 0), false],
    ["Total (Incl GST)", moneyFromCents(inv.totalInclGstCents ?? 0), true],
  ];

  for (const [label, value, bold] of rows) {
    page.drawText(pdfSafeText(label), { x: totalsX, y, size: 10, font, color: gray });
    page.drawText(pdfSafeText(value), {
      x: totalsX + 150,
      y,
      size: 10,
      font: bold ? fontBold : font,
      color: slate,
    });
    y -= 16;
  }

  if (typeof inv.depositCents === "number" && inv.depositCents > 0) {
    y -= 6;
    page.drawText(pdfSafeText(`Security Deposit (Refundable): ${moneyFromCents(inv.depositCents)}`), {
      x: totalsX,
      y,
      size: 9,
      font,
      color: gray,
    });
    y -= 16;
  }

  const paymentBoxHeight = 74;
  const minFooterClearance = 150;
  if (y - paymentBoxHeight < minFooterClearance) {
    page = pdfDoc.addPage([595.28, 841.89]);
    ({ width, height } = page.getSize());
    y = height - margin;
  }

  page.drawRectangle({
    x: margin,
    y: y - paymentBoxHeight,
    width: width - margin * 2,
    height: paymentBoxHeight,
    borderColor: lightGray,
    borderWidth: 1,
  });
  page.drawText(pdfSafeText("PAYMENT INSTRUCTIONS"), {
    x: margin + 12,
    y: y - 20,
    size: 9,
    font: fontBold,
    color: gray,
  });

  const paymentLines = [
    supplierProfile.bankName ? `Bank: ${supplierProfile.bankName}` : "",
    supplierProfile.bankAccountName ? `Account Name: ${supplierProfile.bankAccountName}` : "",
    supplierProfile.bankAccountNumber ? `Account No: ${supplierProfile.bankAccountNumber}` : "",
    `Reference: ${inv.invoiceNo ?? "-"}`,
  ].filter(Boolean);

  page.drawText(pdfSafeText(paymentLines.join("\n")), {
    x: margin + 12,
    y: y - 38,
    size: 9,
    font,
    color: slate,
    lineHeight: 12,
    maxWidth: width - margin * 2 - 24,
  });

  const footerY = 72;
  page.drawLine({
    start: { x: margin, y: footerY + 42 },
    end: { x: width - margin, y: footerY + 42 },
    thickness: 1,
    color: lightGray,
  });
  page.drawText(pdfSafeText("Notes:"), {
    x: margin,
    y: footerY + 26,
    size: 9,
    font: fontBold,
    color: gray,
  });

  const notes = [
    "- Payment due within the agreed terms.",
    "- Please quote the invoice number as the payment reference.",
    "- This is a computer-generated tax invoice.",
  ].join("\n");

  page.drawText(pdfSafeText(notes), {
    x: margin,
    y: footerY + 12,
    size: 9,
    font,
    color: gray,
    lineHeight: 12,
  });

  return await pdfDoc.save();
}
