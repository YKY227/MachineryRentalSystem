import type { FulfillmentMode, RentalOrderPricingSnapshot } from "@/lib/rental/orders/types";

export type RentalCheckoutGroupStatus =
  | "draft"
  | "validating"
  | "holds_acquired"
  | "payment_pending"
  | "converting"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed"
  | "manual_review";

export type RentalCheckoutGroupLineStatus =
  | "pending"
  | "hold_acquired"
  | "order_created"
  | "invoice_created"
  | "paid"
  | "failed"
  | "released"
  | "cancelled";

export type RentalCheckoutGroupLine = {
  id: string;
  checkoutGroupId: string;
  lineIndex: number;
  cartLineIdSnapshot?: string;
  equipmentId: string;
  equipmentTitleSnapshot: string;
  equipmentImageUrlSnapshot?: string;
  qty: number;
  startDate: string;
  endDate: string;
  fulfillment: FulfillmentMode;
  deliveryAddress?: string;
  pricingSnapshot: RentalOrderPricingSnapshot;
  rentalSubtotalCents: number;
  deliveryFeeCents: number;
  collectionFeeCents: number;
  gstCents: number;
  depositCents: number;
  payableTotalCents: number;
  displayTotalCents: number;
  holdId?: string;
  rentalOrderId?: string;
  invoiceId?: string;
  invoicePaymentId?: string;
  status: RentalCheckoutGroupLineStatus;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type RentalCheckoutGroup = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  companyName?: string;
  status: RentalCheckoutGroupStatus;
  currency: string;
  rentalSubtotalCents: number;
  deliveryFeeCents: number;
  collectionFeeCents: number;
  gstCents: number;
  depositCents: number;
  payableTotalCents: number;
  displayTotalCents: number;
  paymentSessionId?: string;
  holdExpiresAt?: string;
  paidAt?: string;
  convertedAt?: string;
  childOrderIds: string[];
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  lines: RentalCheckoutGroupLine[];
};

export type CreateRentalCheckoutGroupInput = {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  companyName?: string;
  currency?: string;
  rentalSubtotalCents: number;
  deliveryFeeCents: number;
  collectionFeeCents: number;
  gstCents: number;
  depositCents: number;
  payableTotalCents: number;
  displayTotalCents: number;
};

export type CreateRentalCheckoutGroupLineInput = {
  lineIndex: number;
  cartLineIdSnapshot?: string;
  equipmentId: string;
  equipmentTitleSnapshot: string;
  equipmentImageUrlSnapshot?: string;
  qty: number;
  startDate: string;
  endDate: string;
  fulfillment: FulfillmentMode;
  deliveryAddress?: string;
  pricingSnapshot: RentalOrderPricingSnapshot;
  rentalSubtotalCents: number;
  deliveryFeeCents: number;
  collectionFeeCents: number;
  gstCents: number;
  depositCents: number;
  payableTotalCents: number;
  displayTotalCents: number;
};

export type RentalCheckoutGroupHoldLineResult = {
  lineId?: string;
  lineIndex: number;
  cartLineId?: string;
  equipmentId?: string;
  ok: boolean;
  status?: RentalCheckoutGroupLineStatus;
  holdId?: string;
  holdExpiresAt?: string;
  reasonCode?: string;
  message?: string;
  availableQty?: number;
  requestedQty?: number;
  committedQty?: number;
  heldQty?: number;
  downtimeQty?: number;
  totalUnits?: number;
};

export type RentalCheckoutGroupHoldResult = {
  ok: boolean;
  groupId?: string;
  status?: RentalCheckoutGroupStatus;
  holdExpiresAt?: string;
  message?: string;
  lineResults: RentalCheckoutGroupHoldLineResult[];
};
