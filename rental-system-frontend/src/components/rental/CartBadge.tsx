"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { readRentalCart, subscribeToRentalCart } from "@/lib/rental/cart/local-cart";
import type { RentalCartLine } from "@/lib/rental/cart/types";

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    month: "short",
    day: "numeric",
  });
}

function cartLineCount(line: RentalCartLine) {
  return line.type === "rental" ? Math.max(1, Number(line.qty || 1)) : 1;
}

function CartLinePreview({ line }: { line: RentalCartLine }) {
  if (line.type === "sale") {
    return (
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{line.titleSnapshot}</div>
        <div className="text-xs text-slate-500">Requires admin confirmation</div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-slate-900">{line.titleSnapshot}</div>
      <div className="text-xs text-slate-500">
        {formatDate(line.startDate)} - {formatDate(line.endDate)} · Qty {line.qty}
      </div>
    </div>
  );
}

export function CartBadge() {
  const [lines, setLines] = useState<RentalCartLine[]>([]);

  useEffect(() => {
    function refresh() {
      setLines(readRentalCart().lines);
    }

    refresh();
    return subscribeToRentalCart(refresh);
  }, []);

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + cartLineCount(line), 0),
    [lines]
  );
  const recentLines = useMemo(
    () =>
      [...lines]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4),
    [lines]
  );
  const badgeText = itemCount > 99 ? "99+" : String(itemCount);

  return (
    <div className="group relative">
      <Link
        href="/rental/cart"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
        aria-label={itemCount > 0 ? `View cart with ${itemCount} items` : "View cart"}
      >
        <ShoppingCart className="h-5 w-5" />
        {itemCount > 0 && (
          <span className="absolute -right-2 -top-2 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
            {badgeText}
          </span>
        )}
      </Link>

      <div className="pointer-events-none absolute right-0 top-full z-30 hidden w-80 pt-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 md:block">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          {itemCount === 0 ? (
            <div>
              <div className="text-sm font-semibold text-slate-900">Your cart is empty</div>
              <Link
                href="/rental"
                className="mt-3 inline-flex text-sm font-medium text-slate-700 underline"
              >
                Browse equipment
              </Link>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">
                  {itemCount} {itemCount === 1 ? "item" : "items"} in cart
                </div>
                <Link href="/rental/cart" className="text-sm font-medium text-slate-700 underline">
                  View cart
                </Link>
              </div>

              <div className="mt-3 space-y-3">
                {recentLines.map((line) => (
                  <div key={line.id} className="flex gap-3">
                    <div className="h-10 w-12 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {line.imageUrlSnapshot ? (
                        <img
                          src={line.imageUrlSnapshot}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ShoppingCart className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <CartLinePreview line={line} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
