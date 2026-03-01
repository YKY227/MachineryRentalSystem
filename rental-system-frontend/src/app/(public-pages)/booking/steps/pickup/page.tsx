"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { StepLayout } from "@/components/wizard/StepLayout";
import { FormField } from "@/components/forms/FormField";
import { useBooking, createEmptyPickup } from "@/lib/booking-store";
import { pickupSchema, PickupSchema } from "@/lib/validation/pickup";

type PickupFormSchema = {
  pickups: PickupSchema[];
};

export default function PickupStep() {
  const router = useRouter();

  // Keep flexible so you can add `pickups` / `setPickups` to the store without breaking this page.
  const booking = useBooking() as any;

  const serviceType = (booking.serviceType as string | null) ?? null;
  const routeType = (booking.routeType as string | null) ?? null;

  // Backward compatibility: if you still only store a single pickup in the store.
  const pickup = (booking.pickup as PickupSchema | null) ?? null;
  const setPickup = booking.setPickup as ((p: any) => void) | undefined;

  // Optional (recommended): store array of pickups for many-to-one
  const pickupsInStore = (booking.pickups as PickupSchema[] | undefined) ?? undefined;
  const setPickups = (booking.setPickups as ((ps: any[]) => void) | undefined) ?? undefined;

  // Used for smooth scroll to newest card
  const lastCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!serviceType) return router.replace("/booking/steps/delivery-type");
    if (!routeType) return router.replace("/booking/steps/route-type");
  }, [serviceType, routeType, router]);

  // ─────────────────────────────────────────────
  // Route rules for Pickup Points
  // ─────────────────────────────────────────────
  const allowMultiplePickups = routeType === "many-to-one";
  const maxPickups = allowMultiplePickups ? 5 : 1;

  // ✅ Route label for summary strip
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

  // ✅ Validation schema that adapts by routeType
  const formSchema = useMemo(() => {
    return z.object({
      pickups: z
        .array(pickupSchema)
        .min(1, "Please add at least 1 pickup point.")
        .max(maxPickups, `Maximum ${maxPickups} pickup point(s).`),
    });
  }, [maxPickups]);

  // Choose saved pickups:
  // - Prefer store array `pickups` if present
  // - Fallback to legacy single `pickup`
  const savedPickups: PickupSchema[] = useMemo(() => {
    if (pickupsInStore && pickupsInStore.length > 0) return pickupsInStore;
    if (pickup) return [pickup];
    return [];
  }, [pickupsInStore, pickup]);

  // ✅ Performance: memoize defaultValues + enforce route restriction on initial render
  const defaultValues = useMemo<PickupFormSchema>(() => {
    const saved =
      savedPickups.length > 0
        ? savedPickups.map((p) => ({
            ...createEmptyPickup(),
            ...p,
          }))
        : [createEmptyPickup()];

    return {
      pickups: allowMultiplePickups ? saved.slice(0, maxPickups) : saved.slice(0, 1),
    };
  }, [savedPickups, allowMultiplePickups, maxPickups]);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PickupFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: "onTouched",
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "pickups",
  });

  // If route changes to a restricted one and we already have >1 pickup,
  // auto-trim extras so UI stays consistent.
  useEffect(() => {
    if (allowMultiplePickups) return;
    if (fields.length <= 1) return;

    for (let i = fields.length - 1; i >= 1; i--) {
      remove(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowMultiplePickups]);

  const inputBase =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 " +
    "shadow-sm outline-none transition " +
    "focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30";

  const onAddPickup = () => {
    if (!allowMultiplePickups) return;
    if (fields.length >= maxPickups) return;

    append(createEmptyPickup());

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        lastCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  };

  const onSubmit = (data: PickupFormSchema) => {
    const trimmed = data.pickups.slice(0, maxPickups);

    const mapped = trimmed.map((p, index) => ({
      ...createEmptyPickup(),
      ...p,
      id: (p as any).id ?? `P-${Date.now()}-${index}`,
    }));

    // ✅ Store array (for many-to-one)
    if (setPickups) setPickups(mapped);

    // ✅ Backward compatibility: keep single pickup for existing flow/guards
    if (setPickup) setPickup(mapped[0]);

    router.push("/booking/steps/deliveries");
  };

  const topArrayError =
    errors.pickups && !Array.isArray(errors.pickups)
      ? (errors.pickups.message as string)
      : null;

  const canAddMore = allowMultiplePickups && fields.length < maxPickups;

  return (
    <StepLayout
      title="Pickup Details"
      subtitle={
        allowMultiplePickups
          ? "Enter all pickup locations (max 5)."
          : "Enter the collection location for your delivery."
      }
      currentStep={3}
      totalSteps={8}
      backHref="/booking/steps/route-type"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* ✅ Summary strip */}
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                Total pickup points:
              </span>{" "}
              {fields.length}
              {!allowMultiplePickups && (
                <span className="ml-2 text-slate-500">
                  (This route allows 1 pickup only)
                </span>
              )}
            </div>
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Route:</span>{" "}
              {routeLabel}
            </div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {allowMultiplePickups
              ? `Add up to ${maxPickups} pickup points. We’ll optimize the stop sequence later if needed.`
              : "This route type allows only one pickup point."}
          </p>
        </div>

        {/* Top-level error */}
        {topArrayError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {topArrayError}
          </div>
        )}

        {/* Cards */}
        <div className="space-y-6">
          {fields.map((field, index) => {
            const fieldErrors = (errors.pickups as any)?.[index];
            const canRemove = allowMultiplePickups && fields.length > 1;
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
                      Pickup Point #{index + 1}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Contact person and pickup address.
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
                      !canRemove ? "This route requires at least one pickup point." : undefined
                    }
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-6 space-y-6">
                  {/* Contact */}
                  <div className="grid gap-5 md:grid-cols-2">
                    <FormField
                      label="Contact Name"
                      required
                      error={fieldErrors?.contactName?.message}
                    >
                      <input
                        {...register(`pickups.${index}.contactName` as const)}
                        className={inputBase}
                        placeholder="e.g. Alex Tan"
                        autoComplete="name"
                      />
                    </FormField>

                    <FormField
                      label="Contact Phone"
                      required
                      error={fieldErrors?.contactPhone?.message}
                    >
                      <input
                        {...register(`pickups.${index}.contactPhone` as const)}
                        className={inputBase}
                        placeholder="e.g. 9123 4567"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </FormField>

                    {/* Safer: treat email as optional unless your pickupSchema requires it */}
                    <FormField
                      label="Email"
                      description="Optional"
                      error={fieldErrors?.contactEmail?.message}
                    >
                      <input
                        {...register(`pickups.${index}.contactEmail` as const)}
                        className={inputBase}
                        placeholder="e.g. alex@company.com"
                        inputMode="email"
                        autoComplete="email"
                      />
                    </FormField>
                  </div>

                  {/* Address */}
                  <FormField
                    label="Address Line 1"
                    required
                    error={fieldErrors?.addressLine1?.message}
                  >
                    <input
                      {...register(`pickups.${index}.addressLine1` as const)}
                      className={inputBase}
                      placeholder="e.g. 10 Ubi Crescent, Lobby A"
                      autoComplete="street-address"
                    />
                  </FormField>

                  <div className="grid gap-5 md:grid-cols-2">
                    <FormField
                      label="Address Line 2"
                      description="Optional"
                      error={fieldErrors?.addressLine2?.message}
                    >
                      <input
                        {...register(`pickups.${index}.addressLine2` as const)}
                        className={inputBase}
                        placeholder="e.g. #12-34"
                      />
                    </FormField>

                    <FormField
                      label="Postal Code"
                      required
                      error={fieldErrors?.postalCode?.message}
                    >
                      <input
                        {...register(`pickups.${index}.postalCode` as const)}
                        className={inputBase}
                        placeholder="e.g. 408538"
                        inputMode="numeric"
                        autoComplete="postal-code"
                      />
                    </FormField>
                  </div>

                  <FormField
                    label="Remarks"
                    description="Optional"
                    error={fieldErrors?.remarks?.message}
                  >
                    <textarea
                      {...register(`pickups.${index}.remarks` as const)}
                      rows={3}
                      className={inputBase + " resize-none"}
                      placeholder="e.g. Security clearance required / call on arrival"
                    />
                  </FormField>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        {...register(`pickups.${index}.saveAsFavorite` as const)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-400/30"
                      />
                      Save this as a favorite location
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add & Continue */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {allowMultiplePickups ? (
            <button
              type="button"
              onClick={onAddPickup}
              disabled={!canAddMore}
              className={[
                "inline-flex items-center justify-center rounded-2xl border border-dashed border-slate-300",
                "bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition",
                "hover:border-sky-400 hover:text-sky-700 hover:shadow-sm",
                "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2",
                "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
              ].join(" ")}
            >
              + Add another pickup point
            </button>
          ) : (
            <div />
          )}

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
            Continue →
          </button>
        </div>
      </form>
    </StepLayout>
  );
}
