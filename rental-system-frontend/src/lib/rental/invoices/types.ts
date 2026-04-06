// src/lib/rental/invoices/types.ts
export type InvoiceStatus = "draft" | "issued" | "void";
export type InvoicePaymentStatus = "unpaid" | "partially_paid" | "paid" | "overdue";

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  amountCents: number;
  paidAt: string; // ISO
  method?: string;
  reference?: string;
  notes?: string;
  createdAt: string; // ISO
};

export type InvoicePaymentTotals = {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  status: InvoicePaymentStatus;
};

export type InvoiceEmailEventType = "sent" | "resent" | "reminder" | "receipt";

export type InvoiceEmailSummary = {
  emailCount: number;
  lastEmailAt?: string;
  lastEmailType?: InvoiceEmailEventType;
  lastEmailTo?: string;
};

export type InvoiceListItem = {
  invoice: Invoice;
  paymentTotals: InvoicePaymentTotals;
  emailSummary?: InvoiceEmailSummary;
};

export type InvoiceListSortBy = "created_at" | "due_date" | "total" | "invoice_number";
export type InvoiceListSortDir = "asc" | "desc";

export type InvoiceEmailLogItem = {
  id: string;
  type: InvoiceEmailEventType;
  to: string;
  cc?: string;
  subject: string;
  sentAt: string; // ISO
  provider: "mock" | "sendgrid" | "resend" | "ses" | "postmark";
  status: "sent" | "queued" | "failed";
  providerMessageId?: string;
  pdfSha256?: string;
};

export type InvoicePdfStorage = {
  path: string;
  generatedAt: string;
  sha256: string;
};

export type InvoiceSupplierSnapshot = {
  name: string;
  uen?: string;
  gstRegNo?: string;
  addressLines: string[];
  email?: string;
  phone?: string;
  website?: string;
};

export type InvoiceBillToSnapshot = {
  name: string;
  uen?: string;
  addressLines: string[];
  contactName?: string;
  email?: string;
};

export type InvoiceItem = {
  description: string;
  qty: number;
  unitPriceExclGstCents: number;
  amountExclGstCents: number;
};

export type InvoiceDamageChargeMetadata = {
  kind: "damage_charge";
  notes?: string;
  damageAssessmentId?: string;
  depositTransactionId?: string;
};

export type InvoiceMetadata = {
  contextType?: "damage_charge";
  damageCharge?: InvoiceDamageChargeMetadata;
};

export type Invoice = {
  id: string;
  status: InvoiceStatus;

  orderId: string;
  invoiceNo?: string;
  issueDate?: string;
  dueDate?: string;

  pdfStorage?: InvoicePdfStorage;

  currency: "SGD";
  pricesIncludeGst: false;
  gstRate: number;

  supplier: InvoiceSupplierSnapshot;
  billTo: InvoiceBillToSnapshot;

  items: InvoiceItem[];

  subtotalExclGstCents: number;
  gstAmountCents: number;
  totalInclGstCents: number;

  depositCents?: number;
  metadata?: InvoiceMetadata;

  pdfKey?: string;
  emailLog: InvoiceEmailLogItem[];

  voidReason?: string;
  voidedAt?: string;

  createdAt: string;
  updatedAt: string;
};
