import type { RentalCreditDecision } from "@/lib/rental/credit-control/db-rental-credit-control";
import type { RentalOrderDepositStatus } from "@/lib/rental/deposits/types";
import type { InvoicePaymentStatus } from "@/lib/rental/invoices/types";
import type { RentalCustomerAccountStatus, RentalCustomerPaymentTerms } from "@/lib/rental/orders/types";

export type RentalCustomerPortalFinancialSummary = {
  totalInvoices: number;
  totalPaidCents: number;
  outstandingBalanceCents: number;
  overdueInvoicesCount: number;
};

export type RentalCustomerPortalDepositSummary = {
  totalRequiredCents: number;
  totalHeldCents: number;
  totalOutstandingCents: number;
  heldCount: number;
  pendingCount: number;
};

export type RentalCustomerPortalRecentOrder = {
  id: string;
  equipmentSummary: string;
  rentalStart: string;
  rentalEnd: string;
  orderStatus: string;
  depositRequiredCents: number;
  depositHeldCents: number;
  depositReleasedCents: number;
  depositRetainedCents: number;
  depositUnresolvedCents: number;
  depositStatus: RentalOrderDepositStatus;
  createdAt: string;
};

export type RentalCustomerPortalRecentInvoice = {
  id: string;
  invoiceNo?: string;
  issueDate?: string;
  status: "draft" | "issued" | "void";
  totalInclGstCents: number;
  paymentStatus: InvoicePaymentStatus;
  paidCents: number;
  outstandingBalanceCents: number;
  dueDate?: string;
};

export type RentalCustomerPortalRecentPayment = {
  id: string;
  paidAt: string;
  amountCents: number;
  method?: string;
  reference?: string;
  invoiceId: string;
  invoiceNo?: string;
  createdAt: string;
};

export type RentalCustomerPortalProfile = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  uen?: string;
  address?: string;
  paymentTerms: RentalCustomerPaymentTerms;
  accountStatus: RentalCustomerAccountStatus;
  createdAt: string;
};

export type RentalCustomerPortalCreditSummary = {
  paymentTerms: RentalCustomerPaymentTerms;
  creditLimit: number | null;
  creditUsed: number;
  availableCredit: number;
  overdueAmount: number;
  overdueInvoiceCount: number;
  oldestOverdueInvoiceDate: string | null;
  creditControlEnabled: boolean;
  status: RentalCreditDecision;
};

export type RentalCustomerPortalNotice = {
  id: string;
  invoiceId: string;
  invoiceNo?: string;
  kind: "reminder" | "receipt" | "invoice";
  subject: string;
  createdAt: string;
};

export type RentalCustomerPortalOverview = {
  profile: RentalCustomerPortalProfile;
  financialSummary: RentalCustomerPortalFinancialSummary;
  depositSummary: RentalCustomerPortalDepositSummary;
  creditSummary: RentalCustomerPortalCreditSummary;
  recentOrders: RentalCustomerPortalRecentOrder[];
  recentInvoices: RentalCustomerPortalRecentInvoice[];
  recentPayments: RentalCustomerPortalRecentPayment[];
  recentNotices: RentalCustomerPortalNotice[];
};
