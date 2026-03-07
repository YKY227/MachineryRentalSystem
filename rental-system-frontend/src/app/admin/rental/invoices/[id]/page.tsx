// src/app/admin/rental/invoices/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import type {
  Invoice,
  InvoiceEmailEventType,
  InvoiceEmailLogItem,
  InvoicePayment,
  InvoicePaymentStatus,
  InvoicePaymentTotals,
} from "@/lib/rental/invoices/types";

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

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SG", { hour12: true });
}

function toDateInputValue(iso?: string) {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
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

function paymentStatusChip(status?: InvoicePaymentStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800";
    case "partially_paid":
      return "bg-amber-100 text-amber-800";
    case "overdue":
      return "bg-rose-100 text-rose-800";
    case "unpaid":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function paymentStatusLabel(status?: InvoicePaymentStatus) {
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

function emailTypeLabel(type: InvoiceEmailEventType) {
  switch (type) {
    case "sent":
      return "Send";
    case "resent":
      return "Resend";
    case "reminder":
      return "Reminder";
    case "receipt":
      return "Receipt";
    default:
      return type;
  }
}

function emailTypeChip(type: InvoiceEmailEventType) {
  switch (type) {
    case "sent":
      return "bg-sky-100 text-sky-800";
    case "resent":
      return "bg-indigo-100 text-indigo-800";
    case "reminder":
      return "bg-amber-100 text-amber-800";
    case "receipt":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

const EMPTY_PAYMENT_TOTALS: InvoicePaymentTotals = {
  totalCents: 0,
  paidCents: 0,
  balanceCents: 0,
  status: "unpaid",
};

type InvoiceActionKey = "send_email" | "send_reminder" | "send_receipt" | "record_payment";
type BannerState = {
  kind: "success" | "error";
  message: string;
};

export default function AdminInvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) || "";

  const [inv, setInv] = useState<Invoice | null>(null);
  const [emails, setEmails] = useState<InvoiceEmailLogItem[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [paymentTotals, setPaymentTotals] = useState<InvoicePaymentTotals>(EMPTY_PAYMENT_TOTALS);
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<InvoiceActionKey | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);

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

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentDate, setPaymentDate] = useState(toDateInputValue());
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  useEffect(() => {
    if (!inv) return;

    setEmailTo((prev) => (prev.trim() ? prev : inv.billTo?.email ?? ""));
    setEmailSubject((prev) =>
      prev.trim() && prev !== "Tax Invoice"
        ? prev
        : inv.invoiceNo
          ? `Tax Invoice ${inv.invoiceNo}`
          : "Tax Invoice"
    );
  }, [inv]);

  async function loadPayments(invoiceId: string) {
    try {
      setPaymentsLoading(true);
      const res = await fetch(`/api/admin/rental/invoices/${encodeURIComponent(invoiceId)}/payments`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load payments");

      setPayments(Array.isArray(data?.payments) ? (data.payments as InvoicePayment[]) : []);
      setPaymentTotals((data?.totals ?? EMPTY_PAYMENT_TOTALS) as InvoicePaymentTotals);
    } catch (e) {
      setPayments([]);
      setPaymentTotals((current) => ({
        ...EMPTY_PAYMENT_TOTALS,
        totalCents: inv?.totalInclGstCents ?? current.totalCents,
      }));
      const message = e instanceof Error ? e.message : "Failed to load payments";
      flash(message, "error");
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function reload() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/rental/invoices/${encodeURIComponent(id)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load invoice");

      const found = (data?.invoice ?? null) as Invoice | null;
      const nextEmails = Array.isArray(data?.emails)
        ? (data.emails as InvoiceEmailLogItem[])
        : [];
      setInv(found);
      setEmails(nextEmails);

      if (found) {
        setBillToName(found.billTo?.name ?? "");
        setBillToEmail(found.billTo?.email ?? "");
        setBillToUen(found.billTo?.uen ?? "");
        setBillToAddress((found.billTo?.addressLines ?? []).join("\n"));
        await loadPayments(found.id);
      } else {
        setPayments([]);
        setPaymentTotals(EMPTY_PAYMENT_TOTALS);
      }
    } catch (e) {
      setInv(null);
      setEmails([]);
      setPayments([]);
      setPaymentTotals(EMPTY_PAYMENT_TOTALS);
      const message = e instanceof Error ? e.message : "Failed to load invoice";
      flash(message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) {
        window.clearTimeout(bannerTimeoutRef.current);
      }
    };
  }, []);

  const canIssue = useMemo(() => {
    if (!inv) return false;
    if (inv.status !== "draft") return false;
    if (!billToName.trim()) return false;
    if (!inv.items?.length) return false;
    return true;
  }, [inv, billToName]);

  const effectivePaymentTotals = useMemo<InvoicePaymentTotals>(() => {
    if (!inv) return EMPTY_PAYMENT_TOTALS;

    if (
      paymentTotals.totalCents > 0 ||
      paymentTotals.paidCents > 0 ||
      paymentTotals.balanceCents > 0
    ) {
      return paymentTotals;
    }

    return {
      totalCents: inv.totalInclGstCents,
      paidCents: 0,
      balanceCents: inv.totalInclGstCents,
      status:
        inv.dueDate && new Date(inv.dueDate).getTime() < Date.now()
          ? "overdue"
          : "unpaid",
    };
  }, [inv, paymentTotals]);

  const canRecordPayment = Boolean(
    inv && inv.status === "issued" && effectivePaymentTotals.balanceCents > 0
  );
  const canSendReminder = Boolean(
    inv &&
      inv.status === "issued" &&
      inv.billTo?.email?.trim() &&
      effectivePaymentTotals.status !== "paid"
  );
  const canSendReceipt = Boolean(
    inv &&
      inv.status === "issued" &&
      inv.billTo?.email?.trim() &&
      effectivePaymentTotals.paidCents > 0
  );
  const isActionBusy = activeAction !== null;
  const isSendingEmail = activeAction === "send_email";
  const isSendingReminder = activeAction === "send_reminder";
  const isSendingReceipt = activeAction === "send_receipt";
  const isRecordingPayment = activeAction === "record_payment";

  function flash(message: string, kind: BannerState["kind"] = "success") {
    if (bannerTimeoutRef.current) {
      window.clearTimeout(bannerTimeoutRef.current);
    }
    setBanner({ kind, message });
    bannerTimeoutRef.current = window.setTimeout(() => setBanner(null), 2600);
  }

  function resetPaymentForm() {
    setPaymentDate(toDateInputValue());
    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentReference("");
    setPaymentNotes("");
  }

  async function onSaveDraft() {
    if (!inv || inv.status !== "draft") return;

    try {
      const res = await fetch(`/api/admin/rental/invoices/${encodeURIComponent(inv.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: {
            billTo: {
              name: billToName.trim() || "Customer",
              email: billToEmail.trim() || "",
              uen: billToUen.trim() || "",
              addressLines: billToAddress
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
            },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to save draft");

      setInv((data?.invoice ?? null) as Invoice | null);
      await reload();
      flash("Saved draft.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save draft";
      flash(message, "error");
    }
  }

  async function onIssue() {
    if (!inv || inv.status !== "draft") return;

    const ok = window.confirm(
      "Issue Tax Invoice?\n\nOnce issued, an invoice number will be assigned and the invoice will be locked."
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/rental/invoices/${encodeURIComponent(inv.id)}/issue`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to issue invoice");

      const issued = data?.invoice as Invoice;
      setInv(issued);
      await reload();
      flash(`Issued ${issued.invoiceNo}`, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to issue invoice";
      flash(message, "error");
    }
  }

  async function handleSendInvoiceEmail() {
    if (!inv || inv.status !== "issued" || isActionBusy) return;

    const mode = emails.length ? "resend" : "send";
    try {
      setActiveAction("send_email");
      const res = await fetch("/api/admin/rental/invoices/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: inv.id,
          to: emailTo.trim(),
          cc: emailCc.trim() || undefined,
          subject: emailSubject.trim(),
          message: emailMessage,
          mode,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to send email");

      setShowEmailModal(false);
      await reload();
      const source = data?.pdf?.source ? ` (PDF: ${data.pdf.source})` : "";
      flash((mode === "resend" ? "Email resent." : "Email sent.") + source, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send email";
      flash(message, "error");
    } finally {
      setActiveAction(null);
    }
  }

  async function onRecordPayment() {
    if (!inv || !canRecordPayment || isActionBusy) return;

    const amount = Math.round(Number(paymentAmount) * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      flash("Enter a valid payment amount.", "error");
      return;
    }

    try {
      setActiveAction("record_payment");
      const paidAtIso = paymentDate ? `${paymentDate}T12:00:00.000+08:00` : undefined;
      const res = await fetch(`/api/admin/rental/invoices/${encodeURIComponent(inv.id)}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: amount,
          paidAt: paidAtIso,
          method: paymentMethod.trim() || undefined,
          reference: paymentReference.trim() || undefined,
          notes: paymentNotes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to record payment");

      setPayments(Array.isArray(data?.payments) ? (data.payments as InvoicePayment[]) : []);
      setPaymentTotals((data?.totals ?? EMPTY_PAYMENT_TOTALS) as InvoicePaymentTotals);
      setShowPaymentModal(false);
      resetPaymentForm();
      flash("Payment recorded.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to record payment";
      flash(message, "error");
    } finally {
      setActiveAction(null);
    }
  }

  async function onSendReminder() {
    if (!inv || !canSendReminder || isActionBusy) return;

    try {
      setActiveAction("send_reminder");
      const res = await fetch("/api/admin/rental/invoices/remind", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to send reminder");

      await reload();
      const source = data?.pdf?.source ? ` (PDF: ${data.pdf.source})` : "";
      flash(`Reminder sent.${source}`, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send reminder";
      flash(message, "error");
    } finally {
      setActiveAction(null);
    }
  }

  async function onSendReceipt() {
    if (!inv || !canSendReceipt || isActionBusy) return;

    try {
      setActiveAction("send_receipt");
      const res = await fetch("/api/admin/rental/invoices/receipt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to send receipt");

      await reload();
      const source = data?.pdf?.source ? ` (PDF: ${data.pdf.source})` : "";
      flash(`Receipt sent.${source}`, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send receipt";
      flash(message, "error");
    } finally {
      setActiveAction(null);
    }
  }

  async function onVoid() {
    if (!inv || inv.status !== "issued") return;

    const reason = window.prompt("Void reason (required):", "");
    if (!reason || !reason.trim()) return;

    const ok = window.confirm(`Void invoice ${inv.invoiceNo}?\n\nThis cannot be undone.`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/rental/invoices/${encodeURIComponent(inv.id)}/void`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to void invoice");

      setInv((data?.invoice ?? null) as Invoice | null);
      await reload();
      flash("Invoice voided.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to void invoice";
      flash(message, "error");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading invoice...
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
            The invoice ID <span className="font-mono">{id}</span> was not found in the database.
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

  const accent = "bg-slate-900";
  const headerText = "text-white";

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              {inv.invoiceNo ? inv.invoiceNo : "Invoice (Draft)"}
            </h1>
            <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", statusChip(inv.status)].join(" ")}>
              {inv.status.toUpperCase()}
            </span>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                paymentStatusChip(effectivePaymentTotals.status),
              ].join(" ")}
            >
              {paymentStatusLabel(effectivePaymentTotals.status).toUpperCase()}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Order: <span className="font-mono">{inv.orderId}</span> - Updated:{" "}
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
              disabled={isActionBusy}
              onClick={() => setShowEmailModal(true)}
              className={[
                "rounded-lg px-4 py-2 text-sm font-semibold text-white",
                isActionBusy ? "bg-sky-300" : "bg-sky-600 hover:bg-sky-700",
              ].join(" ")}
            >
              {isSendingEmail ? "Sending..." : emails.length ? "Resend Email" : "Send Email"}
            </button>
          )}
          {canSendReminder && (
            <button
              type="button"
              disabled={isActionBusy}
              onClick={onSendReminder}
              className={[
                "rounded-lg px-4 py-2 text-sm font-semibold text-white",
                isActionBusy ? "bg-amber-300" : "bg-amber-500 hover:bg-amber-600",
              ].join(" ")}
            >
              {isSendingReminder ? "Sending..." : "Send Reminder"}
            </button>
          )}
          {canSendReceipt && (
            <button
              type="button"
              disabled={isActionBusy}
              onClick={onSendReceipt}
              className={[
                "rounded-lg px-4 py-2 text-sm font-semibold text-white",
                isActionBusy ? "bg-emerald-300" : "bg-emerald-500 hover:bg-emerald-600",
              ].join(" ")}
            >
              {isSendingReceipt ? "Sending..." : "Send Receipt"}
            </button>
          )}
          {canRecordPayment && (
            <button
              type="button"
              disabled={isActionBusy}
              onClick={() => {
                setPaymentDate(toDateInputValue());
                setShowPaymentModal(true);
              }}
              className={[
                "rounded-lg px-4 py-2 text-sm font-semibold text-white",
                isActionBusy ? "bg-emerald-300" : "bg-emerald-600 hover:bg-emerald-700",
              ].join(" ")}
            >
              {isRecordingPayment ? "Recording..." : "Record Payment"}
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
                title={!canIssue ? "Fill Bill To name and ensure items exist." : "Issue and lock invoice"}
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

              const res = await fetch("/api/admin/rental/invoices/pdf", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(inv),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(data?.error ?? "PDF download failed");
                return;
              }

              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${inv.invoiceNo}.pdf`;
              a.click();
              URL.revokeObjectURL(url);

              if (!inv.pdfStorage) {
                await reload();
              }
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
        <div
          className={[
            "mt-4 rounded-xl px-4 py-3 text-sm",
            banner.kind === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800",
          ].join(" ")}
        >
          {banner.message}
        </div>
      )}

      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {emails.length ? "Resend Invoice" : "Send Invoice"}
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">To</label>
                <input
                  value={emailTo}
                  disabled={isSendingEmail}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">CC</label>
                <input
                  value={emailCc}
                  disabled={isSendingEmail}
                  onChange={(e) => setEmailCc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Subject</label>
                <input
                  value={emailSubject}
                  disabled={isSendingEmail}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Message</label>
                <textarea
                  rows={4}
                  value={emailMessage}
                  disabled={isSendingEmail}
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
                disabled={isSendingEmail}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                Cancel
              </button>

              <button
                onClick={handleSendInvoiceEmail}
                disabled={isSendingEmail}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSendingEmail ? "Sending..." : emails.length ? "Confirm Resend" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Record Payment</h2>
            <p className="mt-1 text-sm text-slate-500">
              Outstanding balance: {moneyFromCents(effectivePaymentTotals.balanceCents)}
            </p>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  disabled={isRecordingPayment}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Amount (SGD)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paymentAmount}
                  disabled={isRecordingPayment}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Method</label>
                <input
                  value={paymentMethod}
                  disabled={isRecordingPayment}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Bank transfer"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Reference</label>
                <input
                  value={paymentReference}
                  disabled={isRecordingPayment}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Txn / remittance reference"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  rows={3}
                  value={paymentNotes}
                  disabled={isRecordingPayment}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Optional note"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  resetPaymentForm();
                }}
                disabled={isRecordingPayment}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRecordingPayment}
                onClick={onRecordPayment}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-semibold text-white",
                  isRecordingPayment ? "bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700",
                ].join(" ")}
              >
                {isRecordingPayment ? "Recording..." : "Save Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Invoice Details</div>
            <div className="mt-2 grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Invoice No</span>
                <span className="font-semibold text-slate-900">{inv.invoiceNo ?? "- (draft)"}</span>
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
            <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700">PDF</div>
              <div className="mt-1">
                Status:{" "}
                <span className="font-medium text-slate-900">
                  {inv.pdfStorage ? "stored" : "none"}
                </span>
              </div>
              <div>Path: {inv.pdfStorage?.path ?? "-"}</div>
              <div>Generated: {formatDateTime(inv.pdfStorage?.generatedAt)}</div>
              <div>SHA256: {inv.pdfStorage?.sha256 ?? "-"}</div>
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Payments</div>
                <div className="mt-1 text-xs text-slate-500">
                  DB-derived payment summary for this invoice.
                </div>
              </div>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  paymentStatusChip(effectivePaymentTotals.status),
                ].join(" ")}
              >
                {paymentStatusLabel(effectivePaymentTotals.status)}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Total</span>
                <span className="font-semibold text-slate-900">
                  {moneyFromCents(effectivePaymentTotals.totalCents)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Paid</span>
                <span className="font-semibold text-emerald-700">
                  {moneyFromCents(effectivePaymentTotals.paidCents)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-900">Balance</span>
                <span className="text-base font-bold text-slate-900">
                  {moneyFromCents(effectivePaymentTotals.balanceCents)}
                </span>
              </div>
              {paymentsLoading && <div className="text-xs text-slate-500">Refreshing payments...</div>}
              {canRecordPayment && (
                <button
                  type="button"
                  disabled={isActionBusy}
                  onClick={() => {
                    setPaymentDate(toDateInputValue());
                    setShowPaymentModal(true);
                  }}
                  className={[
                    "w-full rounded-xl px-3 py-2 text-sm font-semibold text-white",
                    isActionBusy ? "bg-emerald-300" : "bg-emerald-600 hover:bg-emerald-700",
                  ].join(" ")}
                >
                  {isRecordingPayment ? "Recording..." : "Record Payment"}
                </button>
              )}
              {!isIssued && (
                <div className="text-xs text-slate-500">Payments can only be recorded for issued invoices.</div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className={["rounded-t-2xl px-6 py-5", accent, headerText].join(" ")}>
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="text-lg font-semibold leading-tight">{inv.supplier?.name ?? "-"}</div>
                  <div className="mt-1 text-xs opacity-90">
                    {(inv.supplier?.addressLines ?? []).filter(Boolean).join(" - ") || "-"}
                  </div>
                  <div className="mt-1 text-xs opacity-90">
                    {inv.supplier?.gstRegNo ? `GST Reg No: ${inv.supplier.gstRegNo}` : "GST Reg No: -"}
                    {inv.supplier?.uen ? ` - UEN: ${inv.supplier.uen}` : ""}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Tax Invoice</div>
                  <div className="mt-1 text-xl font-bold">{inv.invoiceNo ?? "DRAFT"}</div>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill To</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{billToName.trim() || "-"}</div>
                  {billToUen.trim() && <div className="mt-1 text-xs text-slate-600">UEN: {billToUen.trim()}</div>}
                  <div className="mt-2 whitespace-pre-line text-xs text-slate-600">
                    {billToAddress.trim() ? billToAddress.trim() : "-"}
                  </div>
                  {billToEmail.trim() && <div className="mt-2 text-xs text-slate-600">Email: {billToEmail.trim()}</div>}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice Meta</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Invoice No</span>
                      <span className="font-semibold text-slate-900">{inv.invoiceNo ?? "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Invoice Date</span>
                      <span className="font-semibold text-slate-900">
                        {inv.issueDate ? formatDate(inv.issueDate) : "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Due Date</span>
                      <span className="font-semibold text-slate-900">{inv.dueDate ? formatDate(inv.dueDate) : "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Payment Status</span>
                      <span className="font-semibold text-slate-900">{paymentStatusLabel(effectivePaymentTotals.status)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Order Ref</span>
                      <span className="font-mono text-xs font-semibold text-slate-900">{inv.orderId}</span>
                    </div>
                  </div>
                </div>
              </div>

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

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment Instructions</div>
                  <div className="mt-2 text-sm text-slate-700">
                    <div>Bank: DBS Bank Ltd</div>
                    <div>Account Name: {inv.supplier?.name ?? "-"}</div>
                    <div>Account No: 123-456789-0</div>
                    <div className="mt-2">
                      PayNow UEN: <span className="font-semibold">-</span>
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
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Paid</span>
                      <span className="font-semibold text-emerald-700">{moneyFromCents(effectivePaymentTotals.paidCents)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Balance</span>
                      <span className="font-semibold text-slate-900">{moneyFromCents(effectivePaymentTotals.balanceCents)}</span>
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
            Preview is HTML (fast iteration). PDF generation remains server-side.
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
          <span className="text-xs text-slate-500">Newest first</span>
        </div>

        {payments.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No payments recorded yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Paid At</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 text-slate-700">{formatDate(payment.paidAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{moneyFromCents(payment.amountCents)}</td>
                    <td className="px-4 py-3 text-slate-700">{payment.method || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{payment.reference || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{payment.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {emails.length > 0 && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Email History</h3>
            <span className="text-xs text-slate-500">{emails.length} event{emails.length === 1 ? "" : "s"}</span>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            {emails.map((log) => (
              <div key={log.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
                        emailTypeChip(log.type),
                      ].join(" ")}
                    >
                      {emailTypeLabel(log.type)}
                    </span>
                    <div className="mt-2 font-medium text-slate-900">{log.to}</div>
                    <div className="mt-1 text-slate-500">{log.subject}</div>
                  </div>
                  <div className="text-right text-slate-500">
                    <div className="font-medium text-slate-700">{formatDateTime(log.sentAt)}</div>
                    <div className="mt-1 uppercase tracking-wide text-[11px]">
                      {log.status} via {log.provider}
                    </div>
                  </div>
                </div>
                {(log.cc || log.providerMessageId) && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-slate-400">
                    {log.cc ? `CC: ${log.cc}` : "CC: -"}
                    {log.providerMessageId ? ` | Message ID: ${log.providerMessageId}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
