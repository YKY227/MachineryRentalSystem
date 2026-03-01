"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { StepLayout } from "@/components/wizard/StepLayout";
import { FormField } from "@/components/forms/FormField";
import { useBooking, DeliveryPoint } from "@/lib/booking-store";
import {
  deliveriesSchema,
  DeliveriesFormSchema,
} from "@/lib/validation/deliveries";

export default function DeliveriesStep() {
  const router = useRouter();

  // Support BOTH new store (pickups array) and old store (pickup single)
  const booking = useBooking() as any;

  const serviceType = booking.serviceType as string | null;
  const routeType = booking.routeType as string | null;

  const pickups = (booking.pickups as any[] | undefined) ?? undefined; // new
  const pickup = (booking.pickup as any | null) ?? null; // legacy

  const deliveries = (booking.deliveries as DeliveryPoint[] | undefined) ?? [];
  const setDeliveries = booking.setDeliveries as (ds: DeliveryPoint[]) => void;

  // Used for smooth scroll to newest card
  const lastCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!serviceType) return router.replace("/booking/steps/delivery-type");
    if (!routeType) return router.replace("/booking/steps/route-type");

    // ✅ Allow either:
    // - new flow (pickups array exists & has at least 1)
    // - old flow (pickup single exists)
    const hasPickup = (Array.isArray(pickups) && pickups.length > 0) || !!pickup;
    if (!hasPickup) return router.replace("/booking/steps/pickup");
  }, [serviceType, routeType, pickups, pickup, router]);

  // ─────────────────────────────────────────────
  // Route rules for Delivery Points
  // ─────────────────────────────────────────────
  const restrictToSingleDelivery =
    routeType === "many-to-one" || routeType === "one-to-one";

  const maxDeliveries = restrictToSingleDelivery ? 1 : 5;

  // ✅ Performance: memoize defaultValues
  // ✅ Enforce restriction in initial values (avoid rendering >1 card)
  const defaultValues = useMemo<DeliveriesFormSchema>(() => {
    const saved =
      deliveries && deliveries.length > 0
        ? deliveries.map((d) => ({
            contactName: d.contactName ?? "",
            contactPhone: d.contactPhone ?? "",
            contactEmail: d.contactEmail ?? "",
            addressLine1: d.addressLine1 ?? "",
            addressLine2: d.addressLine2 ?? "",
            postalCode: d.postalCode ?? "",
            remarks: d.remarks ?? "",
            saveAsFavorite: d.saveAsFavorite ?? true,
          }))
        : [
            {
              contactName: "",
              contactPhone: "",
              contactEmail: "",
              addressLine1: "",
              addressLine2: "",
              postalCode: "",
              remarks: "",
              saveAsFavorite: true,
            },
          ];

    return {
      deliveries: restrictToSingleDelivery
        ? saved.slice(0, 1)
        : saved.slice(0, 5),
    };
  }, [deliveries, restrictToSingleDelivery]);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DeliveriesFormSchema>({
    resolver: zodResolver(deliveriesSchema),
    defaultValues,
    mode: "onTouched",
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "deliveries",
  });

  // If route changes to a restricted one and we already have >1 delivery,
  // auto-trim extras so UI stays consistent.
  useEffect(() => {
    if (!restrictToSingleDelivery) return;
    if (fields.length <= 1) return;

    for (let i = fields.length - 1; i >= 1; i--) {
      remove(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictToSingleDelivery]);

  // ✅ Small helper for route label used in the summary strip
  const routeLabel = useMemo(() => {
    switch (routeType) {
      case "one-to-many":
        return "One pickup → Many deliveries";
      case "many-to-one":
        return "Many pickups → One delivery";
      case "one-to-one":
        return "One pickup → One delivery";
      case "round-trip":
        return "Round trip / sequence";
      default:
        return "—";
    }
  }, [routeType]);

  // ✅ Smooth scroll after append
  const onAddDelivery = () => {
    if (restrictToSingleDelivery) return;
    if (fields.length >= maxDeliveries) return;

    append({
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      addressLine1: "",
      addressLine2: "",
      postalCode: "",
      remarks: "",
      saveAsFavorite: true,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        lastCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  };

  const onSubmit = (data: DeliveriesFormSchema) => {
    const trimmed = data.deliveries.slice(0, maxDeliveries);

    const mapped: DeliveryPoint[] = trimmed.map((d, index) => {
      const existing = deliveries[index];
      return {
        id: existing?.id ?? `D-${Date.now()}-${index}`,
        contactName: d.contactName,
        contactPhone: d.contactPhone,
        contactEmail: d.contactEmail || "",
        addressLine1: d.addressLine1,
        addressLine2: d.addressLine2 || "",
        postalCode: d.postalCode,
        remarks: d.remarks || "",
        saveAsFavorite: d.saveAsFavorite,
      };
    });

    setDeliveries(mapped);
    router.push("/booking/steps/items");
  };

  const inputBase =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 " +
    "shadow-sm outline-none transition " +
    "focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30";

  const canAddMore = !restrictToSingleDelivery && fields.length < maxDeliveries;

  return (
    <StepLayout
      title="Delivery Points"
      subtitle="Specify the delivery locations."
      currentStep={4}
      totalSteps={8}
      backHref="/booking/steps/pickup"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Summary strip */}
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                Total delivery points:
              </span>{" "}
              {fields.length}
              {restrictToSingleDelivery && (
                <span className="ml-2 text-slate-500">
                  (This route allows 1 delivery only)
                </span>
              )}
            </div>
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Route:</span>{" "}
              {routeLabel}
            </div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {restrictToSingleDelivery
              ? "This route type requires exactly one delivery point."
              : "Add or remove delivery points (max 5). We’ll optimize the stop sequence later if needed."}
          </p>
        </div>

        {/* Top-level array error */}
        {errors.deliveries && !Array.isArray(errors.deliveries) && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errors.deliveries.message as string}
          </div>
        )}

        {/* Cards */}
        <div className="space-y-6">
          {fields.map((field, index) => {
            const fieldErrors = errors.deliveries?.[index];
            const canRemove = !restrictToSingleDelivery && fields.length > 1;
            const isLast = index === fields.length - 1;

            return (
              <div
                key={field.id}
                ref={isLast ? lastCardRef : undefined}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Delivery Point #{index + 1}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Recipient contact and delivery address.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={!canRemove}
                    className={[
                      "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition",
                      canRemove
                        ? "border border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400",
                    ].join(" ")}
                    title={
                      restrictToSingleDelivery
                        ? "This route requires exactly one delivery point."
                        : undefined
                    }
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-6 space-y-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    <FormField
                      label="Recipient Name"
                      required
                      error={fieldErrors?.contactName?.message}
                    >
                      <input
                        {...register(`deliveries.${index}.contactName`)}
                        className={inputBase}
                        placeholder="e.g. Ms Lim"
                        autoComplete="name"
                      />
                    </FormField>

                    <FormField
                      label="Recipient Phone"
                      required
                      error={fieldErrors?.contactPhone?.message}
                    >
                      <input
                        {...register(`deliveries.${index}.contactPhone`)}
                        className={inputBase}
                        placeholder="e.g. 8123 4567"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </FormField>

                    <FormField
                      label="Recipient Email"
                      required
                      error={fieldErrors?.contactEmail?.message}
                    >
                      <input
                        {...register(`deliveries.${index}.contactEmail`)}
                        className={inputBase}
                        placeholder="e.g. lim@company.com"
                        inputMode="email"
                        autoComplete="email"
                      />
                    </FormField>
                  </div>

                  <FormField
                    label="Delivery Address Line 1"
                    required
                    error={fieldErrors?.addressLine1?.message}
                  >
                    <input
                      {...register(`deliveries.${index}.addressLine1`)}
                      className={inputBase}
                      placeholder="e.g. 1 Fusionopolis Way, Lobby B"
                      autoComplete="street-address"
                    />
                  </FormField>

                  <div className="grid gap-5 md:grid-cols-2">
                    <FormField label="Address Line 2" description="Optional">
                      <input
                        {...register(`deliveries.${index}.addressLine2`)}
                        className={inputBase}
                        placeholder="e.g. #05-12"
                      />
                    </FormField>

                    <FormField
                      label="Postal Code"
                      required
                      error={fieldErrors?.postalCode?.message}
                    >
                      <input
                        {...register(`deliveries.${index}.postalCode`)}
                        className={inputBase}
                        placeholder="e.g. 138632"
                        inputMode="numeric"
                        autoComplete="postal-code"
                      />
                    </FormField>
                  </div>

                  <FormField
                    label="Delivery Instructions / Remarks"
                    description="Optional"
                  >
                    <textarea
                      {...register(`deliveries.${index}.remarks`)}
                      rows={3}
                      className={inputBase + " resize-none"}
                      placeholder="e.g. Leave with reception / call on arrival"
                    />
                  </FormField>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        {...register(`deliveries.${index}.saveAsFavorite`)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-400/30"
                      />
                      Save this as a favorite delivery address
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add & Continue (bottom-left + bottom-right) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Add another delivery point */}
          <div>
            {!restrictToSingleDelivery ? (
              <>
                <button
                  type="button"
                  onClick={onAddDelivery}
                  disabled={!canAddMore}
                  className={[
                    "inline-flex items-center justify-center rounded-2xl border border-dashed border-slate-300",
                    "bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition",
                    "hover:border-sky-400 hover:text-sky-700 hover:shadow-sm",
                    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
                  ].join(" ")}
                >
                  + Add another delivery point
                </button>

                {fields.length >= maxDeliveries && (
                  <p className="mt-2 text-sm text-slate-500">
                    Maximum {maxDeliveries} delivery points reached.
                  </p>
                )}
              </>
            ) : (
              <div />
            )}
          </div>

          {/* Right: Continue */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={[
              "inline-flex items-center justify-center rounded-xl bg-sky-600 px-6 py-3",
              "text-base font-semibold text-white shadow-sm transition",
              "hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-60",
            ].join(" ")}
          >
            Continue to Items →
          </button>
        </div>
      </form>
    </StepLayout>
  );
}
