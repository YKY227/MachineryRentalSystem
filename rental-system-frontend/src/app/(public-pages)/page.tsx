"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Gauge,
  PackageSearch,
  ShieldCheck,
  Truck,
  UserCircle2,
  Wrench,
} from "lucide-react";

import type { RentalCustomer } from "@/lib/rental/orders/types";

type PublicAuthState = {
  adminAuthenticated: boolean;
  customer: RentalCustomer | null;
};

const featureCards = [
  {
    icon: PackageSearch,
    title: "Browse catalog",
    description: "View equipment specs, pricing tiers, and published inventory.",
  },
  {
    icon: CalendarDays,
    title: "Choose dates",
    description: "Select your rental window and see server-backed availability guidance.",
  },
  {
    icon: Truck,
    title: "Plan fulfillment",
    description: "Choose delivery and collection or self-collection to match the job site.",
  },
] as const;

const trustHighlights = [
  {
    title: "Availability-first flow",
    detail: "Server-backed availability, downtime, and operational scheduling stay aligned before checkout.",
  },
  {
    title: "Clear commercial trail",
    detail: "Customer portal, invoicing, payments, deposits, and extensions connect through one DB-backed workflow.",
  },
  {
    title: "Operations visibility",
    detail: "Public browsing stays simple while admin operations, calendar, and account review remain separate.",
  },
] as const;

export default function LandingPage() {
  const [authState, setAuthState] = useState<PublicAuthState>({
    adminAuthenticated: false,
    customer: null,
  });
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch("/api/public/rental/auth/me", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load auth state");
        setAuthState({
          adminAuthenticated: Boolean(data?.adminAuthenticated),
          customer: (data?.customer ?? null) as RentalCustomer | null,
        });
      })
      .catch(() => {
        if (!active) return;
        setAuthState({ adminAuthenticated: false, customer: null });
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const landingMode = useMemo(() => {
    if (authState.adminAuthenticated) return "admin";
    if (authState.customer) return "customer";
    return "guest";
  }, [authState.adminAuthenticated, authState.customer]);

  const greetingName =
    authState.customer?.contactName?.trim() || authState.customer?.companyName?.trim() || "there";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(210,67,56,0.12),_transparent_34%),linear-gradient(180deg,#fffdfc_0%,#f8fafc_55%,#f4f6f8_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur">
            <Wrench className="h-4 w-4 text-[#D24338]" />
            Machinery rental portal
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/rental"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Browse equipment
            </Link>
            {landingMode === "guest" ? (
              <>
                <Link
                  href="/rental/account/login?next=%2Frental%2Faccount"
                  className="rounded-xl bg-[#D24338] px-4 py-2 font-semibold text-white hover:bg-[#B9382E]"
                >
                  Customer login
                </Link>
                <Link
                  href="/admin/login"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-600 hover:bg-slate-50"
                >
                  Admin login
                </Link>
              </>
            ) : landingMode === "customer" ? (
              <Link
                href="/rental/account"
                className="rounded-xl bg-[#D24338] px-4 py-2 font-semibold text-white hover:bg-[#B9382E]"
              >
                Go to Customer Portal
              </Link>
            ) : (
              <Link
                href="/admin"
                className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800"
              >
                Go to Admin Dashboard
              </Link>
            )}
          </div>
        </div>

        <section className="grid gap-8 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#B9382E]">
              <ShieldCheck className="h-4 w-4" />
              DB-backed rental operations
            </div>

            <div className="mt-6 text-sm font-semibold uppercase tracking-[0.24em] text-[#D24338]">
              Teesin Machinery Pte Ltd
            </div>

            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-[#2A2A2A] md:text-6xl">
              Rent equipment with clearer pricing, cleaner scheduling, and faster follow-through.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Browse published machinery, choose dates, and move into a server-backed checkout flow with
              availability, buffers, downtime, invoicing, and customer account tracking already connected.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/rental"
                className="inline-flex items-center rounded-2xl bg-[#D24338] px-6 py-3 text-base font-semibold text-white hover:bg-[#B9382E]"
              >
                Browse rental items
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              {landingMode === "customer" && (
                <Link
                  href="/rental/account"
                  className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Customer portal
                </Link>
              )}
              {landingMode === "admin" && (
                <Link
                  href="/admin"
                  className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Admin area
                </Link>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">Day / week / month rentals</span>
              <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">Delivery or self-collect</span>
              <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">Availability checked server-side</span>
              <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">Customer portal + admin ops</span>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white/92 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#B9382E]">
              <Gauge className="h-4 w-4" />
              Trusted operations view
            </div>

            <div className="mt-5">
              <div className="text-xl font-semibold text-[#2A2A2A]">Teesin Machinery Pte Ltd</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                A public-first rental experience supported by disciplined operational controls, clear commercial records,
                and account-aware follow-through once customers sign in.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              {trustHighlights.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-[#2A2A2A]">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-[#F2C7C2] bg-[#FCE9E7] p-4">
              {authLoading ? (
                <div className="text-sm text-slate-600">Checking your session...</div>
              ) : landingMode === "guest" ? (
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2A2A2A]">
                    <UserCircle2 className="h-4 w-4 text-[#D24338]" />
                    Public browsing mode
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    Browse equipment first, then sign in from the header when you are ready to continue as a customer or admin.
                  </div>
                </div>
              ) : landingMode === "customer" ? (
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2A2A2A]">
                    <UserCircle2 className="h-4 w-4 text-[#D24338]" />
                    Signed in customer
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    Hi, {greetingName}. {authState.customer?.companyName ? `${authState.customer.companyName} is connected.` : "Your customer account is connected."} Continue from the header when you need your portal.
                  </div>
                </div>
              ) : (
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2A2A2A]">
                    <ShieldCheck className="h-4 w-4 text-[#D24338]" />
                    Signed in admin
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    Admin access is active. Public equipment browsing remains available here, while checkout stays restricted to customer accounts.
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="py-6">
          <div className="grid gap-4 md:grid-cols-3">
            {featureCards.map((card) => (
              <div key={card.title} className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm">
                <div className="inline-flex rounded-2xl bg-[#FCE9E7] p-3 text-[#D24338]">
                  <card.icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-[#2A2A2A]">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
