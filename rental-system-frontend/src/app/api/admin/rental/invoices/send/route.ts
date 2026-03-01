import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

import type { Invoice } from "@/lib/rental/invoices/types";
import { renderInvoicePdf } from "@/lib/rental/invoices/invoice-pdf";
import { sha256OfBytes } from "@/lib/rental/invoices/hash";

export const runtime = "nodejs"; // ensure Node runtime (pdf-lib + crypto + supabase)

const resend = new Resend(process.env.RESEND_API_KEY);

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type SendInvoiceBody = {
  invoice: Invoice; // MVP: client sends snapshot (later: invoiceId)
  to: string;
  cc?: string;
  subject?: string;
  message?: string;
  mode?: "send" | "resend";
};

function sanitizeFilename(s: string) {
  return s.replace(/[^\w\-\.]+/g, "_");
}

function defaultPdfPath(inv: Invoice) {
  // You can version this later if you support re-issuing
  return `invoices/${sanitizeFilename(inv.invoiceNo ?? inv.id)}.pdf`;
}

async function getSupabase() {
  const url = mustEnv("SUPABASE_URL");
  const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function downloadFromStorage(path: string): Promise<Uint8Array> {
  const supabase = await getSupabase();
  const bucket = mustEnv("SUPABASE_STORAGE_BUCKET");

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  if (!data) throw new Error("Storage download returned empty data");

  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

async function uploadToStorage(path: string, bytes: Uint8Array) {
  const supabase = await getSupabase();
  const bucket = mustEnv("SUPABASE_STORAGE_BUCKET");

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType: "application/pdf",
    cacheControl: "3600",
  });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function POST(req: Request) {
  try {
    mustEnv("RESEND_API_KEY");
    const from = mustEnv("RESEND_FROM");
    mustEnv("SUPABASE_URL");
    mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    mustEnv("SUPABASE_STORAGE_BUCKET");

    const body = (await req.json()) as SendInvoiceBody;
    const inv = body.invoice;

    if (!inv) return NextResponse.json({ error: "Missing invoice" }, { status: 400 });
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

    // ---------- Use stored PDF if possible ----------
    const storagePath = inv.pdfStorage?.path || defaultPdfPath(inv);

    let pdfBytes: Uint8Array | null = null;
    let sha256: string | null = null;
    let usedStored = false;

    // 1) Try download existing stored file if invoice says it has one
    if (inv.pdfStorage?.path) {
      try {
        const downloaded = await downloadFromStorage(inv.pdfStorage.path);
        const h = await sha256OfBytes(downloaded);

        // Optional integrity check: if mismatch, regenerate+overwrite
        if (inv.pdfStorage.sha256 && inv.pdfStorage.sha256 !== h) {
          throw new Error("Stored PDF hash mismatch (will regenerate).");
        }

        pdfBytes = downloaded;
        sha256 = h;
        usedStored = true;
      } catch {
        // fall through to generate
      }
    }

    // 2) If no usable stored PDF, generate and upload
    if (!pdfBytes) {
      const generated = await renderInvoicePdf(inv);
      const h = await sha256OfBytes(generated);

      await uploadToStorage(storagePath, generated);

      pdfBytes = generated;
      sha256 = h;
      usedStored = false;
    }

    // ---------- Send email via provider ----------
    const filename = `${sanitizeFilename(inv.invoiceNo)}.pdf`;

    const html = `
      <div style="font-family:Arial,sans-serif; line-height:1.5">
        <p>${String(message).replace(/\n/g, "<br/>")}</p>
        <hr/>
        <p style="color:#666; font-size:12px">
          Invoice: <b>${inv.invoiceNo}</b><br/>
          SHA256: <code>${sha256}</code><br/>
          PDF Source: ${usedStored ? "stored" : "generated"}
        </p>
      </div>
    `;

    const result = await resend.emails.send({
      from,
      to,
      cc: cc ? [cc] : undefined,
      subject,
      html,
      attachments: [
        {
          filename,
          content: Buffer.from(pdfBytes).toString("base64"),
        },
      ],
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 502 });
    }

    // Return metadata so CLIENT can save it into localInvoiceRepo (since server can't touch localStorage)
    return NextResponse.json({
      ok: true,
      provider: "resend",
      providerMessageId: result.data?.id ?? null,
      pdf: {
        path: storagePath,
        generatedAt: new Date().toISOString(),
        sha256,
        source: usedStored ? "stored" : "generated",
      },
      mode,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}