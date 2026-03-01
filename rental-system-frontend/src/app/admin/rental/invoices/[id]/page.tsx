// src/app/admin/rental/invoices/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { localInvoiceRepo } from "@/lib/rental/invoices/local-invoice-repo";
import type { Invoice } from "@/lib/rental/invoices/types";

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
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
}

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SG", { hour12: true });
}

function statusChip(status: Invoice["status"]) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "issued":
      return "bg-emerald-100 text-emerald-800";
    case "void":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function AdminInvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) || "";

  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  // draft-edit fields (minimal)
  const [billToName, setBillToName] = useState("");
  const [billToEmail, setBillToEmail] = useState("");
  const [billToUen, setBillToUen] = useState("");
  const [billToAddress, setBillToAddress] = useState("");

  const isDraft = inv?.status === "draft";
  const isIssued = inv?.status === "issued";
  const isVoid = inv?.status === "void";

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("Tax Invoice");
  const [emailMessage, setEmailMessage] = useState(
    "Dear Customer,\n\nPlease find attached your tax invoice.\n\nThank you."
  );

  // Sync defaults whenever invoice changes (after reload)
  useEffect(() => {
    if (!inv) return;

    // only set defaults if user hasn't typed yet (avoid overwriting edits)
    setEmailTo((prev) => (prev.trim() ? prev : inv.billTo?.email ?? ""));
    setEmailSubject((prev) =>
      prev.trim() && prev !== "Tax Invoice"
        ? prev
        : inv.invoiceNo
        ? `Tax Invoice ${inv.invoiceNo}`
        : "Tax Invoice"
    );
  }, [inv]);

  function reload() {
    const found = localInvoiceRepo.get(id);
    setInv(found ?? null);
    setLoading(false);

    if (found) {
      setBillToName(found.billTo?.name ?? "");
      setBillToEmail(found.billTo?.email ?? "");
      setBillToUen(found.billTo?.uen ?? "");
      setBillToAddress((found.billTo?.addressLines ?? []).join("\n"));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const canIssue = useMemo(() => {
    if (!inv) return false;
    if (inv.status !== "draft") return false;
    // Minimal validation: must have bill-to name + at least 1 item
    if (!billToName.trim()) return false;
    if (!inv.items?.length) return false;
    return true;
  }, [inv, billToName]);

  function flash(msg: string) {
    setBanner(msg);
    window.setTimeout(() => setBanner(null), 2200);
  }

  function onSaveDraft() {
    if (!inv) return;
    if (inv.status !== "draft") return;

    localInvoiceRepo.updateDraft(inv.id, {
      billTo: {
        name: billToName.trim() || "Customer",
        email: billToEmail.trim() || "",
        uen: billToUen.trim() || "",
        addressLines: billToAddress
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      },
    });

    reload();
    flash("Saved draft.");
  }

  function onIssue() {
    if (!inv) return;
    if (inv.status !== "draft") return;

    const ok = window.confirm(
      "Issue Tax Invoice?\n\nOnce issued, an invoice number will be assigned and the invoice will be locked."
    );
    if (!ok) return;

    const issued = localInvoiceRepo.issue(inv.id);
    setInv(issued);
    flash(`Issued ${issued.invoiceNo}`);
  }

  async function handleSendInvoiceEmail() {
  if (!inv || inv.status !== "issued") return;

  const mode = inv.emailLog?.length ? "resend" : "send";

  const res = await fetch("/api/admin/rental/invoices/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice: inv,
      to: emailTo.trim(),
      cc: emailCc.trim() || undefined,
      subject: emailSubject.trim(),
      message: emailMessage,
      mode,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(data?.error ?? "Failed to send email");
    return;
  }

  // Save pdfStorage snapshot (MVP: localStorage)
if (data?.pdf?.path && data?.pdf?.sha256) {
  localInvoiceRepo.savePdfStorage(inv.id, {
    path: data.pdf.path,
    generatedAt: data.pdf.generatedAt,
    sha256: data.pdf.sha256,
  });
}

// Append email log
localInvoiceRepo.appendEmailLog(inv.id, {
  type: data.mode === "resend" ? "resent" : "sent",
  to: emailTo.trim(),
  cc: emailCc.trim() || undefined,
  subject: emailSubject.trim() || `Tax Invoice ${inv.invoiceNo ?? ""}`,
  provider: "resend",
  status: "sent",
  providerMessageId: data.providerMessageId ?? undefined,
  pdfSha256: data.pdf?.sha256 ?? undefined,
});

  setShowEmailModal(false);
  reload();
  flash(mode === "resend" ? "Email resent." : "Email sent.");
}
  function onVoid() {
    if (!inv) return;
    if (inv.status !== "issued") return;

    const reason = window.prompt("Void reason (required):", "");
    if (!reason || !reason.trim()) return;

    const ok = window.confirm(`Void invoice ${inv.invoiceNo}?\n\nThis cannot be undone.`);
    if (!ok) return;

    const updated = localInvoiceRepo.void(inv.id, reason.trim());
    setInv(updated);
    flash("Invoice voided.");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading invoice…
        </div>
      </div>
    );
  }

  if (!inv) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-900">Invoice not found</div>
          <div className="mt-1 text-sm text-slate-600">
            The invoice ID <span className="font-mono">{id}</span> does not exist in localStorage.
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin/rental/orders")}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const accent = "bg-slate-900"; // tweak later for branding
  const headerText = "text-white";

  return (
    <div className="mx-auto max-w-6xl p-4">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              {inv.invoiceNo ? inv.invoiceNo : "Invoice (Draft)"}
            </h1>
            <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", statusChip(inv.status)].join(" ")}>
              {inv.status.toUpperCase()}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Order: <span className="font-mono">{inv.orderId}</span> • Updated:{" "}
            <span className="font-medium text-slate-700">{formatDateTime(inv.updatedAt)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/admin/rental/orders")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Orders
          </button>
{inv.status === "issued" && (
  <button
    type="button"
    onClick={() => setShowEmailModal(true)}
    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
  >
    {inv.emailLog?.length ? "Resend Email" : "Send Email"}
  </button>
)}
          {isDraft && (
            <>
              <button
                type="button"
                onClick={onSaveDraft}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={!canIssue}
                onClick={onIssue}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold",
                  canIssue ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-slate-200 text-slate-500",
                ].join(" ")}
                title={!canIssue ? "Fill Bill To name and ensure items exist." : "Issue & lock invoice"}
              >
                Issue Invoice
              </button>
            </>
          )}

          {isIssued && (
            <button
              type="button"
              onClick={onVoid}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
            >
              Void
            </button>
          )}
          
          <button
  type="button"
  disabled={!inv || inv.status !== "issued"}
 onClick={async () => {
  if (!inv || inv.status !== "issued") return;

  // If PDF already stored, just regenerate download from same data
  if (inv.pdfStorage) {
    const res = await fetch("/api/admin/rental/invoices/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inv),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoiceNo}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // Generate first time
  const res = await fetch("/api/admin/rental/invoices/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inv),
  });

  if (!res.ok) {
    alert("PDF generation failed");
    return;
  }

  const hash = res.headers.get("X-PDF-SHA256") ?? "";
  const blob = await res.blob();

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${inv.invoiceNo}.pdf`;
  a.click();
  URL.revokeObjectURL(url);

  localInvoiceRepo.savePdfStorage(inv.id, {
    path: `invoices/${inv.invoiceNo}.pdf`,
    generatedAt: new Date().toISOString(),
    sha256: hash,
  });

  reload();
}}
  className={[
    "rounded-lg px-3 py-2 text-sm font-semibold",
    inv?.status === "issued"
      ? "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
      : "bg-slate-200 text-slate-500",
  ].join(" ")}
  title={inv?.status !== "issued" ? "Issue invoice to generate a PDF" : "Download PDF"}
>
  Download PDF
</button>

          {isVoid && (
            <button
              type="button"
              disabled
              className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-500"
              title="Voided invoice is locked."
            >
              Locked
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {banner}
        </div>
      )}
      {showEmailModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold text-slate-900">
        {inv.emailLog?.length ? "Resend Invoice" : "Send Invoice"}
      </h2>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-600">To</label>
          <input
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">CC</label>
          <input
            value={emailCc}
            onChange={(e) => setEmailCc(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Subject</label>
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Message</label>
          <textarea
            rows={4}
            value={emailMessage}
            onChange={(e) => setEmailMessage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="text-xs text-slate-500">
          Attachment: {inv.invoiceNo ?? "invoice"}.pdf (mock)
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={() => setShowEmailModal(false)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
        >
          Cancel
        </button>

       <button
  onClick={handleSendInvoiceEmail}
  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
>
  Send
</button>
      </div>
    </div>
  </div>
)}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* Left column: Draft fields + meta */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Invoice Details</div>
            <div className="mt-2 grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Invoice No</span>
                <span className="font-semibold text-slate-900">{inv.invoiceNo ?? "— (draft)"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Invoice Date</span>
                <span className="font-semibold text-slate-900">{formatDate(inv.issueDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Due Date</span>
                <span className="font-semibold text-slate-900">{formatDate(inv.dueDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">GST</span>
                <span className="font-semibold text-slate-900">{Math.round(inv.gstRate * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">Bill To</div>
                <div className="mt-1 text-xs text-slate-500">
                  {isDraft ? "Editable (draft only)" : "Locked (issued/void)"}
                </div>
              </div>
              {!isDraft && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  Locked
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Company Name</label>
                <input
                  value={billToName}
                  onChange={(e) => setBillToName(e.target.value)}
                  disabled={!isDraft}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50"
                  placeholder="e.g., ABC Construction Pte Ltd"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">UEN (optional)</label>
                <input
                  value={billToUen}
                  onChange={(e) => setBillToUen(e.target.value)}
                  disabled={!isDraft}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50"
                  placeholder="e.g., 201998877Z"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Email (optional)</label>
                <input
                  value={billToEmail}
                  onChange={(e) => setBillToEmail(e.target.value)}
                  disabled={!isDraft}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50"
                  placeholder="billing@company.com"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Address</label>
                <textarea
                  value={billToAddress}
                  onChange={(e) => setBillToAddress(e.target.value)}
                  disabled={!isDraft}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50"
                  placeholder="Address line 1&#10;Singapore 123456"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Totals</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Subtotal (Excl GST)</span>
                <span className="font-semibold text-slate-900">{moneyFromCents(inv.subtotalExclGstCents)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">GST ({Math.round(inv.gstRate * 100)}%)</span>
                <span className="font-semibold text-slate-900">{moneyFromCents(inv.gstAmountCents)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-900">Total (Incl GST)</span>
                <span className="text-base font-bold text-slate-900">{moneyFromCents(inv.totalInclGstCents)}</span>
              </div>

              {typeof inv.depositCents === "number" && inv.depositCents > 0 && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Security Deposit (Refundable)</span>
                    <span className="font-semibold text-slate-900">{moneyFromCents(inv.depositCents)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">Shown separately (not included in GST totals).</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Branded preview (HTML) */}
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Branded header bar */}
            <div className={["rounded-t-2xl px-6 py-5", accent, headerText].join(" ")}>
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="text-lg font-semibold leading-tight">{inv.supplier?.name ?? "—"}</div>
                  <div className="mt-1 text-xs opacity-90">
                    {(inv.supplier?.addressLines ?? []).filter(Boolean).join(" • ") || "—"}
                  </div>
                  <div className="mt-1 text-xs opacity-90">
                    {inv.supplier?.gstRegNo ? `GST Reg No: ${inv.supplier.gstRegNo}` : "GST Reg No: —"}
                    {inv.supplier?.uen ? ` • UEN: ${inv.supplier.uen}` : ""}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Tax Invoice</div>
                  <div className="mt-1 text-xl font-bold">{inv.invoiceNo ?? "DRAFT"}</div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Meta + BillTo */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill To</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{billToName.trim() || "—"}</div>
                  {billToUen.trim() && <div className="mt-1 text-xs text-slate-600">UEN: {billToUen.trim()}</div>}
                  <div className="mt-2 whitespace-pre-line text-xs text-slate-600">
                    {billToAddress.trim() ? billToAddress.trim() : "—"}
                  </div>
                  {billToEmail.trim() && <div className="mt-2 text-xs text-slate-600">Email: {billToEmail.trim()}</div>}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice Meta</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Invoice No</span>
                      <span className="font-semibold text-slate-900">{inv.invoiceNo ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Invoice Date</span>
                      <span className="font-semibold text-slate-900">
                        {inv.issueDate ? formatDate(inv.issueDate) : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Due Date</span>
                      <span className="font-semibold text-slate-900">{inv.dueDate ? formatDate(inv.dueDate) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Order Ref</span>
                      <span className="font-mono text-xs font-semibold text-slate-900">{inv.orderId}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items table */}
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Unit (Excl GST)</th>
                      <th className="px-4 py-3 text-right">Amount (Excl GST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.items.map((it, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{it.description}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{it.qty}</td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {moneyFromCents(it.unitPriceExclGstCents)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {moneyFromCents(it.amountExclGstCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals + Payment */}
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment Instructions</div>
                  <div className="mt-2 text-sm text-slate-700">
                    <div>Bank: DBS Bank Ltd</div>
                    <div>Account Name: {inv.supplier?.name ?? "—"}</div>
                    <div>Account No: 123-456789-0</div>
                    <div className="mt-2">
                      PayNow UEN: <span className="font-semibold">—</span>
                    </div>
                    <div className="mt-2">
                      Reference:{" "}
                      <span className="font-semibold">{inv.invoiceNo ?? "(issue to generate)"}</span>
                    </div>
                  </div>

                  {isVoid && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      This invoice has been voided.
                      {inv.voidReason ? ` Reason: ${inv.voidReason}` : ""}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Totals</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Subtotal (Excl GST)</span>
                      <span className="font-semibold text-slate-900">{moneyFromCents(inv.subtotalExclGstCents)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">GST ({Math.round(inv.gstRate * 100)}%)</span>
                      <span className="font-semibold text-slate-900">{moneyFromCents(inv.gstAmountCents)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="font-semibold text-slate-900">Total (Incl GST)</span>
                      <span className="text-base font-bold text-slate-900">{moneyFromCents(inv.totalInclGstCents)}</span>
                    </div>

                    {typeof inv.depositCents === "number" && inv.depositCents > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        Security Deposit (Refundable):{" "}
                        <span className="font-semibold text-slate-900">{moneyFromCents(inv.depositCents)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer notes */}
              <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div>Notes:</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Payment due within the agreed terms.</li>
                  <li>Please quote the invoice number as the payment reference.</li>
                  <li>This is a computer-generated tax invoice.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Preview is HTML (fast iteration). Next step: generate a PDF from this layout on Issue.
          </div>
        </div>

      </div>

       {inv.emailLog?.length > 0 && (
  <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-semibold text-slate-900">Email History</h3>

    <div className="mt-3 space-y-2 text-xs">
      {inv.emailLog.map((log) => (
        <div
          key={log.id}
          className="flex flex-col rounded-lg border border-slate-100 p-3"
        >
          <div>
            <span className="font-semibold uppercase">{log.type}</span> to {log.to}
          </div>
          <div className="text-slate-500">
            {new Date(log.sentAt).toLocaleString("en-SG")}
          </div>
          <div className="text-slate-400">
            Provider: {log.provider} • Status: {log.status}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
    </div>
  );

  
}