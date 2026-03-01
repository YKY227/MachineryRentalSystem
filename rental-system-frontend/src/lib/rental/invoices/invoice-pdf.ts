// src/lib/rental/invoices/invoice-pdf.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Invoice } from "./types";

function moneyFromCents(cents: number) {
  const v = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v / 100);
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
}

function joinLines(lines?: string[]) {
  return (lines ?? []).filter(Boolean).join("\n") || "—";
}

export async function renderInvoicePdf(inv: Invoice): Promise<Uint8Array> {
  // Minimal “finance-grade” sanity checks (tighten later)
  if (inv.status !== "issued") throw new Error("Invoice must be issued to generate PDF.");
  if (!inv.invoiceNo) throw new Error("Missing invoiceNo.");
  if (!inv.items?.length) throw new Error("Invoice has no items.");

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait points
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const lineGap = 14;

  const slate = rgb(0.12, 0.16, 0.23);
  const gray = rgb(0.45, 0.49, 0.55);
  const lightGray = rgb(0.92, 0.93, 0.95);

  let y = height - margin;

  // Header bar
  page.drawRectangle({
    x: 0,
    y: height - 110,
    width,
    height: 110,
    color: slate,
  });

  // Supplier block (left)
  page.drawText(inv.supplier?.name ?? "—", {
    x: margin,
    y: height - 52,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(joinLines(inv.supplier?.addressLines), {
    x: margin,
    y: height - 72,
    size: 9,
    font,
    color: rgb(1, 1, 1),
    lineHeight: 12,
  });

  const gstUen = [
    inv.supplier?.gstRegNo ? `GST Reg No: ${inv.supplier.gstRegNo}` : "GST Reg No: —",
    inv.supplier?.uen ? `UEN: ${inv.supplier.uen}` : "",
  ].filter(Boolean).join("  •  ");

  page.drawText(gstUen, {
    x: margin,
    y: height - 98,
    size: 9,
    font,
    color: rgb(1, 1, 1),
  });

  // Title block (right)
  page.drawText("TAX INVOICE", {
    x: width - margin - 120,
    y: height - 48,
    size: 10,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(inv.invoiceNo, {
    x: width - margin - 180,
    y: height - 74,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  y = height - 140;

  // Bill To & Meta boxes
  const boxW = (width - margin * 2 - 16) / 2;
  const boxH = 120;

  // Bill To
  page.drawRectangle({ x: margin, y: y - boxH, width: boxW, height: boxH, borderColor: lightGray, borderWidth: 1 });
  page.drawText("BILL TO", { x: margin + 12, y: y - 20, size: 9, font: fontBold, color: gray });

  const billLines = [
    inv.billTo?.name ?? "—",
    inv.billTo?.uen ? `UEN: ${inv.billTo.uen}` : "",
    joinLines(inv.billTo?.addressLines),
    inv.billTo?.email ? `Email: ${inv.billTo.email}` : "",
  ].filter(Boolean);

  page.drawText(billLines.join("\n"), {
    x: margin + 12,
    y: y - 38,
    size: 10,
    font,
    color: slate,
    lineHeight: 13,
    maxWidth: boxW - 24,
  });

  // Meta
  const metaX = margin + boxW + 16;
  page.drawRectangle({ x: metaX, y: y - boxH, width: boxW, height: boxH, color: rgb(0.98, 0.98, 0.99), borderColor: lightGray, borderWidth: 1 });
  page.drawText("INVOICE META", { x: metaX + 12, y: y - 20, size: 9, font: fontBold, color: gray });

  const metaRows: Array<[string, string]> = [
    ["Invoice No", inv.invoiceNo ?? "—"],
    ["Invoice Date", fmtDate(inv.issueDate)],
    ["Due Date", fmtDate(inv.dueDate)],
    ["Order Ref", inv.orderId ?? "—"],
  ];

  let my = y - 38;
  for (const [k, v] of metaRows) {
    page.drawText(k, { x: metaX + 12, y: my, size: 10, font, color: gray });
    page.drawText(v, { x: metaX + 120, y: my, size: 10, font: fontBold, color: slate });
    my -= 16;
  }

  y = y - boxH - 24;

  // Items table
  page.drawText("DESCRIPTION", { x: margin, y, size: 9, font: fontBold, color: gray });
  page.drawText("QTY", { x: width - margin - 210, y, size: 9, font: fontBold, color: gray });
  page.drawText("UNIT (EXCL GST)", { x: width - margin - 150, y, size: 9, font: fontBold, color: gray });
  page.drawText("AMOUNT (EXCL GST)", { x: width - margin - 60, y, size: 9, font: fontBold, color: gray });

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: lightGray });
  y -= 14;

  for (const it of inv.items) {
    // Basic page-break (simple)
    if (y < 180) {
      // add a new page if needed (later we can implement repeating header)
      const p2 = pdfDoc.addPage([595.28, 841.89]);
      y = p2.getSize().height - margin;
      // In v1: keep it simple, draw continued text
      p2.drawText("Items (continued)", { x: margin, y, size: 11, font: fontBold, color: slate });
      y -= 20;
      // Switch page reference
      // eslint-disable-next-line no-param-reassign
      (page as any) = p2;
    }

    page.drawText(it.description ?? "—", {
      x: margin,
      y,
      size: 10,
      font,
      color: slate,
      maxWidth: width - margin * 2 - 240,
    });

    page.drawText(String(it.qty ?? 0), {
      x: width - margin - 210,
      y,
      size: 10,
      font,
      color: slate,
    });

    page.drawText(moneyFromCents(it.unitPriceExclGstCents ?? 0), {
      x: width - margin - 150,
      y,
      size: 10,
      font,
      color: slate,
    });

    page.drawText(moneyFromCents(it.amountExclGstCents ?? 0), {
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

  // Totals block (right)
  const totalsX = width - margin - 260;
  y -= 18;

  const rows: Array<[string, string, boolean]> = [
    ["Subtotal (Excl GST)", moneyFromCents(inv.subtotalExclGstCents ?? 0), false],
    [`GST (${Math.round((inv.gstRate ?? 0) * 100)}%)`, moneyFromCents(inv.gstAmountCents ?? 0), false],
    ["Total (Incl GST)", moneyFromCents(inv.totalInclGstCents ?? 0), true],
  ];

  for (const [label, value, bold] of rows) {
    page.drawText(label, { x: totalsX, y, size: 10, font, color: gray });
    page.drawText(value, { x: totalsX + 150, y, size: 10, font: bold ? fontBold : font, color: slate });
    y -= 16;
  }

  // Deposit note (optional)
  if (typeof inv.depositCents === "number" && inv.depositCents > 0) {
    y -= 6;
    page.drawText(`Security Deposit (Refundable): ${moneyFromCents(inv.depositCents)}`, {
      x: totalsX,
      y,
      size: 9,
      font,
      color: gray,
    });
    y -= 16;
  }

  // Footer notes
  const footerY = 72;
  page.drawLine({ start: { x: margin, y: footerY + 42 }, end: { x: width - margin, y: footerY + 42 }, thickness: 1, color: lightGray });
  page.drawText("Notes:", { x: margin, y: footerY + 26, size: 9, font: fontBold, color: gray });
  page.drawText(
    "• Payment due within the agreed terms.\n• Please quote the invoice number as the payment reference.\n• This is a computer-generated tax invoice.",
    { x: margin, y: footerY + 12, size: 9, font, color: gray, lineHeight: 12 }
  );

  return await pdfDoc.save();
}