export type RentalCheckoutGroupPaymentProvider = "hitpay";

export type RentalCheckoutGroupPaymentSessionStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "manual_review";

export type RentalCheckoutGroupPaymentSession = {
  id: string;
  checkoutGroupId: string;
  provider: RentalCheckoutGroupPaymentProvider;
  providerPaymentRequestId?: string;
  providerReferenceNumber?: string;
  redirectUrl?: string;
  amountCents: number;
  currency: string;
  status: RentalCheckoutGroupPaymentSessionStatus;
  paidAt?: string;
  failedAt?: string;
  expiredAt?: string;
  convertedAt?: string;
  manualReviewReason?: string;
  providerPayload: Record<string, unknown>;
  webhookPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
