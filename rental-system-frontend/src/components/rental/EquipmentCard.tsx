// src/components/rental/EquipmentCard.tsx
"use client";

import Link from "next/link";
import type { Equipment } from "@/lib/rental/types";
import { ArrowRight, Package, Tag } from "lucide-react";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function categoryLabel(cat: string) {
  return cat
    .split("-")
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EquipmentCard({ equipment }: { equipment: Equipment }) {
  const img = equipment.images?.[0] ?? "";

  const day = equipment.pricing?.dayRate ?? 0;
  const week = equipment.pricing?.weekRate;
  const month = equipment.pricing?.monthRate;

  const inStock = (equipment.totalUnits ?? 0) > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Image */}
      <div className="relative aspect-[16/10] w-full bg-slate-100">
        {img ? (
          // Use <img> to avoid Next Image domain config during MVP
          <img
            src={img}
            alt={equipment.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <Package className="h-10 w-10" />
          </div>
        )}

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            <Tag className="h-3.5 w-3.5" />
            {categoryLabel(equipment.category)}
          </span>

          <span
            className={[
              "rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
              inStock
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-rose-50 text-rose-700 ring-rose-200",
            ].join(" ")}
          >
            {inStock ? `${equipment.totalUnits} available` : "Out of stock"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {equipment.title}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {equipment.brand ?? "—"}
              {equipment.model ? ` • ${equipment.model}` : ""}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-xs text-slate-500">From</div>
            <div className="text-base font-semibold text-slate-900">
              {formatMoney(day)}
              <span className="text-xs font-medium text-slate-500">/day</span>
            </div>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-slate-600">
          {equipment.shortDesc}
        </p>

        {/* Quick pricing row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-50 p-2 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Day
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {formatMoney(day)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Week
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {week ? formatMoney(week) : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Month
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {month ? formatMoney(month) : "—"}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Min: {equipment.pricing?.minDays ?? 1} day(s)
            {equipment.pricing?.deposit ? ` • Deposit: ${formatMoney(equipment.pricing.deposit)}` : ""}
          </div>

          <Link
            href={`/rental/${encodeURIComponent(equipment.id)}`}
            className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            View
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
