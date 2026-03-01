// src/app/(public-pages)/booking/steps/delivery-type.tsx
"use client";

import { useRouter } from "next/navigation";
import { StepLayout } from "@/components/wizard/StepLayout";
import { useBooking, ServiceType } from "@/lib/booking-store";

const serviceOptions: {
  id: ServiceType;
  label: string;
  badge: string;
  description: string;
  details: string;
}[] = [
  {
    id: "same-day",
    label: "Same Day Delivery",
    badge: "09:00 – 17:30",
    description: "Pickup and delivery on the same day within office hours.",
    details: "Best for standard, non-urgent deliveries within the same day.",
  },
  {
    id: "next-day",
    label: "Next Day Delivery",
    badge: "Next working day",
    description: "Pickup today, delivery by the next working day.",
    details: "Ideal for planned shipments with more flexible timelines.",
  },
  {
    id: "express-3h",
    label: "3-Hour Express",
    badge: "Within 3 hours",
    description:
      "Pickup and delivery completed within a 3-hour window on the same day.",
    details:
      "Perfect for urgent or time-critical documents and parcels.",
  },
];

export default function DeliveryTypeStep() {
  const router = useRouter();
  const { serviceType, setServiceType } = useBooking();

  const handleSelect = (id: ServiceType) => {
    setServiceType(id);
    router.push("/booking/steps/route-type");
  };

  return (
    <StepLayout
      title="Choose Delivery Type"
      subtitle="Select how fast you want the delivery to be completed."
      currentStep={1}
      totalSteps={8}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {serviceOptions.map((option) => {
          const isSelected = serviceType === option.id;
          return (
           <button
  key={option.id ?? "none"}
  type="button"
  onClick={() => handleSelect(option.id)}
  className={[
    "group flex flex-col items-start rounded-2xl border p-6 text-left transition",
    "hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md",
    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2",
    isSelected
      ? "border-sky-500 bg-sky-50 shadow-sm"
      : "border-slate-200 bg-white",
  ].join(" ")}
>
  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
    {option.badge}
  </span>

  <h2 className="mt-3 text-lg font-semibold text-slate-900">
    {option.label}
  </h2>

  <p className="mt-2 text-sm text-slate-700">
    {option.description}
  </p>

  <p className="mt-3 text-sm text-slate-600">
    {option.details}
  </p>

  <span className="mt-5 text-sm font-semibold text-sky-700">
    {isSelected ? "Selected ✓" : "Select this option →"}
  </span>
</button>

          );
        })}
      </div>
    </StepLayout>
  );
}
