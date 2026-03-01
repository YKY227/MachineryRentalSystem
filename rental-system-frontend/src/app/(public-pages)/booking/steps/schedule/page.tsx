"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { StepLayout } from "@/components/wizard/StepLayout";
import { FormField } from "@/components/forms/FormField";
import { useBooking, type ScheduleInfo } from "@/lib/booking-store";

// Helper: return YYYY-MM-DD for <input type="date" />
const todayISO = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helpers for slot disabling
const isSameISODate = (a?: string, b?: string) => !!a && !!b && a === b;

const parseSlotEndMinutes = (slot: string) => {
  // e.g. "09:00 – 12:00" or "Anytime 09:00 – 17:30"
  const matches = slot.match(/(\d{2}):(\d{2})/g);
  if (!matches || matches.length === 0) return null;

  const last = matches[matches.length - 1]; // use the last time as end time
  const [hh, mm] = last.split(":").map(Number);
  return hh * 60 + mm;
};

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export default function ScheduleStep() {
  const router = useRouter();

  // ✅ Support BOTH new store (pickups[]) and legacy store (pickup)
  const booking = useBooking() as any;

  const serviceType = booking.serviceType as string | null;
  const routeType = booking.routeType as string | null;

  const pickups = (booking.pickups as any[] | undefined) ?? undefined; // new
  const pickup = (booking.pickup as any | null) ?? null; // legacy

  const deliveries = (booking.deliveries as any[] | undefined) ?? [];
  const items = (booking.items as any[] | undefined) ?? [];

  const schedule = (booking.schedule as ScheduleInfo | null) ?? null;
  const setSchedule = booking.setSchedule as (s: ScheduleInfo) => void;

  // ✅ Normalize pickup list
  const pickupList = useMemo(() => {
    if (Array.isArray(pickups) && pickups.length > 0) return pickups;
    return pickup ? [pickup] : [];
  }, [pickups, pickup]);

  // 🛡 Wizard guards
  useEffect(() => {
    if (!serviceType) return router.replace("/booking/steps/delivery-type");
    if (!routeType) return router.replace("/booking/steps/route-type");

    const hasPickup = pickupList.length > 0;
    if (!hasPickup) return router.replace("/booking/steps/pickup");

    if (!deliveries?.length) return router.replace("/booking/steps/deliveries");
    if (!items?.length) return router.replace("/booking/steps/items");
  }, [serviceType, routeType, pickupList.length, deliveries?.length, items?.length, router]);

  // Pickup window presets
  const slotOptions =
    serviceType === "express-3h"
      ? ["09:00 – 12:00", "10:00 – 13:00", "12:00 – 15:00", "14:00 – 17:00"]
      : ["09:00 – 12:00", "12:00 – 15:00", "15:00 – 18:00", "Anytime 09:00 – 17:30"];

  // Local state
  const [form, setForm] = useState<ScheduleInfo>(() => {
    return (
      schedule ?? {
        pickupDate: todayISO(),
        pickupSlot: slotOptions[0],
      }
    );
  });

  const isPickupToday = useMemo(
    () => isSameISODate(form.pickupDate, todayISO()),
    [form.pickupDate]
  );

  const disabledSlots = useMemo(() => {
    if (!isPickupToday) return new Set<string>();

    const n = nowMinutes();
    const disabled = new Set<string>();

    for (const slot of slotOptions) {
      const end = parseSlotEndMinutes(slot);
      if (end == null) continue;
      if (end <= n) disabled.add(slot);
    }

    return disabled;
  }, [isPickupToday, slotOptions]);

  // If current selection becomes disabled (e.g. user picked today), auto-pick first available
  useEffect(() => {
    if (!form.pickupSlot) return;
    if (!disabledSlots.has(form.pickupSlot)) return;

    const firstAvailable = slotOptions.find((s) => !disabledSlots.has(s));
    if (firstAvailable) {
      setForm((prev) => ({ ...prev, pickupSlot: firstAvailable }));
    }
  }, [disabledSlots, form.pickupSlot, slotOptions]);

  const handleSubmit = () => {
    if (!form.pickupDate || !form.pickupSlot) {
      alert("Please select a pickup date and time slot.");
      return;
    }
    setSchedule(form);
    router.push("/booking/steps/summary");
  };

  const serviceLabel =
    serviceType === "same-day"
      ? "Same Day Delivery"
      : serviceType === "next-day"
      ? "Next Day Delivery"
      : "3-Hour Express";

  // ✅ UI consistency helpers
  const inputBase =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 " +
    "shadow-sm outline-none transition " +
    "focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30";

  const hintText = "mt-1 text-sm text-slate-500";

  const slotBtnBase =
    "rounded-2xl border px-4 py-3 text-sm font-semibold text-left transition " +
    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2";

  const primaryBtn =
    "inline-flex items-center justify-center rounded-xl bg-sky-600 px-6 py-3 " +
    "text-base font-semibold text-white shadow-sm transition " +
    "hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2";

  const secondaryBtn =
    "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 " +
    "text-base font-semibold text-slate-700 transition hover:bg-slate-50 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2";

  return (
    <StepLayout
      title="Pickup Schedule"
      subtitle={`Choose when the courier should collect your items. (${serviceLabel})`}
      currentStep={6}
      totalSteps={8}
      backHref="/booking/steps/items"
    >
      <div className="space-y-8">
        {/* Date + Time */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pickup Date */}
          <FormField label="Pickup Date" required>
            <input
              type="date"
              min={todayISO()}
              value={form.pickupDate}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, pickupDate: e.target.value }))
              }
              className={inputBase}
            />
            <p className={hintText}>
              Production version will disable weekends &amp; enforce Sameday/Nextday rules.
            </p>
          </FormField>

          {/* Pickup Time */}
          <FormField label="Pickup Time Window" required>
            <div className="grid grid-cols-2 gap-3">
              {slotOptions.map((slot) => {
                const selected = form.pickupSlot === slot;
                const isDisabled = disabledSlots.has(slot);

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      setForm((prev) => ({ ...prev, pickupSlot: slot }));
                    }}
                    className={[
                      slotBtnBase,
                      isDisabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-80"
                        : selected
                        ? "border-sky-500 bg-sky-50 text-sky-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-sm",
                    ].join(" ")}
                    aria-disabled={isDisabled}
                    title={isDisabled ? "This time window has already passed." : undefined}
                  >
                    {slot}
                    {isDisabled && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        Passed
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className={hintText}>Express deliveries use tighter 3-hour windows.</p>
          </FormField>
        </div>

        {/* System Note */}
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
          <p>
            <span className="font-semibold">Note:</span> In the real system, slot
            availability is checked against driver capacity &amp; operations load.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => router.push("/booking/steps/items")}
            className={secondaryBtn}
          >
            ← Back to Items
          </button>

          <button type="button" onClick={handleSubmit} className={primaryBtn}>
            Continue to Review →
          </button>
        </div>
      </div>
    </StepLayout>
  );
}
