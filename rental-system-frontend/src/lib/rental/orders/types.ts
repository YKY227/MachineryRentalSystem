export type FulfillmentMode = "deliver" | "self_collect";
export type RentalCustomerPaymentTerms = "upfront" | "credit";
export type RentalCustomerVettingStatus = "new" | "under_review" | "pre_vetted" | "rejected";
export type RentalCustomerAccountStatus = "active" | "suspended";

export type RentalOrderPricingSnapshot = {
  days: number;
  rentalSubtotal: number;
  deliveryFee: number;
  collectionFee: number;
  deposit: number;
  gstAmount?: number;
  payableTotal?: number;
  total: number;
};

export type RentalOrderCustomerSnapshot = {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  uen?: string;
  address?: string;
  customerId?: string;
  paymentTerms?: RentalCustomerPaymentTerms;
  vettingStatus?: RentalCustomerVettingStatus;
  accountStatus?: RentalCustomerAccountStatus;
};

export type RentalOrder = {
  id: string;
  customerId?: string;
  equipmentId: string;
  equipmentTitle: string;
  qty: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  fulfillment: FulfillmentMode;
  pricingSnapshot: RentalOrderPricingSnapshot;
  customerSnapshot?: RentalOrderCustomerSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type CreateRentalOrderInput = {
  id: string;
  customerId?: string;
  equipmentId: string;
  equipmentTitle: string;
  qty: number;
  start: string;
  end: string;
  fulfillment: FulfillmentMode;
  pricingSnapshot: RentalOrderPricingSnapshot;
  customerSnapshot: RentalOrderCustomerSnapshot;
};

export type RentalCustomer = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  uen?: string;
  address?: string;
  vettingStatus: RentalCustomerVettingStatus;
  paymentTerms: RentalCustomerPaymentTerms;
  accountStatus: RentalCustomerAccountStatus;
  creditLimit?: number;
  creditControlEnabled: boolean;
  creditHoldReason?: string;
  creditLastReviewedAt?: string;
  creditLastReviewedBy?: string;
  internalNotes?: string;
  authUserId?: string;
  createdAt: string;
  updatedAt: string;
};

export type RentalOrderPaymentProvider = "hitpay";
export type RentalOrderPaymentSessionStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

export type RentalOrderPaymentSession = {
  id: string;
  orderId: string;
  provider: RentalOrderPaymentProvider;
  providerPaymentRequestId?: string;
  providerReferenceNumber?: string;
  amountCents: number;
  currency: string;
  status: RentalOrderPaymentSessionStatus;
  paymentPurpose?: string;
  redirectUrl?: string;
  webhookPayload?: Record<string, unknown>;
  paidAt?: string;
  invoiceId?: string;
  invoicePaymentId?: string;
  invoiceAppliedAt?: string;
  invoiceEmailSentAt?: string;
  createdAt: string;
  updatedAt: string;
};
