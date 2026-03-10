"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import type { InvoicePaymentStatus } from "@/lib/rental/invoices/types";
import type {
  RentalCustomer,
  RentalCustomerAccountStatus,
  RentalCustomerPaymentTerms,
  RentalCustomerVettingStatus,
} from "@/lib/rental/orders/types";
import type {
  RentalCustomerCreditControlSummary,
  RentalCustomerDepositSummary,
  RentalCustomerEmailEvent,
  RentalCustomerFinancialSummary,
  RentalCustomerOverview,
  RentalCustomerRecentInvoice,
  RentalCustomerRecentOrder,
  RentalCustomerRecentPayment,
} from "@/lib/rental/customers/db-rental-customer-overview";

const VETTING_OPTIONS: RentalCustomerVettingStatus[] = [
  "new",
  "under_review",
  "pre_vetted",
  "rejected",
];
const PAYMENT_TERMS_OPTIONS: RentalCustomerPaymentTerms[] = ["upfront", "credit"];
const ACCOUNT_STATUS_OPTIONS: RentalCustomerAccountStatus[] = ["active", "suspended"];

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

function moneyFromCents(cents: number) {
  const value = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function moneyFromAmount(amount?: number | null) {
  const value = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function badgeTone(value: string) {
  if (value === "pre_vetted" || value === "credit" || value === "active" || value === "paid") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (value === "eligible" || value === "enabled") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (value === "control_disabled" || value === "credit_control_disabled") {
    return "bg-amber-100 text-amber-800";
  }
  if (value.startsWith("blocked") || value === "disabled") {
    return "bg-rose-100 text-rose-800";
  }
  if (value === "overdue" || value === "suspended" || value === "rejected") {
    return "bg-rose-100 text-rose-800";
  }
  if (value === "under_review" || value === "partially_paid") {
    return "bg-amber-100 text-amber-800";
  }
  if (value === "held") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (value === "pending" || value === "partially_held" || value === "partially_released") {
    return "bg-amber-100 text-amber-800";
  }
  if (value === "retained" || value === "partially_retained") {
    return "bg-rose-100 text-rose-800";
  }
  return "bg-slate-100 text-slate-700";
}

function paymentStatusLabel(status: InvoicePaymentStatus) {
  switch (status) {
    case "partially_paid":
      return "Partially Paid";
    case "overdue":
      return "Overdue";
    case "paid":
      return "Paid";
    case "unpaid":
    default:
      return "Unpaid";
  }
}

function emailTypeLabel(type: RentalCustomerEmailEvent["type"]) {
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

function decisionLabel(value: RentalCustomerCreditControlSummary["recommendedDecision"]) {
  switch (value) {
    case "blocked_manual_hold":
      return "Blocked - Manual Hold";
    case "control_disabled":
      return "Control Disabled";
    case "blocked_overdue":
      return "Blocked - Overdue";
    case "blocked_limit":
      return "Blocked - Limit";
    case "eligible":
    default:
      return "Eligible";
  }
}

function depositStatusLabel(status: RentalCustomerRecentOrder["depositStatus"]) {
  switch (status) {
    case "held":
      return "Held";
    case "partially_held":
      return "Partially Held";
    case "pending":
      return "Pending";
    case "not_required":
      return "Not Required";
    case "released":
      return "Released";
    case "partially_released":
      return "Partially Released";
    case "retained":
      return "Retained";
    case "partially_retained":
      return "Partially Retained";
    default:
      return status;
  }
}

function reasonLabel(value: RentalCustomerCreditControlSummary["recommendedReasonCode"]) {
  switch (value) {
    case "manual_hold":
      return "Manual hold";
    case "credit_control_disabled":
      return "Credit control disabled";
    case "overdue_balance":
      return "Overdue balance";
    case "credit_limit_unavailable":
      return "Credit limit unavailable";
    case "eligible":
    default:
      return "Eligible";
  }
}

export default function AdminRentalCustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id ?? "");

  const [overview, setOverview] = useState<RentalCustomerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBanner, setAccountBanner] = useState<string | null>(null);
  const [creditPolicySaving, setCreditPolicySaving] = useState(false);
  const [creditPolicyError, setCreditPolicyError] = useState<string | null>(null);
  const [creditPolicyBanner, setCreditPolicyBanner] = useState<string | null>(null);

  const [vettingStatus, setVettingStatus] = useState<RentalCustomerVettingStatus>("new");
  const [paymentTerms, setPaymentTerms] = useState<RentalCustomerPaymentTerms>("upfront");
  const [accountStatus, setAccountStatus] = useState<RentalCustomerAccountStatus>("active");
  const [internalNotes, setInternalNotes] = useState("");
  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [creditControlEnabled, setCreditControlEnabled] = useState(true);
  const [creditHoldReason, setCreditHoldReason] = useState("");

  const customer = overview?.customer ?? null;

  async function loadOverview() {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/admin/rental/customers/${encodeURIComponent(id)}/overview`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load customer overview");
      const nextOverview = data as RentalCustomerOverview;
      setOverview(nextOverview);
    } catch (err) {
      setOverview(null);
      setLoadError(err instanceof Error ? err.message : "Failed to load customer overview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!customer) return;
    setVettingStatus(customer.vettingStatus);
    setPaymentTerms(customer.paymentTerms);
    setAccountStatus(customer.accountStatus);
    setInternalNotes(customer.internalNotes ?? "");
    setCreditLimitInput(
      typeof customer.creditLimit === "number" && Number.isFinite(customer.creditLimit)
        ? customer.creditLimit.toFixed(2)
        : ""
    );
    setCreditControlEnabled(customer.creditControlEnabled);
    setCreditHoldReason(customer.creditHoldReason ?? "");
  }, [customer]);

  async function onSaveAccount() {
    if (!customer || accountSaving) return;
    try {
      setAccountSaving(true);
      setAccountError(null);
      setAccountBanner(null);

      const res = await fetch(`/api/admin/rental/customers/${encodeURIComponent(customer.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vettingStatus,
          paymentTerms,
          accountStatus,
          internalNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update customer");

      await loadOverview();
      setAccountBanner("Customer account updated.");
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setAccountSaving(false);
    }
  }

  async function onSaveCreditPolicy() {
    if (!customer || creditPolicySaving) return;
    try {
      setCreditPolicySaving(true);
      setCreditPolicyError(null);
      setCreditPolicyBanner(null);

      const trimmedCreditLimit = creditLimitInput.trim();
      const parsedCreditLimit = trimmedCreditLimit ? Number(trimmedCreditLimit) : null;
      const payload = {
        creditLimit: parsedCreditLimit,
        creditControlEnabled,
        creditHoldReason,
      };

      if (trimmedCreditLimit && (parsedCreditLimit === null || !Number.isFinite(parsedCreditLimit) || parsedCreditLimit < 0)) {
        throw new Error("Credit limit must be blank or a non-negative number");
      }

      const res = await fetch(`/api/admin/rental/customers/${encodeURIComponent(customer.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update credit policy");

      await loadOverview();
      setCreditPolicyBanner("Credit policy updated.");
    } catch (err) {
      setCreditPolicyError(err instanceof Error ? err.message : "Failed to update credit policy");
    } finally {
      setCreditPolicySaving(false);
    }
  }

  const financialSummary = useMemo<RentalCustomerFinancialSummary>(
    () =>
      overview?.financialSummary ?? {
        totalInvoices: 0,
        totalPaidCents: 0,
        outstandingBalanceCents: 0,
        overdueInvoicesCount: 0,
      },
    [overview]
  );
  const creditControl = useMemo<RentalCustomerCreditControlSummary>(
    () =>
      overview?.creditControl ?? {
        creditLimit: null,
        creditUsed: 0,
        availableCredit: 0,
        overdueAmount: 0,
        overdueInvoiceCount: 0,
        oldestOverdueInvoiceDate: null,
        creditControlEnabled: true,
        hasManualCreditHold: false,
        creditHoldReason: null,
        recommendedDecision: "eligible",
        recommendedReasonCode: "eligible",
      },
    [overview]
  );
  const depositSummary = useMemo<RentalCustomerDepositSummary>(
    () =>
      overview?.depositSummary ?? {
        totalRequiredCents: 0,
        totalHeldCents: 0,
        totalOutstandingCents: 0,
        heldCount: 0,
        pendingCount: 0,
      },
    [overview]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading customer overview...
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {loadError ?? "Customer not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{customer.companyName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {customer.contactName} · {customer.email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/admin/rental/customers")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Customers
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[customer.vettingStatus, customer.paymentTerms, customer.accountStatus].map((value) => (
          <span
            key={value}
            className={["rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide", badgeTone(value)].join(" ")}
          >
            {value.replace("_", " ")}
          </span>
        ))}
      </div>

      {accountBanner && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {accountBanner}
        </div>
      )}

      {loadError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Customer Account Info</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</div>
                <div className="mt-1 text-sm text-slate-900">{customer.companyName}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</div>
                <div className="mt-1 text-sm text-slate-900">{customer.contactName}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</div>
                <div className="mt-1 text-sm text-slate-900">{customer.email}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</div>
                <div className="mt-1 text-sm text-slate-900">{customer.phone ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">UEN</div>
                <div className="mt-1 text-sm text-slate-900">{customer.uen ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Linked Auth User</div>
                <div className="mt-1 text-sm text-slate-900">{customer.authUserId ?? "-"}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</div>
                <div className="mt-1 whitespace-pre-line text-sm text-slate-900">{customer.address ?? "-"}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Financial Summary</h2>
              <span className="text-xs text-slate-500">DB-derived</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
              <SummaryCard label="Total Invoices" value={String(financialSummary.totalInvoices)} />
              <SummaryCard label="Total Paid" value={moneyFromCents(financialSummary.totalPaidCents)} />
              <SummaryCard
                label="Outstanding"
                value={moneyFromCents(financialSummary.outstandingBalanceCents)}
              />
              <SummaryCard label="Overdue Count" value={String(financialSummary.overdueInvoicesCount)} />
              <SummaryCard label="Deposit Required" value={moneyFromCents(depositSummary.totalRequiredCents)} />
              <SummaryCard label="Deposit Held" value={moneyFromCents(depositSummary.totalHeldCents)} />
              <SummaryCard
                label="Deposit Outstanding"
                value={moneyFromCents(depositSummary.totalOutstandingCents)}
              />
              <SummaryCard
                label="Deposit Orders"
                value={`${depositSummary.heldCount} held / ${depositSummary.pendingCount} pending`}
              />
            </div>
          </section>

          <OrdersSection orders={overview?.recentOrders ?? []} router={router} />
          <InvoicesSection invoices={overview?.recentInvoices ?? []} router={router} />
          <PaymentsSection payments={overview?.recentPayments ?? []} router={router} />
          <EmailsSection emailEvents={overview?.emailEvents ?? []} />
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Credit Policy</h2>
              <span className="text-xs text-slate-500">Account-level settings</span>
            </div>

            {creditPolicyBanner && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {creditPolicyBanner}
              </div>
            )}

            {creditPolicyError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {creditPolicyError}
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Payment Terms
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{customer.paymentTerms}</div>
              </div>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Credit Limit (SGD)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={creditLimitInput}
                  onChange={(e) => setCreditLimitInput(e.target.value)}
                  placeholder="Leave blank for not set"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                />
                <span className="text-xs text-slate-500">Leave blank to keep the credit limit unset.</span>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Credit Control Enabled</span>
                <select
                  value={creditControlEnabled ? "enabled" : "disabled"}
                  onChange={(e) => setCreditControlEnabled(e.target.value === "enabled")}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Manual Hold Reason</span>
                <textarea
                  value={creditHoldReason}
                  onChange={(e) => setCreditHoldReason(e.target.value)}
                  className="min-h-28 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400"
                  placeholder="Optional manual hold note for credit control..."
                />
              </label>

              <button
                type="button"
                onClick={onSaveCreditPolicy}
                disabled={creditPolicySaving}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
              >
                {creditPolicySaving ? "Saving..." : "Save Credit Policy"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Credit Exposure</h2>
              <span
                className={[
                  "rounded-full px-2 py-1 text-xs font-semibold uppercase",
                  badgeTone(creditControl.recommendedDecision),
                ].join(" ")}
              >
                {decisionLabel(creditControl.recommendedDecision)}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryCard
                label="Credit Control"
                value={creditControl.creditControlEnabled ? "Enabled" : "Disabled"}
              />
              <SummaryCard
                label="Credit Limit"
                value={
                  creditControl.creditLimit === null ? "Not set" : moneyFromAmount(creditControl.creditLimit)
                }
              />
              <SummaryCard label="Credit Used" value={moneyFromAmount(creditControl.creditUsed)} />
              <SummaryCard label="Available Credit" value={moneyFromAmount(creditControl.availableCredit)} />
              <SummaryCard label="Overdue Amount" value={moneyFromAmount(creditControl.overdueAmount)} />
              <SummaryCard label="Overdue Invoices" value={String(creditControl.overdueInvoiceCount)} />
              <SummaryCard
                label="Oldest Overdue"
                value={formatDate(creditControl.oldestOverdueInvoiceDate ?? undefined)}
              />
              <SummaryCard label="Effective Reason" value={reasonLabel(creditControl.recommendedReasonCode)} />
            </div>
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Manual Hold Reason
                </div>
                <div className="mt-1 text-sm text-slate-900">
                  {creditControl.creditHoldReason ?? "No manual hold set."}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={[
                    "rounded-full px-2 py-1 text-xs font-semibold uppercase",
                    badgeTone(creditControl.hasManualCreditHold ? "blocked_manual_hold" : "eligible"),
                  ].join(" ")}
                >
                  {creditControl.hasManualCreditHold ? "Manual Hold" : "No Manual Hold"}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold uppercase text-slate-700">
                  {reasonLabel(creditControl.recommendedReasonCode)}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Account Settings</h2>
            {accountError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {accountError}
              </div>
            )}
            <div className="mt-4 space-y-4">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Vetting Status</span>
                <select
                  value={vettingStatus}
                  onChange={(e) => setVettingStatus(e.target.value as RentalCustomerVettingStatus)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                >
                  {VETTING_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Payment Terms</span>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value as RentalCustomerPaymentTerms)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                >
                  {PAYMENT_TERMS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Account Status</span>
                <select
                  value={accountStatus}
                  onChange={(e) => setAccountStatus(e.target.value as RentalCustomerAccountStatus)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                >
                  {ACCOUNT_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={onSaveAccount}
                disabled={accountSaving}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-slate-300"
              >
                {accountSaving ? "Saving..." : "Save Account Settings"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Internal Notes</h2>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="mt-4 min-h-48 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400"
              placeholder="Reliable payer, returned equipment late, approved for credit..."
            />
            <button
              type="button"
              onClick={onSaveAccount}
              disabled={accountSaving}
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100"
            >
              {accountSaving ? "Saving..." : "Save Notes"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function OrdersSection({
  orders,
  router,
}: {
  orders: RentalCustomerRecentOrder[];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
        <span className="text-xs text-slate-500">{orders.length} shown</span>
      </div>
      {orders.length === 0 ? (
        <div className="mt-4 text-sm text-slate-500">No booking history found.</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Equipment</th>
                <th className="px-4 py-3">Rental Start</th>
                <th className="px-4 py-3">Rental End</th>
                <th className="px-4 py-3">Order Status</th>
                <th className="px-4 py-3">Deposit</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{order.id}</td>
                  <td className="px-4 py-3 text-slate-900">{order.equipmentSummary}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(order.rentalStart)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(order.rentalEnd)}</td>
                  <td className="px-4 py-3 text-slate-700">{order.orderStatus}</td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{moneyFromCents(order.depositRequiredCents)}</div>
                    <div className="text-xs text-slate-500">
                      Held: {moneyFromCents(order.depositHeldCents)}
                    </div>
                    <span
                      className={[
                        "mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                        badgeTone(order.depositStatus),
                      ].join(" ")}
                    >
                      {depositStatusLabel(order.depositStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => router.push("/admin/rental/orders")}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Orders
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InvoicesSection({
  invoices,
  router,
}: {
  invoices: RentalCustomerRecentInvoice[];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Recent Invoices</h2>
        <span className="text-xs text-slate-500">{invoices.length} shown</span>
      </div>
      {invoices.length === 0 ? (
        <div className="mt-4 text-sm text-slate-500">No invoice history found.</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Lifecycle</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  onClick={() => router.push(`/admin/rental/invoices/${encodeURIComponent(invoice.id)}`)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{invoice.invoiceNo ?? "Draft"}</div>
                    <div className="text-xs text-slate-500">{invoice.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(invoice.issueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={["rounded-full px-2 py-1 text-xs font-semibold uppercase", badgeTone(invoice.status)].join(" ")}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-900">{moneyFromCents(invoice.totalInclGstCents)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-xs font-semibold uppercase",
                        badgeTone(invoice.paymentStatus),
                      ].join(" ")}
                    >
                      {paymentStatusLabel(invoice.paymentStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(invoice.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaymentsSection({
  payments,
  router,
}: {
  payments: RentalCustomerRecentPayment[];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Recent Payments</h2>
        <span className="text-xs text-slate-500">{payments.length} shown</span>
      </div>
      {payments.length === 0 ? (
        <div className="mt-4 text-sm text-slate-500">No payments recorded yet.</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Paid At</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(payment.paidAt)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{moneyFromCents(payment.amountCents)}</td>
                  <td className="px-4 py-3 text-slate-700">{payment.method ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{payment.reference ?? "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/rental/invoices/${encodeURIComponent(payment.invoiceId)}`)}
                      className="text-left text-sky-700 hover:underline"
                    >
                      {payment.invoiceNo ?? payment.invoiceId}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmailsSection({ emailEvents }: { emailEvents: RentalCustomerEmailEvent[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Recent Email Activity</h2>
        <span className="text-xs text-slate-500">{emailEvents.length} shown</span>
      </div>
      {emailEvents.length === 0 ? (
        <div className="mt-4 text-sm text-slate-500">No email activity logged yet.</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {emailEvents.map((event) => (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span className={["rounded-full px-2 py-1 text-xs font-semibold uppercase", badgeTone(event.type)].join(" ")}>
                      {emailTypeLabel(event.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{event.recipient}</td>
                  <td className="px-4 py-3 text-slate-700">{event.subject}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(event.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
