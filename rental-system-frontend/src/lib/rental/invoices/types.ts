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
  provider: "mock" | "resend" | "ses" | "postmark";
  status: "sent" | "queued" | "failed";
  providerMessageId?: string;
  pdfSha256?: string;
};

export type InvoicePdfStorage = {
  path: string;          // e.g. invoices/INV-202602-00001.pdf
  generatedAt: string;   // ISO timestamp
  sha256: string;        // content hash (integrity check)
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

export type Invoice = {
  id: string;
  status: InvoiceStatus;

  orderId: string; // ✅ one invoice per order
  invoiceNo?: string; // set when issued
  issueDate?: string; // ISO
  dueDate?: string; // ISO

  pdfStorage?: InvoicePdfStorage;
  
  currency: "SGD";
  pricesIncludeGst: false;
  gstRate: number; // e.g. 0.09 snapshot

  supplier: InvoiceSupplierSnapshot;
  billTo: InvoiceBillToSnapshot;

  items: InvoiceItem[];

  // totals snapshot
  subtotalExclGstCents: number;
  gstAmountCents: number;
  totalInclGstCents: number;

  // optional: refundable security deposit display
  depositCents?: number;

  // pdf/email placeholders
  pdfKey?: string;
  emailLog: InvoiceEmailLogItem[];

  // void info
  voidReason?: string;
  voidedAt?: string;

  createdAt: string; // ISO
  updatedAt: string; // ISO
};

