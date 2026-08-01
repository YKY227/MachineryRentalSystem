import "server-only";

import { dbRentalDamageAssessmentRepo } from "@/lib/rental/damage-assessments/db-rental-damage-assessment-repo";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import type { Invoice } from "@/lib/rental/invoices/types";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { RentalOrder } from "@/lib/rental/orders/types";

export type CreateDamageChargeInvoiceInput = {
  orderId: string;
  description: string;
  amountExclGstCents: number;
  notes?: string;
  damageAssessmentId?: string;
  depositTransactionId?: string;
};

function clampCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function buildBillTo(order: RentalOrder) {
  const customer = order.customerSnapshot;
  return {
    name: customer?.companyName?.trim() || customer?.contactName?.trim() || "Customer",
    contactName: customer?.contactName?.trim() || undefined,
    email: customer?.email?.trim() || undefined,
    addressLines: customer?.address?.trim() ? [customer.address.trim()] : ["-"],
    uen: customer?.uen?.trim() || undefined,
  };
}

export const damageChargeInvoiceService = {
  async createDraft(input: CreateDamageChargeInvoiceInput): Promise<Invoice> {
    const order = await dbOrderRepo.get(input.orderId);
    if (!order) throw new Error("Order not found");
    if (order.returnStatus === "out") {
      throw new Error("Damage charge invoices are only available for returned or completed rental orders");
    }

    const description = input.description.trim();
    if (!description) throw new Error("Description is required");

    const amountExclGstCents = clampCents(input.amountExclGstCents);
    if (amountExclGstCents <= 0) {
      throw new Error("Damage charge amount must be greater than 0");
    }

    const damageAssessmentId = input.damageAssessmentId?.trim() || undefined;
    const depositTransactionId = input.depositTransactionId?.trim() || undefined;
    const notes = input.notes?.trim() || undefined;

    if (damageAssessmentId) {
      const assessment = await dbRentalDamageAssessmentRepo.getById(damageAssessmentId);
      if (!assessment) throw new Error("Damage assessment not found");
      if (assessment.orderId !== order.id) {
        throw new Error("Damage assessment does not belong to this order");
      }
      if (assessment.status !== "finalized") {
        throw new Error("Only finalized damage assessments can be linked to damage invoices");
      }
    }

    if (depositTransactionId) {
      const transaction = await dbRentalDepositRepo.getTransactionById(depositTransactionId);
      if (!transaction) throw new Error("Deposit transaction not found");
      if (transaction.orderId !== order.id) {
        throw new Error("Deposit transaction does not belong to this order");
      }
      if (transaction.transactionType !== "released" && transaction.transactionType !== "retained") {
        throw new Error("Only deposit resolution transactions can be linked to damage invoices");
      }
    }

    return dbInvoiceRepo.createDraftCustom({
      orderId: order.id,
      billTo: buildBillTo(order),
      description,
      amountExclGstCents,
      metadata: {
        contextType: "damage_charge",
        damageCharge: {
          kind: "damage_charge",
          notes,
          damageAssessmentId,
          depositTransactionId,
        },
      },
    });
  },
};
