export type RentalOrderDepositStatus =
  | "not_required"
  | "pending"
  | "partially_held"
  | "held"
  | "partially_released"
  | "released"
  | "partially_retained"
  | "retained";

export type RentalDepositTransactionType =
  | "requirement_created"
  | "payment_collected"
  | "released"
  | "retained"
  | "adjustment";

export type RentalOrderDeposit = {
  id: string;
  orderId: string;
  customerId?: string;
  requiredAmountCents: number;
  heldAmountCents: number;
  releasedAmountCents: number;
  retainedAmountCents: number;
  status: RentalOrderDepositStatus;
  sourceInvoiceId?: string;
  lastPaymentSessionId?: string;
  lastInvoicePaymentId?: string;
  lastCollectedAt?: string;
  resolvedAt?: string;
  lastResolutionType?: "release" | "retain" | "split";
  lastResolutionNote?: string;
  lastResolutionRecordedBy?: string;
  lastResolutionReference?: string;
  releasedAt?: string;
  retainedAt?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RentalDepositTransaction = {
  id: string;
  depositId: string;
  orderId: string;
  customerId?: string;
  damageAssessmentId?: string;
  transactionType: RentalDepositTransactionType;
  amountCents: number;
  paymentSessionId?: string;
  invoiceId?: string;
  invoicePaymentId?: string;
  paymentAllocationId?: string;
  recordedBy?: string;
  externalReference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type RentalOrderDepositSummary = {
  depositId?: string;
  orderId: string;
  requiredAmountCents: number;
  heldAmountCents: number;
  releasedAmountCents: number;
  retainedAmountCents: number;
  unresolvedAmountCents: number;
  status: RentalOrderDepositStatus;
  sourceInvoiceId?: string;
  lastPaymentSessionId?: string;
  lastInvoicePaymentId?: string;
  lastCollectedAt?: string;
  resolvedAt?: string;
  lastResolutionType?: "release" | "retain" | "split";
  lastResolutionNote?: string;
  lastResolutionRecordedBy?: string;
  lastResolutionReference?: string;
};
