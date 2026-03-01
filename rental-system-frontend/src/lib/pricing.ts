// Mock pricing logic for prototyping only.

interface PricingInput {
  distanceKm: number;
  totalBillableWeightKg: number;
  stops: number;
  serviceType: "same-day" | "next-day" | "express-3h";
}

export function mockEstimatePrice(input: PricingInput): number {
  const base = 5;
  const perKm = 0.5;
  const perKg = 0.8;
  const perStop = 1.5;

  let total =
    base +
    input.distanceKm * perKm +
    input.totalBillableWeightKg * perKg +
    (input.stops - 1) * perStop;

  if (input.serviceType === "express-3h") {
    total *= 1.5;
  }

  return Math.round(total * 100) / 100;
}
