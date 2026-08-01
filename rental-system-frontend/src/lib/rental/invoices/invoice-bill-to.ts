import "server-only";

import type { InvoiceBillToSnapshot } from "@/lib/rental/invoices/types";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import type { RentalCustomer, RentalOrderCustomerSnapshot } from "@/lib/rental/orders/types";

export type InvoiceBillToContext = {
  billTo: InvoiceBillToSnapshot;
  source: "customer_account" | "order_snapshot" | "fallback";
  hasCustomerAccount: boolean;
};

function toAddressLines(value?: string) {
  const lines = (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length ? lines : ["-"];
}

function buildBillToFromCustomer(customer: RentalCustomer): InvoiceBillToSnapshot {
  return {
    name: customer.companyName.trim() || customer.contactName.trim() || "Customer",
    contactName: customer.contactName.trim() || undefined,
    email: customer.email.trim() || undefined,
    addressLines: toAddressLines(customer.address),
    uen: customer.uen?.trim() || undefined,
  };
}

function buildBillToFromOrderSnapshot(snapshot?: RentalOrderCustomerSnapshot): InvoiceBillToSnapshot {
  return {
    name: snapshot?.companyName?.trim() || snapshot?.contactName?.trim() || "Customer",
    contactName: snapshot?.contactName?.trim() || undefined,
    email: snapshot?.email?.trim() || undefined,
    addressLines: toAddressLines(snapshot?.address),
    uen: snapshot?.uen?.trim() || undefined,
  };
}

export async function resolveInvoiceBillToContext(input: {
  customerId?: string;
  customerSnapshot?: RentalOrderCustomerSnapshot;
}): Promise<InvoiceBillToContext> {
  const customerId = input.customerId?.trim();
  if (customerId) {
    const customer = await dbRentalCustomerRepo.getById(customerId);
    if (customer) {
      return {
        billTo: buildBillToFromCustomer(customer),
        source: "customer_account",
        hasCustomerAccount: true,
      };
    }
  }

  if (input.customerSnapshot) {
    return {
      billTo: buildBillToFromOrderSnapshot(input.customerSnapshot),
      source: "order_snapshot",
      hasCustomerAccount: false,
    };
  }

  return {
    billTo: {
      name: "Customer",
      addressLines: ["-"],
    },
    source: "fallback",
    hasCustomerAccount: false,
  };
}
