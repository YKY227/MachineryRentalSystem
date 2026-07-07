"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpen,
  Building2,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileDown,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  Phone,
  Receipt,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import type { RentalCustomerPortalOverview } from "@/lib/rental/customers/portal-types";
import type { RentalOrderDepositStatus } from "@/lib/rental/deposits/types";
import {
  EXTENSION_REVIEW_CLARIFICATION_MESSAGE,
  EXTENSION_REVIEW_SUBMITTED_MESSAGE,
  getCustomerExtensionStatusMessage,
} from "@/lib/rental/extensions/customer-messages";
import type { RentalOrderExtensionStatus } from "@/lib/rental/extensions/types";
import type { InvoicePaymentStatus } from "@/lib/rental/invoices/types";
import type {
  RentalOrderInspectionStatus,
  RentalOrderReturnStatus,
} from "@/lib/rental/orders/types";

function moneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function money(amount?: number | null) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(Number(amount)) ? Number(amount) : 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function labelForInvoiceStatus(status: InvoicePaymentStatus) {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Partially paid";
    case "overdue":
      return "Overdue";
    case "unpaid":
    default:
      return "Unpaid";
  }
}

function labelForDepositStatus(status: RentalOrderDepositStatus) {
  switch (status) {
    case "held":
      return "Held";
    case "partially_held":
      return "Partially held";
    case "released":
      return "Released";
    case "partially_released":
      return "Partially released";
    case "retained":
      return "Retained";
    case "partially_retained":
      return "Partially retained";
    case "pending":
      return "Pending";
    case "not_required":
    default:
      return "Not required";
  }
}

function labelForCreditStatus(status: RentalCustomerPortalOverview["creditSummary"]["status"]) {
  switch (status) {
    case "blocked_manual_hold":
      return "On hold";
    case "control_disabled":
      return "Credit control disabled";
    case "blocked_overdue":
      return "Overdue invoices require payment";
    case "blocked_limit":
      return "Credit limit unavailable";
    case "eligible":
    default:
      return "In good standing";
  }
}

function labelForReturnStatus(status: RentalOrderReturnStatus) {
  switch (status) {
    case "returned":
      return "Returned";
    case "completed":
      return "Completed";
    case "out":
    default:
      return "Active";
  }
}

function labelForInspectionStatus(status: RentalOrderInspectionStatus) {
  switch (status) {
    case "pending":
      return "Inspection Pending";
    case "passed":
      return "Inspection Passed";
    case "issues_found":
      return "Issues Under Review";
    case "not_started":
    default:
      return "Not Started";
  }
}

function labelForExtensionStatus(status: RentalOrderExtensionStatus) {
  switch (status) {
    case "availability_blocked":
      return "Availability blocked";
    case "awaiting_admin_review":
      return "Awaiting review";
    case "approved_pending_payment":
      return "Approved - payment required";
    case "approved_confirmed":
      return "Confirmed";
    case "rejected":
      return "Rejected";
    case "cancelled":
    default:
      return "Cancelled";
  }
}

function portalExtensionMessage(extension: RentalCustomerPortalOverview["recentExtensions"][number]) {
  if (extension.status === "awaiting_admin_review") {
    return getCustomerExtensionStatusMessage("awaiting_admin_review");
  }
  return extension.customerMessage;
}

function RentalCustomerAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [overview, setOverview] = useState<RentalCustomerPortalOverview | null>(null);
  const [extensionRequestInputs, setExtensionRequestInputs] = useState<Record<string, string>>({});
  const [extensionSavingOrderId, setExtensionSavingOrderId] = useState<string | null>(null);
  const [extensionPayingId, setExtensionPayingId] = useState<string | null>(null);
  const [extensionBanner, setExtensionBanner] = useState<string | null>(null);
  const [extensionError, setExtensionError] = useState<string | null>(null);

  async function loadOverview() {
    const res = await fetch("/api/public/rental/account/overview", {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setAuthError(true);
      setOverview(null);
      return;
    }
    if (!res.ok) throw new Error(data?.error ?? "Failed to load account");
    setOverview((data ?? null) as RentalCustomerPortalOverview | null);
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        if (!mounted) return;
        await loadOverview();
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load account");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (searchParams?.get("extensionPayment") === "submitted") {
      setExtensionBanner("Extension payment submitted. Status will update after payment confirmation is processed.");
    }
  }, [searchParams]);

  async function handleLogout() {
    if (loggingOut) return;
    try {
      setLoggingOut(true);
      await fetch("/api/public/rental/auth/logout", { method: "POST" });
    } finally {
      router.push("/rental");
      router.refresh();
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Loading your account...
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Customer account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to view your bookings, invoices, payments, and deposit status.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/rental/account/login?next=%2Frental%2Faccount"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Sign in
            </Link>
            <Link
              href="/rental/account/register?next=%2Frental%2Faccount"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
          {error ?? "Unable to load your account."}
        </div>
      </div>
    );
  }

  const { profile, creditSummary, depositSummary, financialSummary } = overview;
  const depositOrders = overview.recentOrders.filter((order) => order.depositRequiredCents > 0);
  const noticeCount = overview.recentNotices.length;
  const extensionsByOrderId = overview.recentExtensions.reduce<Record<string, RentalCustomerPortalOverview["recentExtensions"]>>(
    (acc, extension) => {
      acc[extension.orderId] = [...(acc[extension.orderId] ?? []), extension];
      return acc;
    },
    {}
  );

  async function handleExtensionRequest(orderId: string) {
    const requestedRentalEnd = (extensionRequestInputs[orderId] ?? "").trim();
    if (!requestedRentalEnd || extensionSavingOrderId) return;

    try {
      setExtensionSavingOrderId(orderId);
      setExtensionError(null);
      setExtensionBanner(null);
      const res = await fetch(`/api/public/rental/orders/${encodeURIComponent(orderId)}/extensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedRentalEnd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to submit extension request");

      await loadOverview();
      setExtensionBanner(
        String(data?.message ?? `${EXTENSION_REVIEW_SUBMITTED_MESSAGE} ${EXTENSION_REVIEW_CLARIFICATION_MESSAGE}`)
      );
      setExtensionRequestInputs((current) => ({ ...current, [orderId]: "" }));
    } catch (nextError) {
      setExtensionError(nextError instanceof Error ? nextError.message : "Failed to submit extension request");
    } finally {
      setExtensionSavingOrderId(null);
    }
  }

  async function handleExtensionPayment(extensionId: string) {
    if (extensionPayingId) return;
    try {
      setExtensionPayingId(extensionId);
      setExtensionError(null);
      const res = await fetch(`/api/public/rental/extensions/${encodeURIComponent(extensionId)}/pay`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to start extension payment");
      const redirectUrl = String(data?.redirectUrl ?? "").trim();
      if (!redirectUrl) throw new Error("Missing hosted payment URL");
      window.location.href = redirectUrl;
    } catch (nextError) {
      setExtensionError(nextError instanceof Error ? nextError.message : "Failed to start extension payment");
      setExtensionPayingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_58%,#334155_100%)] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
              <LayoutDashboard className="h-4 w-4" />
              Customer portal
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight">
              Welcome back, {profile.contactName}.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Manage bookings, invoices, deposits, payments, and account notices for {profile.companyName}.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-200">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                <Building2 className="h-4 w-4" />
                {profile.companyName}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                <Mail className="h-4 w-4" />
                {profile.email}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                <ShieldCheck className="h-4 w-4" />
                {labelForCreditStatus(creditSummary.status)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/rental"
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Browse equipment
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:bg-slate-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <HeroStat
            icon={Wallet}
            label="Outstanding"
            value={moneyFromCents(financialSummary.outstandingBalanceCents)}
          />
          <HeroStat
            icon={Receipt}
            label="Open invoices"
            value={String(financialSummary.openInvoicesCount)}
          />
          <HeroStat
            icon={HandCoins}
            label="Deposit held"
            value={moneyFromCents(depositSummary.totalHeldCents)}
          />
          <HeroStat
            icon={BellRing}
            label="Notices"
            value={String(noticeCount)}
          />
        </div>
      </section>

      {(financialSummary.overdueInvoicesCount > 0 || noticeCount > 0) && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">Attention needed</div>
            <div className="mt-1">
              {financialSummary.overdueInvoicesCount > 0
                ? `You currently have ${financialSummary.overdueInvoicesCount} overdue invoice(s).`
                : "Recent account notices are available below."}
            </div>
          </div>
        </div>
      )}

      {extensionBanner && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>{extensionBanner}</div>
        </div>
      )}

      {extensionError && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>{extensionError}</div>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Wallet}
          label="Outstanding balance"
          value={moneyFromCents(financialSummary.outstandingBalanceCents)}
          detail={`${financialSummary.totalInvoices} invoice(s) on file`}
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="Current balance"
          value={moneyFromCents(financialSummary.currentBalanceCents)}
          detail={`${financialSummary.openInvoicesCount} open invoice(s)`}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Overdue invoices"
          value={String(financialSummary.overdueInvoicesCount)}
          detail={moneyFromCents(financialSummary.overdueBalanceCents)}
        />
        <SummaryCard
          icon={HandCoins}
          label="Deposit held"
          value={moneyFromCents(depositSummary.totalHeldCents)}
          detail={`${depositSummary.heldCount} held deposit(s)`}
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Account standing"
          value={labelForCreditStatus(creditSummary.status)}
          detail={`${profile.paymentTerms.toUpperCase()} | ${profile.accountStatus}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <SectionHeading
            icon={Building2}
            title="Account summary"
            subtitle="Primary customer and company details linked to this portal."
          />
          <dl className="mt-4 space-y-3 text-sm">
            <Field icon={Building2} label="Company" value={profile.companyName} />
            <Field icon={ClipboardList} label="Contact" value={profile.contactName} />
            <Field icon={Mail} label="Email" value={profile.email} />
            <Field icon={Phone} label="Phone" value={profile.phone ?? "-"} />
            <Field icon={Landmark} label="UEN" value={profile.uen ?? "-"} />
            <Field icon={CreditCard} label="Payment terms" value={profile.paymentTerms} />
            <Field icon={ShieldCheck} label="Account status" value={profile.accountStatus} />
            <Field icon={CalendarClock} label="Created" value={formatDate(profile.createdAt)} />
            <Field icon={Building2} label="Address" value={profile.address ?? "-"} />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <SectionHeading
            icon={ShieldCheck}
            title="Credit and account status"
            subtitle="Current terms, limit visibility, and high-level standing from server-side records."
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MetricCard icon={CreditCard} label="Payment terms" value={profile.paymentTerms.toUpperCase()} />
            <MetricCard icon={ShieldCheck} label="Credit status" value={labelForCreditStatus(creditSummary.status)} />
            <MetricCard
              icon={Landmark}
              label="Credit limit"
              value={creditSummary.creditLimit === null ? "Not set" : money(creditSummary.creditLimit)}
            />
            <MetricCard icon={Wallet} label="Available credit" value={money(creditSummary.availableCredit)} />
            <MetricCard icon={CircleDollarSign} label="Credit used" value={money(creditSummary.creditUsed)} />
            <MetricCard
              icon={CalendarClock}
              label="Oldest overdue invoice"
              value={formatDate(creditSummary.oldestOverdueInvoiceDate)}
            />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Credit information is shown from server-side invoice and payment records. Internal admin notes are not
            exposed here.
          </p>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            icon={FileText}
            title="Statement summary"
            subtitle="Open invoice balances are derived from current invoice and payment records."
          />
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {financialSummary.openInvoicesCount} open invoice(s)
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <MetricCard icon={Wallet} label="Current" value={moneyFromCents(overview.agingSummary.currentCents)} />
          <MetricCard icon={AlertTriangle} label="1-30 days overdue" value={moneyFromCents(overview.agingSummary.overdue1To30Cents)} />
          <MetricCard icon={AlertTriangle} label="31-60 days overdue" value={moneyFromCents(overview.agingSummary.overdue31To60Cents)} />
          <MetricCard icon={AlertTriangle} label="61+ days overdue" value={moneyFromCents(overview.agingSummary.overdue61PlusCents)} />
        </div>

        <div className="mt-4 space-y-3">
          {overview.openInvoices.length ? (
            overview.openInvoices.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/rental/account/invoices/${encodeURIComponent(invoice.id)}`}
                      className="font-semibold text-slate-900 hover:text-sky-700"
                    >
                      {invoice.invoiceNo ?? invoice.id}
                    </Link>
                    <div className="mt-1 text-xs text-slate-500">
                      Issued {formatDate(invoice.issueDate)} | Due {formatDate(invoice.dueDate)}
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {labelForInvoiceStatus(invoice.paymentStatus)}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                  <div>Total: {moneyFromCents(invoice.totalInclGstCents)}</div>
                  <div>Paid: {moneyFromCents(invoice.paidCents)}</div>
                  <div>Outstanding: {moneyFromCents(invoice.outstandingBalanceCents)}</div>
                  <div>
                    <a
                      href={`/api/public/rental/invoices/${encodeURIComponent(invoice.id)}/pdf`}
                      className="inline-flex items-center font-semibold text-sky-700 hover:text-sky-800"
                    >
                      <FileDown className="mr-1 h-4 w-4" />
                      Download invoice PDF
                    </a>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={FileText}
              title="No open invoices right now."
              detail="When issued invoices still have outstanding balances, they will appear here."
            />
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ListSection
          icon={ClipboardList}
          title="Recent orders / bookings"
          subtitle="Track active rentals, return progress, and extension activity."
          emptyText="No recent bookings yet."
        >
          {overview.recentOrders.map((order) => (
            <div key={order.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{order.equipmentSummary}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(order.rentalStart)} to {formatDate(order.rentalEnd)}
                  </div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {order.orderStatus}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <div>Return status: {labelForReturnStatus(order.returnStatus)}</div>
                <div>Inspection: {labelForInspectionStatus(order.inspectionStatus)}</div>
                <div>Returned on: {formatDate(order.returnedAt)}</div>
                <div>Workflow completed: {formatDate(order.completedAt)}</div>
              </div>
              {order.depositRequiredCents > 0 && (
                <div className="mt-3 text-xs text-slate-600">
                  Deposit: {moneyFromCents(order.depositRequiredCents)} required | Held{" "}
                  {moneyFromCents(order.depositHeldCents)} | Released {moneyFromCents(order.depositReleasedCents)} |
                  Retained {moneyFromCents(order.depositRetainedCents)} | Unresolved{" "}
                  {moneyFromCents(order.depositUnresolvedCents)} | {labelForDepositStatus(order.depositStatus)}
                </div>
              )}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="font-semibold text-slate-900">Rental extension</div>
                {(extensionsByOrderId[order.id] ?? []).length ? (
                  <div className="mt-3 space-y-2">
                    {(extensionsByOrderId[order.id] ?? []).map((extension) => (
                      <div key={extension.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-900">
                              Requested through {formatDate(extension.requestedRentalEnd)}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              Requested {formatDate(extension.createdAt)} | Current end {formatDate(extension.currentRentalEnd)}
                            </div>
                          </div>
                          <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                            {labelForExtensionStatus(extension.status)}
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-600">
                          Estimated charge: {moneyFromCents(extension.extensionChargeEstimateCents)}
                          {typeof extension.finalExtensionChargeCents === "number"
                            ? ` | Final charge: ${moneyFromCents(extension.finalExtensionChargeCents)}`
                            : ""}
                        </div>
                        {portalExtensionMessage(extension) && (
                          <div className="mt-2 text-[11px] text-slate-600">{portalExtensionMessage(extension)}</div>
                        )}
                        {extension.paymentRequired && (
                          <button
                            type="button"
                            onClick={() => handleExtensionPayment(extension.id)}
                            disabled={extensionPayingId === extension.id}
                            className="mt-3 inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                          >
                            <CreditCard className="mr-1 h-3.5 w-3.5" />
                            {extensionPayingId === extension.id ? "Redirecting..." : "Pay extension"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2">No extension requests recorded for this rental.</div>
                )}

                {order.returnStatus === "out" && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="date"
                      value={extensionRequestInputs[order.id] ?? ""}
                      onChange={(e) =>
                        setExtensionRequestInputs((current) => ({
                          ...current,
                          [order.id]: e.target.value,
                        }))
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleExtensionRequest(order.id)}
                      disabled={extensionSavingOrderId === order.id}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <ArrowRight className="mr-1 h-3.5 w-3.5" />
                      {extensionSavingOrderId === order.id ? "Submitting..." : "Request extension"}
                    </button>
                  </div>
                )}
                {order.returnStatus === "out" && (
                  <div className="mt-2 text-[11px] text-slate-500">{EXTENSION_REVIEW_CLARIFICATION_MESSAGE}</div>
                )}
              </div>
            </div>
          ))}
        </ListSection>

        <ListSection
          icon={FileText}
          title="Invoices"
          subtitle="Recent issued invoice documents and current payment status."
          emptyText="No invoices yet."
        >
          {overview.recentInvoices.map((invoice) => (
            <div key={invoice.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/rental/account/invoices/${encodeURIComponent(invoice.id)}`}
                    className="font-semibold text-slate-900 hover:text-sky-700"
                  >
                    {invoice.invoiceNo ?? invoice.id}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">
                    Issued {formatDate(invoice.issueDate)} | Due {formatDate(invoice.dueDate)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {invoice.status === "issued" && (
                    <a
                      href={`/api/public/rental/invoices/${encodeURIComponent(invoice.id)}/pdf`}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <FileDown className="mr-1 h-3.5 w-3.5" />
                      Download PDF
                    </a>
                  )}
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {labelForInvoiceStatus(invoice.paymentStatus)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                <div>Total: {moneyFromCents(invoice.totalInclGstCents)}</div>
                <div>Paid: {moneyFromCents(invoice.paidCents)}</div>
                <div>Outstanding: {moneyFromCents(invoice.outstandingBalanceCents)}</div>
              </div>
            </div>
          ))}
        </ListSection>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ListSection
          icon={Receipt}
          title="Recent payments"
          subtitle="Latest receipt-backed payments posted against your invoices."
          emptyText="No payments recorded yet."
        >
          {overview.recentPayments.map((payment) => (
            <div key={payment.id} className="rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{moneyFromCents(payment.amountCents)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Paid {formatDate(payment.paidAt)} | Invoice {payment.invoiceNo ?? payment.invoiceId}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">
                    {[payment.method, payment.reference].filter(Boolean).join(" | ") || "-"}
                  </div>
                  <a
                    href={`/api/public/rental/payments/${encodeURIComponent(payment.id)}/receipt`}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Receipt className="mr-1 h-3.5 w-3.5" />
                    Receipt
                  </a>
                </div>
              </div>
            </div>
          ))}
        </ListSection>

        <ListSection
          icon={BellRing}
          title="Account notices"
          subtitle="Customer-safe reminders and account updates tied to your invoices."
          emptyText="No recent notices."
        >
          {overview.recentNotices.map((notice) => (
            <div key={notice.id} className="rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{notice.subject}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {notice.invoiceNo ?? notice.invoiceId} | {formatDate(notice.createdAt)}
                  </div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {notice.kind}
                </div>
              </div>
            </div>
          ))}
        </ListSection>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeading
          icon={HandCoins}
          title="Deposit status"
          subtitle="Refundable deposit balances tracked separately from rental charges."
        />
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <MetricCard icon={Wallet} label="Required" value={moneyFromCents(depositSummary.totalRequiredCents)} />
          <MetricCard icon={HandCoins} label="Held" value={moneyFromCents(depositSummary.totalHeldCents)} />
          <MetricCard icon={AlertTriangle} label="Unresolved" value={moneyFromCents(depositSummary.totalOutstandingCents)} />
          <MetricCard icon={ClipboardList} label="Pending deposits" value={String(depositSummary.pendingCount)} />
        </div>

        {depositOrders.length > 0 ? (
          <div className="mt-4 space-y-3">
            {depositOrders.map((order) => (
              <div key={order.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{order.equipmentSummary}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatDate(order.rentalStart)} to {formatDate(order.rentalEnd)}
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {labelForDepositStatus(order.depositStatus)}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                  <div>Required: {moneyFromCents(order.depositRequiredCents)}</div>
                  <div>Held: {moneyFromCents(order.depositHeldCents)}</div>
                  <div>Released: {moneyFromCents(order.depositReleasedCents)}</div>
                  <div>Retained: {moneyFromCents(order.depositRetainedCents)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={HandCoins}
              title="No deposit-backed orders yet."
              detail="If a rental requires a refundable deposit, the order-level status will appear here."
            />
          </div>
        )}
      </section>
    </div>
  );
}

export default function RentalCustomerAccountPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-600">Loading your account...</div>}>
      <RentalCustomerAccountContent />
    </Suspense>
  );
}

function HeroStat(input: { icon: LucideIcon; label: string; value: string }) {
  const Icon = input.icon;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-200">
        <Icon className="h-4 w-4" />
        {input.label}
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{input.value}</div>
    </div>
  );
}

function SummaryCard(input: { icon: LucideIcon; label: string; value: string; detail: string }) {
  const Icon = input.icon;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="inline-flex rounded-xl bg-slate-100 p-2 text-slate-700">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{input.label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{input.value}</div>
      <div className="mt-1 text-xs text-slate-500">{input.detail}</div>
    </div>
  );
}

function MetricCard(input: { icon: LucideIcon; label: string; value: string }) {
  const Icon = input.icon;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" />
        {input.label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{input.value}</div>
    </div>
  );
}

function SectionHeading(input: { icon: LucideIcon; title: string; subtitle?: string }) {
  const Icon = input.icon;
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-slate-500" />
        {input.title}
      </div>
      {input.subtitle && <p className="mt-1 text-xs text-slate-500">{input.subtitle}</p>}
    </div>
  );
}

function Field(input: { icon: LucideIcon; label: string; value: string }) {
  const Icon = input.icon;
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {input.label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{input.value}</dd>
    </div>
  );
}

function EmptyState(input: { icon: LucideIcon; title: string; detail: string }) {
  const Icon = input.icon;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <div className="mx-auto inline-flex rounded-full bg-white p-3 text-slate-500 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{input.title}</div>
      <div className="mt-1 text-sm text-slate-500">{input.detail}</div>
    </div>
  );
}

function ListSection(input: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  emptyText: string;
  children: ReactNode;
}) {
  const childrenArray = Array.isArray(input.children) ? input.children : [input.children];
  const items = childrenArray.filter(Boolean);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeading icon={input.icon} title={input.title} subtitle={input.subtitle} />
      <div className="mt-4 space-y-3">
        {items.length ? (
          items
        ) : (
          <EmptyState icon={input.icon} title={input.emptyText} detail="This section will populate automatically when relevant records exist." />
        )}
      </div>
    </section>
  );
}
