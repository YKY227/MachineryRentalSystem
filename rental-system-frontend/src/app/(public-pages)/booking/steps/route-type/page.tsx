// src/app/(public-pages)/booking/steps/route-type.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepLayout } from "@/components/wizard/StepLayout";
import { useBooking, RouteType } from "@/lib/booking-store";

const routeOptions: {
  id: RouteType;
  label: string;
  short: string;
  description: string;
  example: string;
}[] = [
  {
    id: "one-to-many",
    label: "One Pickup → Many Deliveries",
    short: "Hub to multiple drops",
    description:
      "Collect from a single location and deliver to multiple recipients.",
    example: "E.g. Pickup at Warehouse A, deliver to B, C, D, E…",
  },
  {
    id: "many-to-one",
    label: "Many Pickups → One Delivery",
    short: "Consolidation",
    description:
      "Collect from multiple locations and deliver to a single destination.",
    example: "E.g. Pickup from B, C, D, E…, deliver to HQ at A.",
  },
  {
    id: "one-to-one",
    label: "One Pickup → One Delivery",
    short: "Point-to-point",
    description:
      "Standard direct delivery between a single pickup and drop-off.",
    example: "E.g. Pickup at Office A, deliver to Client B.",
  },
  {
    id: "round-trip",
    label: "Round Trip / Sequence",
    short: "Multi-stop loop",
    description:
      "Visit a sequence of locations and return to the starting point.",
    example: "E.g. A → B → C → back to A, with collections at each stop.",
  },
];


export default function RouteTypeStep() {
  const router = useRouter();
  const { routeType, setRouteType, serviceType } = useBooking();

  useEffect(() => {
    if (!serviceType) router.replace("/booking/steps/delivery-type");
  }, [serviceType, router]);

  const handleSelect = (id: RouteType) => {
    setRouteType(id);
    router.push("/booking/steps/pickup");
  };

  return (
    <StepLayout
      title="Choose Route Type"
      subtitle={
        serviceType
          ? "Based on your chosen delivery speed, select how the route should be structured."
          : "Select how the route should be structured."
      }
      currentStep={2}
      totalSteps={8}
      backHref="/booking/steps/delivery-type"
    >
      <div className="grid gap-5 md:grid-cols-2">
        {routeOptions.map((option) => {
          const isSelected = routeType === option.id;

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
              <div className="flex w-full items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {option.label}
                </h2>

                <span className="shrink-0 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {option.short}
                </span>
              </div>

              <p className="mt-3 text-sm text-slate-700">
                {option.description}
              </p>

              <p className="mt-3 text-sm italic text-slate-600">
                {option.example}
              </p>

              <span className="mt-5 text-sm font-semibold text-sky-700">
                {isSelected ? "Selected ✓" : "Select this route →"}
              </span>
            </button>
          );
        })}
      </div>
    </StepLayout>
  );
}
