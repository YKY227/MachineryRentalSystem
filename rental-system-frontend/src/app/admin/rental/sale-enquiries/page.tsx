"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  SearchCheck,
} from "lucide-react";

import type {
  RentalEquipmentSaleEnquiry,
  RentalEquipmentSaleEnquiryStatus,
} from "@/lib/rental/sale-enquiries/types";

const STATUS_OPTIONS: RentalEquipmentSaleEnquiryStatus[] = [
  "new",
  "contacted",
  "awaiting_customer",
  "availability_confirmed",
  "quoted",
  "converted",
  "closed_lost",
  "cancelled",
];

function statusLabel(status: RentalEquipmentSaleEnquiryStatus) {
  return status.replace(/_/g, " ");
}

function statusTone(status: RentalEquipmentSaleEnquiryStatus) {
  switch (status) {
    case "availability_confirmed":
    case "quoted":
    case "converted":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "awaiting_customer":
    case "contacted":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "closed_lost":
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "new":
    default:
      return "border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E]";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-SG", { hour12: true });
}

function formatCents(cents?: number) {
  if (cents === undefined) return "Request quote";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(Math.max(0, cents) / 100);
}

function salePriceLabel(enquiry: RentalEquipmentSaleEnquiry) {
  return enquiry.salePriceModeSnapshot === "fixed"
    ? formatCents(enquiry.salePriceCentsSnapshot)
    : "Request quote";
}

export default function AdminRentalSaleEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<RentalEquipmentSaleEnquiry[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RentalEquipmentSaleEnquiryStatus>("all");
  const [nextStatus, setNextStatus] = useState<RentalEquipmentSaleEnquiryStatus>("new");
  const [adminNotes, setAdminNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => enquiries.find((enquiry) => enquiry.id === selectedId) ?? enquiries[0] ?? null,
    [enquiries, selectedId]
  );

  async function loadEnquiries(nextFilter = statusFilter) {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      qs.set("limit", "100");
      if (nextFilter !== "all") qs.set("status", nextFilter);
      const res = await fetch(`/api/admin/rental/sale-enquiries?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load sale enquiries");
      const nextEnquiries = (data?.enquiries ?? []) as RentalEquipmentSaleEnquiry[];
      setEnquiries(nextEnquiries);
      setSelectedId((current) =>
        nextEnquiries.some((enquiry) => enquiry.id === current)
          ? current
          : nextEnquiries[0]?.id ?? ""
      );
    } catch (err) {
      setEnquiries([]);
      setSelectedId("");
      setError(err instanceof Error ? err.message : "Failed to load sale enquiries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEnquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setNextStatus(selected.status);
    setAdminNotes(selected.adminNotes ?? "");
  }, [selected]);

  async function onFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadEnquiries(statusFilter);
  }

  async function onSave() {
    if (!selected || saving) return;

    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/admin/rental/sale-enquiries/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          adminNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update sale enquiry");
      const updated = data?.enquiry as RentalEquipmentSaleEnquiry;
      setEnquiries((current) =>
        current.map((enquiry) => (enquiry.id === updated.id ? updated : enquiry))
      );
      setSelectedId(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sale enquiry");
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
              <SearchCheck className="h-4 w-4" />
              Manual sale confirmation
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-[#2A2A2A]">Sale Enquiries</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review purchase enquiries without creating carts, sale payments, invoices, or rental holds.
            </p>
          </div>

          <Link
            href="/admin/rental"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Equipment
            </span>
          </Link>
        </div>
      </div>

      <form onSubmit={onFilterSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | RentalEquipmentSaleEnquiryStatus)
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-[#D24338] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#B9382E]"
            >
              Apply filter
            </button>
            <button
              type="button"
              onClick={() => loadEnquiries(statusFilter)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-7">
          <div className="border-b border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">Recent enquiries</div>
            <div className="mt-1 text-xs text-slate-500">
              Showing the latest {enquiries.length} sale enquiry record(s).
            </div>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-slate-500">Loading sale enquiries...</div>
          ) : enquiries.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">No sale enquiries found.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {enquiries.map((enquiry) => {
                const active = selected?.id === enquiry.id;
                return (
                  <button
                    key={enquiry.id}
                    type="button"
                    onClick={() => setSelectedId(enquiry.id)}
                    className={[
                      "block w-full p-4 text-left transition",
                      active ? "bg-[#FFF6F4]" : "bg-white hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {enquiry.equipmentTitleSnapshot}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {enquiry.customerName} | {enquiry.customerEmail}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {enquiry.customerPhone || "No phone"} | {formatDateTime(enquiry.createdAt)}
                        </div>
                      </div>
                      <span
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
                          statusTone(enquiry.status),
                        ].join(" ")}
                      >
                        {statusLabel(enquiry.status)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>Sale status: {enquiry.saleStatusSnapshot.replace(/_/g, " ")}</span>
                      <span>Price: {salePriceLabel(enquiry)}</span>
                      {enquiry.fulfillmentPreference && (
                        <span>Fulfillment: {enquiry.fulfillmentPreference.replace("_", "-")}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {selected ? (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Enquiry detail</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Submitted {formatDateTime(selected.createdAt)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="font-semibold text-slate-900">{selected.equipmentTitleSnapshot}</div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-600">
                    <div>Sale status snapshot: {selected.saleStatusSnapshot.replace(/_/g, " ")}</div>
                    <div>Sale price snapshot: {salePriceLabel(selected)}</div>
                    <div>Condition: {selected.saleConditionSnapshot || "Not specified"}</div>
                    <div>Warranty: {selected.saleWarrantySnapshot || "Not specified"}</div>
                  </div>
                </div>

                <div className="grid gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 text-slate-400" />
                    <div>
                      <div className="font-medium text-slate-900">{selected.customerEmail}</div>
                      <div className="text-xs text-slate-500">{selected.customerName}</div>
                    </div>
                  </div>
                  {selected.customerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{selected.customerPhone}</span>
                    </div>
                  )}
                  {selected.companyName && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <span>{selected.companyName}</span>
                    </div>
                  )}
                  {selected.message && (
                    <div className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
                      <MessageSquareText className="mt-0.5 h-4 w-4 text-slate-400" />
                      <span>{selected.message}</span>
                    </div>
                  )}
                </div>

                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Status</span>
                    <select
                      value={nextStatus}
                      onChange={(event) =>
                        setNextStatus(event.target.value as RentalEquipmentSaleEnquiryStatus)
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Admin notes</span>
                    <textarea
                      value={adminNotes}
                      onChange={(event) => setAdminNotes(event.target.value)}
                      rows={5}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="Internal follow-up notes"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-xl bg-[#D24338] px-4 py-3 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                  >
                    {saving ? "Saving..." : "Save enquiry"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select an enquiry to review.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
