"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CircleUserRound,
  FileSearch,
  Mail,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UserRoundSearch,
  X,
} from "lucide-react";

import type {
  RentalCustomer,
  RentalCustomerAccountStatus,
  RentalCustomerPaymentTerms,
  RentalCustomerVettingStatus,
} from "@/lib/rental/orders/types";

const VETTING_OPTIONS: RentalCustomerVettingStatus[] = [
  "new",
  "under_review",
  "pre_vetted",
  "rejected",
];

const PAYMENT_TERMS_OPTIONS: RentalCustomerPaymentTerms[] = ["upfront", "credit"];
const ACCOUNT_STATUS_OPTIONS: RentalCustomerAccountStatus[] = ["active", "suspended"];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SG", { hour12: true });
}

function vettingLabel(status: RentalCustomerVettingStatus) {
  return status.replace("_", " ");
}

function vettingTone(status: RentalCustomerVettingStatus) {
  switch (status) {
    case "pre_vetted":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "under_review":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "new":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function paymentTermsTone(status: RentalCustomerPaymentTerms) {
  return status === "credit"
    ? "border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E]"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function accountStatusTone(status: RentalCustomerAccountStatus) {
  return status === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-rose-200 bg-rose-50 text-rose-800";
}

export default function AdminRentalCustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<RentalCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [vettingStatus, setVettingStatus] = useState<RentalCustomerVettingStatus>("new");
  const [paymentTerms, setPaymentTerms] = useState<RentalCustomerPaymentTerms>("upfront");
  const [accountStatus, setAccountStatus] = useState<RentalCustomerAccountStatus>("active");
  const [internalNotes, setInternalNotes] = useState("");

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedId) ?? null,
    [customers, selectedId]
  );

  async function loadCustomers(nextQuery = query) {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      if (nextQuery.trim()) qs.set("q", nextQuery.trim());
      const res = await fetch(`/api/admin/rental/customers?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load customers");
      const nextCustomers = (data?.customers ?? []) as RentalCustomer[];
      setCustomers(nextCustomers);
      if (!nextCustomers.some((customer) => customer.id === selectedId)) {
        const first = nextCustomers[0] ?? null;
        setSelectedId(first?.id ?? "");
      }
    } catch (err) {
      setCustomers([]);
      setError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCustomer) return;
    setVettingStatus(selectedCustomer.vettingStatus);
    setPaymentTerms(selectedCustomer.paymentTerms);
    setAccountStatus(selectedCustomer.accountStatus);
    setInternalNotes(selectedCustomer.internalNotes ?? "");
  }, [selectedCustomer]);

  async function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadCustomers(query);
  }

  async function onSave() {
    if (!selectedCustomer || saving) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/admin/rental/customers/${encodeURIComponent(selectedCustomer.id)}`, {
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

      const updated = data?.customer as RentalCustomer;
      setCustomers((current) => current.map((customer) => (customer.id === updated.id ? updated : customer)));
      setSelectedId(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 bg-slate-50 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B9382E]">
            <UserRoundSearch className="h-4 w-4" />
            Customer account workspace
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-[#2A2A2A]">Rental Customers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Admin-managed customer accounts, vetting, and payment terms.
          </p>
        </div>

        <button
          onClick={() => router.push("/admin/rental")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Rental
          </span>
        </button>
      </div>
      </div>

      <form onSubmit={onSearchSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Search className="h-4 w-4 text-[#D24338]" />
              Search customers
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Search by company, contact, or email while keeping the current master-detail workflow intact.
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search company, contact, or email"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    loadCustomers("");
                  }}
                  className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-xl bg-[#D24338] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B9382E]"
        >
          <span className="inline-flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            Search
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            loadCustomers("");
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-2">
            <X className="h-4 w-4" />
            Clear
          </span>
        </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-600">
              <UserRoundSearch className="h-4 w-4 text-slate-400" />
              Loading customers...
            </div>
          ) : customers.length === 0 ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-600">
              <Building2 className="h-4 w-4 text-slate-400" />
              No customer accounts found.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Customer state</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => setSelectedId(customer.id)}
                    className={[
                      "cursor-pointer border-t border-slate-100 transition-colors",
                      customer.id === selectedId
                        ? "bg-[#FCE9E7] ring-inset"
                        : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/admin/rental/customers/${encodeURIComponent(customer.id)}`);
                        }}
                        className="font-medium text-slate-900 hover:text-[#B9382E] hover:underline"
                      >
                        {customer.companyName}
                      </button>
                      <div className="text-xs text-slate-500">{customer.uen ?? "No UEN"}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="font-medium text-slate-900">{customer.contactName}</div>
                      <div className="mt-1 text-xs text-slate-500">{customer.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${vettingTone(customer.vettingStatus)}`}>
                          {vettingLabel(customer.vettingStatus)}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${paymentTermsTone(customer.paymentTerms)}`}>
                          {customer.paymentTerms}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${accountStatusTone(customer.accountStatus)}`}>
                          {customer.accountStatus}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDateTime(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserCog className="h-4 w-4 text-[#D24338]" />
            Customer account details
          </div>
          {!selectedCustomer ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <CircleUserRound className="h-4 w-4 text-slate-400" />
              Select a customer to review or update.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[#F2C7C2] bg-[#FCE9E7] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[#2A2A2A]">{selectedCustomer.companyName}</div>
                    <div className="mt-1 text-sm text-slate-700">{selectedCustomer.contactName}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${vettingTone(selectedCustomer.vettingStatus)}`}>
                      {vettingLabel(selectedCustomer.vettingStatus)}
                    </span>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${paymentTermsTone(selectedCustomer.paymentTerms)}`}>
                      {selectedCustomer.paymentTerms}
                    </span>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${accountStatusTone(selectedCustomer.accountStatus)}`}>
                      {selectedCustomer.accountStatus}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div className="inline-flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#B9382E]" />
                    {selectedCustomer.email}
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#B9382E]" />
                    {selectedCustomer.uen ? `UEN: ${selectedCustomer.uen}` : "No UEN recorded"}
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#B9382E]" />
                    {selectedCustomer.phone ?? "No phone recorded"}
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <CircleUserRound className="h-4 w-4 text-[#B9382E]" />
                    {selectedCustomer.authUserId ? `Auth linked: ${selectedCustomer.authUserId}` : "No linked auth user"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-[#D24338]" />
                  Account controls
                </div>
                <div className="grid gap-4">
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Vetting status</span>
                    <select
                      value={vettingStatus}
                      onChange={(e) => setVettingStatus(e.target.value as RentalCustomerVettingStatus)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-[#D24338]"
                    >
                      {VETTING_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Payment terms</span>
                    <select
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value as RentalCustomerPaymentTerms)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-[#D24338]"
                    >
                      {PAYMENT_TERMS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Account status</span>
                    <select
                      value={accountStatus}
                      onChange={(e) => setAccountStatus(e.target.value as RentalCustomerAccountStatus)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-[#D24338]"
                    >
                      {ACCOUNT_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <UserCog className="h-4 w-4 text-[#D24338]" />
                  Internal notes
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-700">Notes</span>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    className="min-h-32 rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-[#D24338]"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Building2 className="h-4 w-4 text-[#D24338]" />
                  Follow-through actions
                </div>
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="w-full rounded-xl bg-[#D24338] px-4 py-3 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                  >
                    {saving ? "Saving..." : "Save customer"}
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push(`/admin/rental/customers/${encodeURIComponent(selectedCustomer.id)}`)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[#B9382E]" />
                      Open Account Overview
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
