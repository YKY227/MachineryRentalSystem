"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function BookingEntryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="text-3xl font-bold text-slate-900 text-center">
          Book a Courier Delivery
        </h1>
        <p className="mt-3 text-center text-slate-600">
          Tell us what type of delivery you need. You’ll proceed through our step-by-step
          booking wizard.
        </p>

        <div className="mt-12 space-y-5">
          {/* 1. Same Day */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Same Day Delivery</h2>
            <p className="text-sm text-slate-600 mt-1">
              Pickup and delivery within the same day (8am–5:30pm).
            </p>
            <Link
              href="/booking/steps/delivery-type"
              className="mt-4 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-white text-sm font-medium hover:bg-sky-700"
            >
              Start — Same Day <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>

          {/* 2. Next Day */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Next Day Delivery</h2>
            <p className="text-sm text-slate-600 mt-1">
              Pickup today, deliver next business day.
            </p>
            <Link
              href="/booking/steps/delivery-type"
              className="mt-4 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-white text-sm font-medium hover:bg-sky-700"
            >
              Start — Next Day <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>

          {/* 3. 3-hour Express */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">3-Hour Express</h2>
            <p className="text-sm text-slate-600 mt-1">
              Rapid collection & drop-off within 3 hours.
            </p>
            <Link
              href="/booking/steps/delivery-type"
              className="mt-4 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-white text-sm font-medium hover:bg-sky-700"
            >
              Start — Express <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>

        <p className="mt-12 text-center text-xs text-slate-400">
          You will be guided through 8 steps to complete your courier booking.
        </p>
      </div>
    </div>
  );
}
