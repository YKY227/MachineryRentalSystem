// src/components/admin/rental/import/AdminEquipmentImportCard.tsx
"use client";

import type { ImportedEquipment } from "@/lib/rental/import/types";

function formatMoney(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(v);
}

function missingChips(item: ImportedEquipment) {
  const misses: string[] = [];
  if (!item.itemcode) misses.push("Missing itemcode");
  if (!item.itemName) misses.push("Missing name");
  if (!item.category) misses.push("No category");
  if (!item.shortDesc) misses.push("No description");
  if (!item.images?.length) misses.push("No images");
  if (!item.rentalQty || item.rentalQty <= 0) misses.push("Qty invalid");
  return misses.slice(0, 4);
}

export function AdminEquipmentImportCard({
  item,
  onClick,
}: {
  item: ImportedEquipment;
  onClick: () => void;
}) {
  const img = item.images?.[0]?.url ?? "";
  const chips = missingChips(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr]">
        <div className="bg-slate-100">
          <div className="aspect-[4/3]">
            {img ? (
              <img
                src={img}
                alt={item.itemName || "Preview"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                No image
              </div>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            {/* Left side MUST be min-w-0 so it can shrink */}
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500">
                {item.itemcode || "—"}
              </div>

              {/* Title: clamp + break long tokens so it never pushes status offscreen */}
              <div
                className={[
                  "mt-1 text-base font-semibold text-slate-900",
                  "min-w-0",
                  "break-words",
                  "[overflow-wrap:anywhere]",
                  "line-clamp-2",
                ].join(" ")}
                title={item.itemName || "Untitled item"}
              >
                {item.itemName || "Untitled item"}
              </div>

              {/* If you DON'T have line-clamp plugin, replace the title div above with:
                  <div className="mt-1 text-base font-semibold text-slate-900 break-words [overflow-wrap:anywhere]">
                    {item.itemName || "Untitled item"}
                  </div>
              */}
            </div>

            <span
              className={[
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                "whitespace-nowrap",
                item.status === "published"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600",
              ].join(" ")}
            >
              {item.status === "published" ? "Published" : "Draft"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div>
              <div className="text-xs text-slate-500">Rental Qty</div>
              <div className="font-semibold text-slate-900">
                {item.rentalQty ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Day</div>
              <div className="font-semibold text-slate-900">
                {formatMoney(item.dayPrice)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Week</div>
              <div className="font-semibold text-slate-900">
                {item.weekPrice != null ? formatMoney(item.weekPrice) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Month</div>
              <div className="font-semibold text-slate-900">
                {item.monthPrice != null ? formatMoney(item.monthPrice) : "—"}
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-semibold border border-amber-100"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
