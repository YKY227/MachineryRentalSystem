// src/components/rental/EquipmentFilters.tsx
"use client";

import type { EquipmentCategory } from "@/lib/rental/types";
import { Search, Filter } from "lucide-react";

export type EquipmentFilterState = {
  q: string;
  category: "all" | EquipmentCategory;
  onlyInStock: boolean;
};

export function EquipmentFilters({
  value,
  onChange,
}: {
  value: EquipmentFilterState;
  onChange: (next: EquipmentFilterState) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            placeholder="Search equipment (name, brand, model)…"
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>

        {/* Category */}
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={value.category}
              onChange={(e) =>
                onChange({
                  ...value,
                  category: e.target.value as EquipmentFilterState["category"],
                })
              }
              className="bg-transparent text-sm text-slate-900 outline-none"
            >
              <option value="all">All categories</option>
              <option value="earthmoving">Earthmoving</option>
              <option value="lifting">Lifting</option>
              <option value="power">Power</option>
              <option value="concreting">Concreting</option>
              <option value="compaction">Compaction</option>
              <option value="cleaning">Cleaning</option>
            </select>
          </div>

          {/* In stock */}
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.onlyInStock}
              onChange={(e) =>
                onChange({ ...value, onlyInStock: e.target.checked })
              }
            />
            In stock only
          </label>
        </div>
      </div>

      {/* Small helper row */}
      <div className="mt-3 text-xs text-slate-500">
        Tip: “Published” items are controlled from{" "}
        <span className="font-mono">/admin/rental</span> (mock localStorage for now).
      </div>
    </div>
  );
}
