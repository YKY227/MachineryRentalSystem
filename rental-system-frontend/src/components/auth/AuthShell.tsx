"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";

type AuthShellPanelItem = {
  icon: LucideIcon;
  title: string;
  detail: string;
};

type AuthShellProps = {
  badgeIcon: LucideIcon;
  badgeLabel: string;
  title: string;
  description: string;
  brandLine?: string;
  panelTitle: string;
  panelDescription: string;
  panelItems: AuthShellPanelItem[];
  children: ReactNode;
  variant?: "customer" | "admin";
};

export function AuthShell({
  badgeIcon: BadgeIcon,
  badgeLabel,
  title,
  description,
  brandLine = "Teesin Machinery Pte Ltd",
  panelTitle,
  panelDescription,
  panelItems,
  children,
  variant = "customer",
}: AuthShellProps) {
  const customerVariant = variant === "customer";

  return (
    <div
      className={[
        "min-h-screen px-4 py-6",
        customerVariant
          ? "bg-[radial-gradient(circle_at_top_left,_rgba(210,67,56,0.10),_transparent_34%),linear-gradient(180deg,#fffdfc_0%,#f8fafc_58%,#f4f6f8_100%)]"
          : "bg-[radial-gradient(circle_at_top_left,_rgba(42,42,42,0.08),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]",
      ].join(" ")}
    >
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to landing page
        </Link>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <section className="rounded-[28px] border border-slate-200 bg-white/92 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
            <div
              className={[
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                customerVariant
                  ? "border border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E]"
                  : "border border-slate-200 bg-slate-100 text-slate-700",
              ].join(" ")}
            >
              <BadgeIcon className="h-4 w-4" />
              {badgeLabel}
            </div>

            <div
              className={[
                "mt-6 text-sm font-semibold uppercase tracking-[0.24em]",
                customerVariant ? "text-[#D24338]" : "text-slate-600",
              ].join(" ")}
            >
              {brandLine}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#2A2A2A] md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{description}</p>

            <div className="mt-8 grid gap-3">
              {panelItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={[
                          "rounded-xl p-2",
                          customerVariant ? "bg-[#FCE9E7] text-[#D24338]" : "bg-white text-slate-700",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#2A2A2A]">{item.title}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] md:p-8">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-[#2A2A2A]">{panelTitle}</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">{panelDescription}</div>
            </div>

            <div className="mt-6">{children}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
