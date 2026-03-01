// src/app/(public-pages)/page.tsx
"use client";

import Link from "next/link";
import { ArrowRight, Wrench, PackageSearch, CalendarDays, Truck } from "lucide-react";
import LoginRoleChooser from "@/components/public/LoginRoleChooser";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      {/* TOP RIGHT LOGIN (admin only) */}
      <div className="mx-auto flex max-w-5xl justify-end px-6 py-4">
        <LoginRoleChooser />
      </div>

      {/* HERO */}
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          <Wrench className="h-4 w-4" />
          Equipment / Machinery Rental
        </div>

        <h1 className="mt-5 text-4xl font-bold text-slate-900 md:text-5xl">
          Rent equipment easily — with clear pricing and flexible delivery
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Browse a curated rental catalog, pick your dates, and choose delivery or self-collection.
          Pricing is calculated automatically so you know exactly what you’re paying.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/rental"
            className="inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-6 py-3 text-lg font-semibold text-white hover:bg-amber-700 sm:w-auto"
          >
            Browse rental items
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>

         
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Day / week / month rentals
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Delivery + collection options
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Self-collect available
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Transparent price breakdown
          </span>
        </div>
      </section>

      {/* PRIMARY SERVICE (Rental only) */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-center text-2xl font-semibold text-slate-900">
          Equipment rental made simple
        </h2>

        <div className="mt-8 grid gap-6 md:grid-cols-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  <Wrench className="h-4 w-4" />
                  Equipment / Machinery Rental
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">
                  Rent equipment by day, week, or month
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Choose an item, set dates, select delivery or self-collection — pricing is calculated automatically.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <PackageSearch className="h-4 w-4" />
                  Browse catalog
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  View pictures, specs, and rates.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CalendarDays className="h-4 w-4" />
                  Pick dates
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Set rental start & end date.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Truck className="h-4 w-4" />
                  Delivery / self-collect
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  We can deliver and collect — or you self-collect.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Best for: construction projects, events, site works, maintenance
              </div>
              <Link
                href="/rental"
                className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Browse rental items
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (Rental only) */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-center text-2xl font-semibold text-slate-900">
          How it works
        </h2>

        <div className="mt-8 grid gap-6 md:grid-cols-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-900">Equipment Rental</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                { step: "1", title: "Select equipment", desc: "Choose item type, quantity, and view specs." },
                { step: "2", title: "Choose dates", desc: "Set start/end dates (day/week/month rentals)." },
                { step: "3", title: "Delivery or self-collect", desc: "Pick the most convenient option." },
                { step: "4", title: "Confirm & pay", desc: "Review price breakdown and confirm booking." },
              ].map((s) => (
                <div key={s.step} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
                      {s.step}
                    </div>
                    <div className="font-semibold text-slate-900">{s.title}</div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <Link
                href="/rental"
                className="inline-flex items-center rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Start rental booking
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FOOTER (Rental only) */}
      <footer className="bg-slate-900 py-10 text-center">
        <h3 className="text-xl font-semibold text-white">Ready to rent?</h3>
        <p className="mt-2 text-sm text-slate-300">
          Browse equipment, choose dates, and confirm your rental in minutes.
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/rental"
            className="inline-flex items-center rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 hover:bg-slate-100"
          >
            Browse rental items
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>

          <Link
            href="/admin/login"
            className="inline-flex items-center rounded-xl border border-slate-600 bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800"
          >
            Admin login
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
