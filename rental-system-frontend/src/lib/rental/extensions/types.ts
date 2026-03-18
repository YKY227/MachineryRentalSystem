import type { RentalCustomerPaymentTerms } from "@/lib/rental/orders/types";

export type RentalOrderExtensionStatus =
  | "availability_blocked"
  | "awaiting_admin_review"
  | "rejected"
  | "approved_pending_payment"
  | "approved_confirmed"
  | "cancelled";

export type RentalOrderExtensionAvailabilityStatus = "unknown" | "available" | "blocked";

export type RentalOrderExtension = {
  id: string;
  orderId: string;
  customerId: string;
  currentRentalEnd: string;
  requestedRentalEnd: string;
  status: RentalOrderExtensionStatus;
  extensionChargeEstimateCents: number;
  finalExtensionChargeCents?: number;
  paymentTermsSnapshot: RentalCustomerPaymentTerms;
  availabilityStatus: RentalOrderExtensionAvailabilityStatus;
  availabilityMessage?: string;
  customerMessage?: string;
  reviewNote?: string;
  paymentSessionId?: string;
  invoiceId?: string;
  approvedAt?: string;
  rejectedAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRentalOrderExtensionInput = {
  orderId: string;
  customerId: string;
  currentRentalEnd: string;
  requestedRentalEnd: string;
  status: RentalOrderExtensionStatus;
  extensionChargeEstimateCents: number;
  finalExtensionChargeCents?: number | null;
  paymentTermsSnapshot: RentalCustomerPaymentTerms;
  availabilityStatus: RentalOrderExtensionAvailabilityStatus;
  availabilityMessage?: string | null;
  customerMessage?: string | null;
  reviewNote?: string | null;
  paymentSessionId?: string | null;
  invoiceId?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
};

export type UpdateRentalOrderExtensionInput = Partial<CreateRentalOrderExtensionInput>;
