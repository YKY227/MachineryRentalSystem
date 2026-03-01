// src/app/(public-pages)/booking/steps/items/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { StepLayout } from "@/components/wizard/StepLayout";
import { FormField } from "@/components/forms/FormField";
import { useBooking, DeliveryItem, ItemCategory } from "@/lib/booking-store";
import { itemSchema } from "@/lib/validation/item";

type ItemFormValues = z.input<typeof itemSchema>;


let itemIdCounter = 1;
const nextItemId = () => `I-${itemIdCounter++}`;

type EditingState =
  | {
      deliveryId: string;
      itemId?: string;
    }
  | null;

const categoryOptions: { id: ItemCategory; label: string }[] = [
  { id: "document", label: "Document" },
  { id: "parcel", label: "Parcel" },
  { id: "fragile", label: "Fragile" },
  { id: "electronics", label: "Electronics" },
  { id: "food", label: "Food / Perishable" },
  { id: "liquid", label: "Liquid" },
  { id: "oversized", label: "Oversized" },
  { id: "other", label: "Other" },
];

function computeVolumetricWeight(
  lengthCm: number,
  widthCm: number,
  heightCm: number
) {
  if (!lengthCm || !widthCm || !heightCm) return 0;
  return Math.round(((lengthCm * widthCm * heightCm) / 5000) * 100) / 100;
}

function ItemModal({
  editing,
  existingItem,
  onClose,
  onSave,
}: {
  editing: { deliveryId: string; itemId?: string };
  existingItem: DeliveryItem | null;
  onClose: () => void;
  onSave: (item: DeliveryItem) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: existingItem
      ? {
          description: existingItem.description,
          category: existingItem.category,
          quantity: existingItem.quantity,
          weightKg: existingItem.weightKg,
          lengthCm: existingItem.lengthCm,
          widthCm: existingItem.widthCm,
          heightCm: existingItem.heightCm,
          remarks: existingItem.remarks ?? "",
          specialHandling: existingItem.specialHandling ?? false,
        }
      : {
          description: "",
          category: "parcel",
          quantity: 1,
          weightKg: 0,
          lengthCm: 0,
          widthCm: 0,
          heightCm: 0,
          remarks: "",
          specialHandling: false,
        },
    mode: "onTouched",
  });

  const length = watch("lengthCm") || 0;
  const width = watch("widthCm") || 0;
  const height = watch("heightCm") || 0;
  const volWeight = computeVolumetricWeight(length, width, height);

  const w = watch("weightKg") || 0;
  useEffect(() => {
    if (Number(w) > 0 || Number(volWeight) > 0) {
      clearErrors(["weightKg", "lengthCm", "widthCm", "heightCm"]);
    }
  }, [w, volWeight, clearErrors]);

  const inputBase =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 " +
    "shadow-sm outline-none transition " +
    "focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30";

  const smallBtn =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition " +
    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2";

  const onSubmit = (data: ItemFormValues) => {
    const submittedVolWeight = computeVolumetricWeight(
      Number(data.lengthCm || 0),
      Number(data.widthCm || 0),
      Number(data.heightCm || 0)
    );

    const actual = Number(data.weightKg || 0);
    const vol = Number(submittedVolWeight || 0);

    // ✅ Guard: don't allow BOTH actual and volumetric to be 0
    if (actual <= 0 && vol <= 0) {
      setError("weightKg", {
        type: "manual",
        message:
          "Enter a non-zero actual weight OR dimensions (for volumetric weight).",
      });
      setError("lengthCm", {
        type: "manual",
        message: "Provide dimensions or actual weight.",
      });
      return;
    }

    clearErrors(["weightKg", "lengthCm", "widthCm", "heightCm"]);

    const id = existingItem?.id ?? nextItemId();
    const updatedItem: DeliveryItem = {
      id,
      deliveryId: editing.deliveryId,
      description: data.description,
      category: data.category,
      quantity: Number(data.quantity),
      weightKg: Number(data.weightKg),
      lengthCm: Number(data.lengthCm),
      widthCm: Number(data.widthCm),
      heightCm: Number(data.heightCm),
      volumetricWeightKg: submittedVolWeight,
      remarks: data.remarks ?? "",
      specialHandling: data.specialHandling ?? false,
    };

    onSave(updatedItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {editing.itemId ? "Edit Item" : "Add Item"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              For delivery point{" "}
              <span className="font-mono font-semibold text-slate-800">
                {editing.deliveryId}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          <FormField
            label="Item Description"
            required
            error={errors.description?.message}
          >
            <input
              type="text"
              {...register("description")}
              className={inputBase}
              placeholder="e.g. Laptop box, A4 documents, sample products"
            />
          </FormField>

          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Category" error={errors.category?.message}>
              <select {...register("category")} className={inputBase}>
                {categoryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Quantity" error={errors.quantity?.message}>
              <input
                type="number"
                min={1}
                {...register("quantity", { valueAsNumber: true })}
                className={inputBase}
              />
            </FormField>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Actual Weight (kg)" error={errors.weightKg?.message}>
              <input
                type="number"
                min={0}
                step={0.1}
                {...register("weightKg", { valueAsNumber: true })}
                className={inputBase}
              />
            </FormField>

            <FormField
              label="Dimensions (cm)"
              error={
                (errors.lengthCm as any)?.message ||
                (errors.widthCm as any)?.message ||
                (errors.heightCm as any)?.message
              }
            >
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={0}
                  placeholder="L"
                  {...register("lengthCm", { valueAsNumber: true })}
                  className={inputBase + " px-3"}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="W"
                  {...register("widthCm", { valueAsNumber: true })}
                  className={inputBase + " px-3"}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="H"
                  {...register("heightCm", { valueAsNumber: true })}
                  className={inputBase + " px-3"}
                />
              </div>

              <p className="mt-1 text-xs text-slate-500">
                Volumetric weight (L × W × H ÷ 5000):{" "}
                <span className="font-semibold text-slate-900">{volWeight} kg</span>
              </p>
            </FormField>
          </div>

          <FormField label="Special Handling / Remarks" description="Optional">
            <textarea
              rows={2}
              {...register("remarks")}
              className={inputBase + " resize-none"}
              placeholder="e.g. Fragile – handle with care, do not stack, keep upright…"
            />

            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  {...register("specialHandling")}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-400/30"
                />
                <span>
                  <span className="font-semibold text-slate-900">
                    Special handling required
                  </span>{" "}
                  (e.g. temperature sensitive, fragile setup, on-site unpacking). This
                  may incur additional charges.
                </span>
              </label>
            </div>
          </FormField>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onClose}
              className={
                smallBtn +
                " border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={[
                smallBtn,
                "bg-sky-600 text-white hover:bg-sky-700",
                "disabled:cursor-not-allowed disabled:opacity-60",
              ].join(" ")}
            >
              Save Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ItemsStep() {
  const router = useRouter();

  // ✅ Support BOTH new store (pickups array) and old store (pickup single)
  const booking = useBooking() as any;

  const serviceType = booking.serviceType as string | null;
  const routeType = booking.routeType as string | null;

  const pickups = (booking.pickups as any[] | undefined) ?? []; // new flow
  const pickup = (booking.pickup as any | null) ?? null;        // legacy flow

  const deliveries = (booking.deliveries as any[] | undefined) ?? [];
  const items = (booking.items as DeliveryItem[] | undefined) ?? [];
  const setItems = booking.setItems as (items: DeliveryItem[]) => void;

  // ✅ Prevent redirect before client hydration finishes
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated) return;

    if (!serviceType) return router.replace("/booking/steps/delivery-type");
    if (!routeType) return router.replace("/booking/steps/route-type");

    const hasPickup = (Array.isArray(pickups) && pickups.length > 0) || !!pickup;
    if (!hasPickup) return router.replace("/booking/steps/pickup");

    if (!deliveries || deliveries.length === 0)
      return router.replace("/booking/steps/deliveries");
  }, [hydrated, serviceType, routeType, pickups?.length, pickup, deliveries?.length, router]);

  const [localItems, setLocalItems] = useState<DeliveryItem[]>(() => items);
  const [editing, setEditing] = useState<EditingState>(null);

  const itemsByDelivery = useMemo(() => {
    const map: Record<string, DeliveryItem[]> = {};
    for (const d of deliveries) map[d.id] = [];
    for (const item of localItems) {
      if (!map[item.deliveryId]) map[item.deliveryId] = [];
      map[item.deliveryId].push(item);
    }
    return map;
  }, [deliveries, localItems]);

  const handleRemoveItem = (itemId: string) => {
    setLocalItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleNext = () => {
    if (localItems.length === 0) {
      alert("Please add at least one item before continuing.");
      return;
    }
    setItems(localItems);
    router.push("/booking/steps/schedule");
  };

  return (
    <StepLayout
      title="Items per Delivery"
      subtitle="Tell us what you are sending to each delivery point."
      currentStep={5}
      totalSteps={8}
      backHref="/booking/steps/deliveries"
    >
      <div className="space-y-8">
        <div className="space-y-4">
          {deliveries.map((d, index) => {
            const itemsForDelivery = itemsByDelivery[d.id] ?? [];

            return (
              <div
                key={d.id}
                className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Delivery Point #{index + 1}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {d.addressLine1}
                      {d.addressLine2 ? `, ${d.addressLine2}` : ""} ({d.postalCode})
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Recipient:{" "}
                      <span className="font-semibold text-slate-800">
                        {d.contactName}
                      </span>{" "}
                      · {d.contactPhone}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditing({ deliveryId: d.id })}
                    className={[
                      "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3",
                      "text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700 hover:shadow-sm",
                      "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2",
                    ].join(" ")}
                  >
                    + Add Item
                  </button>
                </div>

                {itemsForDelivery.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No items added for this delivery yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {itemsForDelivery.map((item) => {
                      const billable =
                        item.volumetricWeightKg &&
                        item.volumetricWeightKg > item.weightKg
                          ? item.volumetricWeightKg
                          : item.weightKg;

                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="text-sm text-slate-700">
                            <p className="font-semibold text-slate-900">
                              {item.description || "(No description)"}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Category: {item.category} · Qty: {item.quantity}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Actual: {item.weightKg || 0} kg · Vol:{" "}
                              {item.volumetricWeightKg || 0} kg ·{" "}
                              <span className="font-semibold text-slate-800">
                                Billable: {billable || 0} kg
                              </span>
                            </p>

                            {item.specialHandling && (
                              <p className="mt-2 text-sm font-semibold text-amber-700">
                                ⚠ Special handling required
                              </p>
                            )}

                            {item.remarks && (
                              <p className="mt-1 text-sm text-slate-600">
                                Remarks: {item.remarks}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                            <button
                              type="button"
                              onClick={() =>
                                setEditing({
                                  deliveryId: item.deliveryId,
                                  itemId: item.id,
                                })
                              }
                              className="text-sm font-semibold text-sky-700 hover:text-sky-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-sm font-semibold text-rose-700 hover:text-rose-800"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleNext}
            className={[
              "inline-flex items-center justify-center rounded-xl bg-sky-600 px-6 py-3",
              "text-base font-semibold text-white shadow-sm transition",
              "hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2",
            ].join(" ")}
          >
            Continue to Schedule →
          </button>
        </div>
      </div>

      {editing && (
        <ItemModal
          editing={editing}
          existingItem={
            editing.itemId
              ? localItems.find((i) => i.id === editing.itemId) ?? null
              : null
          }
          onClose={() => setEditing(null)}
          onSave={(updatedItem) => {
            setLocalItems((prev) => {
              const exists = prev.some((i) => i.id === updatedItem.id);
              if (exists)
                return prev.map((i) =>
                  i.id === updatedItem.id ? updatedItem : i
                );
              return [...prev, updatedItem];
            });
          }}
        />
      )}
    </StepLayout>
  );
}
