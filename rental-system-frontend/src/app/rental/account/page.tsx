"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import type { RentalCustomerPortalOverview } from "@/lib/rental/customers/portal-types";
import type { RentalOrderDepositStatus } from "@/lib/rental/deposits/types";
import type { InvoicePaymentStatus } from "@/lib/rental/invoices/types";

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

export default function RentalCustomerAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [overview, setOverview] = useState<RentalCustomerPortalOverview | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/public/rental/account/overview", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (res.status === 401) {
          setAuthError(true);
          setOverview(null);
          return;
        }
        if (!res.ok) throw new Error(data?.error ?? "Failed to load account");
        setOverview((data ?? null) as RentalCustomerPortalOverview | null);
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

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer portal</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{profile.companyName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {profile.contactName} | {profile.email}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/rental"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Browse equipment
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>

      {(financialSummary.overdueInvoicesCount > 0 || noticeCount > 0) && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {financialSummary.overdueInvoicesCount > 0
            ? `You currently have ${financialSummary.overdueInvoicesCount} overdue invoice(s).`
            : "Recent account notices are available below."}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Outstanding balance"
          value={moneyFromCents(financialSummary.outstandingBalanceCents)}
          detail={`${financialSummary.totalInvoices} invoice(s) on file`}
        />
        <SummaryCard
          label="Overdue invoices"
          value={String(financialSummary.overdueInvoicesCount)}
          detail={money(creditSummary.overdueAmount)}
        />
        <SummaryCard
          label="Deposit held"
          value={moneyFromCents(depositSummary.totalHeldCents)}
          detail={`${depositSummary.heldCount} held deposit(s)`}
        />
        <SummaryCard
          label="Account standing"
          value={labelForCreditStatus(creditSummary.status)}
          detail={`${profile.paymentTerms.toUpperCase()} | ${profile.accountStatus}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-900">Account summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Field label="Company" value={profile.companyName} />
            <Field label="Contact" value={profile.contactName} />
            <Field label="Email" value={profile.email} />
            <Field label="Phone" value={profile.phone ?? "-"} />
            <Field label="UEN" value={profile.uen ?? "-"} />
            <Field label="Payment terms" value={profile.paymentTerms} />
            <Field label="Account status" value={profile.accountStatus} />
            <Field label="Created" value={formatDate(profile.createdAt)} />
            <Field label="Address" value={profile.address ?? "-"} />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Credit and account status</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MetricCard label="Payment terms" value={profile.paymentTerms.toUpperCase()} />
            <MetricCard label="Credit status" value={labelForCreditStatus(creditSummary.status)} />
            <MetricCard
              label="Credit limit"
              value={creditSummary.creditLimit === null ? "Not set" : money(creditSummary.creditLimit)}
            />
            <MetricCard label="Available credit" value={money(creditSummary.availableCredit)} />
            <MetricCard label="Credit used" value={money(creditSummary.creditUsed)} />
            <MetricCard
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ListSection title="Recent orders / bookings" emptyText="No recent bookings yet.">
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
              {order.depositRequiredCents > 0 && (
                <div className="mt-3 text-xs text-slate-600">
                  Deposit: {moneyFromCents(order.depositRequiredCents)} required | Held{" "}
                  {moneyFromCents(order.depositHeldCents)} | Released {moneyFromCents(order.depositReleasedCents)} |
                  Retained {moneyFromCents(order.depositRetainedCents)} | Unresolved{" "}
                  {moneyFromCents(order.depositUnresolvedCents)} | {labelForDepositStatus(order.depositStatus)}
                </div>
              )}
            </div>
          ))}
        </ListSection>

        <ListSection title="Invoices" emptyText="No invoices yet.">
          {overview.recentInvoices.map((invoice) => (
            <div key={invoice.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{invoice.invoiceNo ?? invoice.id}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Issued {formatDate(invoice.issueDate)} | Due {formatDate(invoice.dueDate)}
                  </div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {labelForInvoiceStatus(invoice.paymentStatus)}
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
        <ListSection title="Recent payments" emptyText="No payments recorded yet.">
          {overview.recentPayments.map((payment) => (
            <div key={payment.id} className="rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{moneyFromCents(payment.amountCents)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Paid {formatDate(payment.paidAt)} | Invoice {payment.invoiceNo ?? payment.invoiceId}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {[payment.method, payment.reference].filter(Boolean).join(" | ") || "-"}
                </div>
              </div>
            </div>
          ))}
        </ListSection>

        <ListSection title="Account notices" emptyText="No recent notices.">
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
        <h2 className="text-sm font-semibold text-slate-900">Deposit status</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <MetricCard label="Required" value={moneyFromCents(depositSummary.totalRequiredCents)} />
          <MetricCard label="Held" value={moneyFromCents(depositSummary.totalHeldCents)} />
          <MetricCard label="Unresolved" value={moneyFromCents(depositSummary.totalOutstandingCents)} />
          <MetricCard label="Pending deposits" value={String(depositSummary.pendingCount)} />
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
          <p className="mt-4 text-sm text-slate-600">No deposit-backed orders yet.</p>
        )}
      </section>
    </div>
  );
}

function SummaryCard(input: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{input.label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{input.value}</div>
      <div className="mt-1 text-xs text-slate-500">{input.detail}</div>
    </div>
  );
}

function MetricCard(input: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{input.label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{input.value}</div>
    </div>
  );
}

function Field(input: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{input.label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{input.value}</dd>
    </div>
  );
}

function ListSection(input: { title: string; emptyText: string; children: ReactNode }) {
  const childrenArray = Array.isArray(input.children) ? input.children : [input.children];
  const items = childrenArray.filter(Boolean);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{input.title}</h2>
      <div className="mt-4 space-y-3">
        {items.length ? items : <p className="text-sm text-slate-600">{input.emptyText}</p>}
      </div>
    </section>
  );
}
