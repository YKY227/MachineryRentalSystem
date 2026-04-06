import { sendServerEmail } from "@/lib/email/server-email";
import type { Invoice } from "@/lib/rental/invoices/types";
import { renderInvoicePdf } from "@/lib/rental/invoices/invoice-pdf";
import { sha256OfBytes } from "@/lib/rental/invoices/hash";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { supabaseAdmin, supabaseBucket } from "@/lib/supabase/server";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sanitizeFilename(s: string) {
  return s.replace(/[^\w\-\.]+/g, "_");
}

function defaultPdfPath(inv: { id: string; invoiceNo?: string }) {
  return `invoices/${sanitizeFilename(inv.invoiceNo ?? inv.id)}.pdf`;
}

async function downloadFromStorage(path: string): Promise<Uint8Array> {
  const supabase = supabaseAdmin();
  const bucket = supabaseBucket();

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  if (!data) throw new Error("Storage download returned empty data");

  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

async function uploadToStorage(path: string, bytes: Uint8Array) {
  const supabase = supabaseAdmin();
  const bucket = supabaseBucket();

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType: "application/pdf",
    cacheControl: "3600",
  });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function deliverRentalEmail(input: {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
}) {
  return sendServerEmail(input);
}

export async function deliverInvoiceEmail(input: {
  invoice: Invoice;
  to: string;
  cc?: string;
  subject: string;
  html: string;
}) {
  mustEnv("SUPABASE_URL");
  mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  mustEnv("SUPABASE_STORAGE_BUCKET");

  const inv = input.invoice;
  const storagePath = inv.pdfStorage?.path || defaultPdfPath(inv);

  let pdfBytes: Uint8Array | null = null;
  let sha256: string | null = null;
  let usedStored = false;

  if (inv.pdfStorage?.path) {
    try {
      const downloaded = await downloadFromStorage(inv.pdfStorage.path);
      const hash = await sha256OfBytes(downloaded);

      if (inv.pdfStorage.sha256 && inv.pdfStorage.sha256 !== hash) {
        throw new Error("Stored PDF hash mismatch (will regenerate).");
      }

      pdfBytes = downloaded;
      sha256 = hash;
      usedStored = true;
    } catch {
      // fall through to regenerate
    }
  }

  let storageMeta: { path: string; generatedAt: string; sha256: string } | null = null;

  if (!pdfBytes) {
    const generated = await renderInvoicePdf(inv);
    const hash = await sha256OfBytes(generated);
    const generatedAt = new Date().toISOString();

    await uploadToStorage(storagePath, generated);
    storageMeta = { path: storagePath, generatedAt, sha256: hash };
    await dbInvoiceRepo.setPdfStorage(inv.id, storageMeta);

    pdfBytes = generated;
    sha256 = hash;
    usedStored = false;
  }

  const filename = `${sanitizeFilename(inv.invoiceNo ?? inv.id)}.pdf`;
  const delivery = await sendServerEmail({
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    html: input.html,
    attachments: [
      {
        filename,
        content: pdfBytes,
        type: "application/pdf",
      },
    ],
  });

  return {
    provider: delivery.provider,
    providerMessageId: delivery.providerMessageId,
    pdf: {
      path: storagePath,
      generatedAt: storageMeta?.generatedAt ?? inv.pdfStorage?.generatedAt ?? new Date().toISOString(),
      sha256,
      source: usedStored ? "stored" : "generated",
    },
  };
}
