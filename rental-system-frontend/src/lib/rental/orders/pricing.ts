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

function toMoney(value: number | undefined) {
  const next = Number(value ?? 0);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, next);
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
