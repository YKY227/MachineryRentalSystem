export type FulfillmentMode = "deliver" | "self_collect";

export type RentalOrderPricingSnapshot = {
  days: number;
  rentalSubtotal: number;
  deliveryFee: number;
  collectionFee: number;
  deposit: number;
  total: number;
};

export type RentalOrder = {
  id: string;
  equipmentId: string;
  equipmentTitle: string;
  qty: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  fulfillment: FulfillmentMode;
  pricingSnapshot: RentalOrderPricingSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type CreateRentalOrderInput = {
  id: string;
  equipmentId: string;
  equipmentTitle: string;
  qty: number;
  start: string;
  end: string;
  fulfillment: FulfillmentMode;
  pricingSnapshot: RentalOrderPricingSnapshot;
};
