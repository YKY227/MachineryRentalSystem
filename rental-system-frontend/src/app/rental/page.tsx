"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { Equipment } from "@/lib/rental/types";
import { CartBadge } from "@/components/rental/CartBadge";
import { EquipmentCard } from "@/components/rental/EquipmentCard";
import {
  EquipmentFilters,
  type EquipmentFilterState,
} from "@/components/rental/EquipmentFilters";

export default function RentalCatalogPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<EquipmentFilterState>({
    q: "",
    category: "all",
    onlyInStock: false,
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/public/rental/equipment", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment");
        setItems(Array.isArray(data?.equipment) ? (data.equipment as Equipment[]) : []);
      } catch {
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();

    return items.filter((e) => {
      const matchesQ =
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.brand ?? "").toLowerCase().includes(q) ||
        (e.model ?? "").toLowerCase().includes(q);

      const matchesCat = filters.category === "all" || e.category === filters.category;
      const matchesStock = !filters.onlyInStock || e.totalUnits > 0;

      return matchesQ && matchesCat && matchesStock;
    });
  }, [items, filters]);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Equipment & Machinery Rental
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Browse available equipment, choose rental dates, and schedule delivery
            or self-collection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <CartBadge />
          <Link
            href="/rental/account"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            My account
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <EquipmentFilters value={filters} onChange={setFilters} />
      </div>

      {loading ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading equipment...
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No published equipment found.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((equipment) => (
            <EquipmentCard key={equipment.id} equipment={equipment} />
          ))}
        </div>
      )}
    </div>
  );
}
