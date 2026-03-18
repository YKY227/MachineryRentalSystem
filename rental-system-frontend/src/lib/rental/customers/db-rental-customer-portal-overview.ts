import "server-only";

import { loadRentalCustomerOverview } from "@/lib/rental/customers/db-rental-customer-overview";
import type {
  RentalCustomerPortalOverview,
  RentalCustomerPortalProfile,
} from "@/lib/rental/customers/portal-types";
import type { RentalCustomer } from "@/lib/rental/orders/types";

function toPortalProfile(customer: RentalCustomer): RentalCustomerPortalProfile {
  return {
    id: customer.id,
    companyName: customer.companyName,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone,
    uen: customer.uen,
    address: customer.address,
    paymentTerms: customer.paymentTerms,
    accountStatus: customer.accountStatus,
    createdAt: customer.createdAt,
  };
}

export async function loadRentalCustomerPortalOverview(
  customerId: string
): Promise<RentalCustomerPortalOverview> {
  const overview = await loadRentalCustomerOverview(customerId);

  return {
    profile: toPortalProfile(overview.customer),
    financialSummary: overview.financialSummary,
    agingSummary: overview.agingSummary,
    depositSummary: overview.depositSummary,
    creditSummary: {
      paymentTerms: overview.customer.paymentTerms,
      creditLimit: overview.creditControl.creditLimit,
      creditUsed: overview.creditControl.creditUsed,
      availableCredit: overview.creditControl.availableCredit,
      overdueAmount: overview.creditControl.overdueAmount,
      overdueInvoiceCount: overview.creditControl.overdueInvoiceCount,
      oldestOverdueInvoiceDate: overview.creditControl.oldestOverdueInvoiceDate,
      creditControlEnabled: overview.creditControl.creditControlEnabled,
      status: overview.creditControl.recommendedDecision,
    },
    openInvoices: overview.openInvoices,
    recentOrders: overview.recentOrders,
    recentExtensions: overview.recentExtensions,
    recentInvoices: overview.recentInvoices,
    recentPayments: overview.recentPayments,
    recentNotices: overview.emailEvents
      .filter((event) => event.type === "reminder" || event.type === "receipt" || event.type === "sent")
      .map((event) => ({
        id: event.id,
        invoiceId: event.invoiceId,
        invoiceNo: event.invoiceNo,
        kind: event.type === "reminder" ? "reminder" : event.type === "receipt" ? "receipt" : "invoice",
        subject: event.subject,
        createdAt: event.createdAt,
      })),
  };
}
