"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="mx-auto max-w-7xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rental Customers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Admin-managed customer accounts, vetting, and payment terms.
          </p>
        </div>

        <button
          onClick={() => router.push("/admin/rental")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to Rental
        </button>
      </div>

      <form onSubmit={onSearchSubmit} className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company, contact, or email"
          className="min-w-[280px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400"
        />
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            loadCustomers("");
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="p-6 text-sm text-slate-600">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">No customer accounts found.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Vetting</th>
                  <th className="px-4 py-3">Terms</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => setSelectedId(customer.id)}
                    className={[
                      "cursor-pointer border-t border-slate-100",
                      customer.id === selectedId ? "bg-sky-50" : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/admin/rental/customers/${encodeURIComponent(customer.id)}`);
                        }}
                        className="font-medium text-slate-900 hover:text-sky-700 hover:underline"
                      >
                        {customer.companyName}
                      </button>
                      <div className="text-xs text-slate-500">{customer.uen ?? "No UEN"}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{customer.contactName}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.email}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.vettingStatus.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.paymentTerms}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.accountStatus}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDateTime(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Customer details</h2>
          {!selectedCustomer ? (
            <p className="mt-3 text-sm text-slate-600">Select a customer to review or update.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-1 text-sm">
                <div className="font-medium text-slate-900">{selectedCustomer.companyName}</div>
                <div className="text-slate-600">{selectedCustomer.contactName}</div>
                <div className="text-slate-600">{selectedCustomer.email}</div>
                {selectedCustomer.phone && <div className="text-slate-600">{selectedCustomer.phone}</div>}
                {selectedCustomer.uen && <div className="text-slate-600">UEN: {selectedCustomer.uen}</div>}
                {selectedCustomer.authUserId && (
                  <div className="text-xs text-slate-500">Auth user linked: {selectedCustomer.authUserId}</div>
                )}
              </div>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Vetting status</span>
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
                <span className="text-slate-700">Payment terms</span>
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
                <span className="text-slate-700">Account status</span>
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

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Internal notes</span>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="min-h-32 rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                />
              </label>

              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-slate-300"
              >
                {saving ? "Saving..." : "Save customer"}
              </button>

              <button
                type="button"
                onClick={() => router.push(`/admin/rental/customers/${encodeURIComponent(selectedCustomer.id)}`)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open Account Overview
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
