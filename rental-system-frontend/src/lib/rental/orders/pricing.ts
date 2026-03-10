import type { Equipment } from "@/lib/rental/types";

export const RENTAL_GST_RATE = 0.09;

type PricingSnapshotInput = {
  rentalSubtotal: number;
  deliveryFee: number;
  collectionFee: number;
  deposit: number;
  gstAmount?: number;
  payableTotal?: number;
  total?: number;
};

export type AuthoritativeRentalPricingInput = {
  equipment: Pick<Equipment, "id" | "pricing">;
  qty: number;
  start: string;
  end: string;
  fulfillment: "deliver" | "self_collect";
};

function toMoney(value: number | undefined) {
  const next = Number(value ?? 0);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, next);
}

export function calculateRentalDaysInclusive(startISO: string, endISO: string) {
  const start = new Date(`${startISO}T12:00:00`);
  const end = new Date(`${endISO}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export function calculateRentalSubtotal(input: {
  dayRate: number;
  weekRate?: number;
  monthRate?: number;
  days: number;
  qty: number;
}) {
  const day = toMoney(input.dayRate);
  const week = input.weekRate === undefined ? undefined : toMoney(input.weekRate);
  const month = input.monthRate === undefined ? undefined : toMoney(input.monthRate);
  const days = Math.max(0, Math.floor(Number(input.days) || 0));
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0));

  if (days <= 0 || qty <= 0) return 0;

  let perUnit = day * days;

  if (month !== undefined && month > 0 && days >= 28) {
    perUnit = month * (days / 30);
  } else if (week !== undefined && week > 0 && days >= 7) {
    perUnit = week * (days / 7);
  }

  return Number((perUnit * qty).toFixed(2));
}

export function calculateAuthoritativeRentalPricing(input: AuthoritativeRentalPricingInput) {
  const qty = Math.max(1, Math.floor(Number(input.qty) || 0));
  const days = calculateRentalDaysInclusive(input.start, input.end);
  const pricing = input.equipment.pricing;
  const minDays = Math.max(1, Math.floor(Number(pricing.minDays) || 1));
  if (days <= 0) {
    throw new Error("Invalid rental date range");
  }
  if (days < minDays) {
    throw new Error(`Minimum rental period is ${minDays} day(s)`);
  }

  const rentalSubtotal = calculateRentalSubtotal({
    dayRate: pricing.dayRate ?? 0,
    weekRate: pricing.weekRate,
    monthRate: pricing.monthRate,
    days,
    qty,
  });
  const deliveryFee = input.fulfillment === "deliver" ? 60 : 0;
  const collectionFee = input.fulfillment === "deliver" ? 60 : 0;
  const deposit = toMoney(pricing.deposit);
  const charges = calculateRentalCharges({
    rentalSubtotal,
    deliveryFee,
    collectionFee,
    deposit,
  });

  return {
    days,
    pricingSnapshot: {
      days,
      rentalSubtotal: charges.rentalSubtotal,
      deliveryFee: charges.deliveryFee,
      collectionFee: charges.collectionFee,
      deposit: charges.deposit,
      gstAmount: charges.gstAmount,
      payableTotal: charges.payableTotal,
      total: charges.displayTotal,
    },
    unitRatesUsed: {
      dayRate: toMoney(pricing.dayRate),
      weekRate: pricing.weekRate === undefined ? null : toMoney(pricing.weekRate),
      monthRate: pricing.monthRate === undefined ? null : toMoney(pricing.monthRate),
      minDays,
    },
  };
}

export function calculateRentalCharges(pricing: PricingSnapshotInput) {
  const rentalSubtotal = toMoney(pricing.rentalSubtotal);
  const deliveryFee = toMoney(pricing.deliveryFee);
  const collectionFee = toMoney(pricing.collectionFee);
  const deposit = toMoney(pricing.deposit);

  const chargesExclGst = rentalSubtotal + deliveryFee + collectionFee;
  const gstAmount =
    pricing.gstAmount !== undefined
      ? toMoney(pricing.gstAmount)
      : Number((chargesExclGst * RENTAL_GST_RATE).toFixed(2));
  const payableTotal =
    pricing.payableTotal !== undefined
      ? toMoney(pricing.payableTotal)
      : Number((chargesExclGst + gstAmount).toFixed(2));
  const displayTotal =
    pricing.total !== undefined ? toMoney(pricing.total) : payableTotal + deposit;

  return {
    rentalSubtotal,
    deliveryFee,
    collectionFee,
    deposit,
    chargesExclGst,
    gstAmount,
    payableTotal,
    displayTotal,
  };
}
