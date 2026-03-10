import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import type {
  RentalCustomerAccountStatus,
  RentalCustomerPaymentTerms,
  RentalCustomerVettingStatus,
} from "@/lib/rental/orders/types";

export const runtime = "nodejs";

type UpdateBody = {
  vettingStatus?: RentalCustomerVettingStatus;
  paymentTerms?: RentalCustomerPaymentTerms;
  accountStatus?: RentalCustomerAccountStatus;
  internalNotes?: string;
  creditLimit?: number | string | null;
  creditControlEnabled?: boolean;
  creditHoldReason?: string | null;
};

function normalizeCreditLimit(value: UpdateBody["creditLimit"]): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) throw new Error("Credit limit must be a valid number");
    if (parsed < 0) throw new Error("Credit limit cannot be negative");
    return Number(parsed.toFixed(2));
  }

  if (!Number.isFinite(value)) throw new Error("Credit limit must be a valid number");
  if (value < 0) throw new Error("Credit limit cannot be negative");
  return Number(value.toFixed(2));
}

function normalizeCreditHoldReason(value: UpdateBody["creditHoldReason"]): string | null | undefined {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as UpdateBody;
    const existing = await dbRentalCustomerRepo.getById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const creditLimit = normalizeCreditLimit(body.creditLimit);
    const creditHoldReason = normalizeCreditHoldReason(body.creditHoldReason);
    const creditControlEnabled = body.creditControlEnabled;

    const nextCreditLimit = creditLimit === undefined ? existing.creditLimit ?? null : creditLimit;
    const nextCreditControlEnabled =
      typeof creditControlEnabled === "boolean" ? creditControlEnabled : existing.creditControlEnabled;
    const nextCreditHoldReason =
      creditHoldReason === undefined ? existing.creditHoldReason ?? null : creditHoldReason;

    const creditPolicyChanged =
      nextCreditLimit !== (existing.creditLimit ?? null) ||
      nextCreditControlEnabled !== existing.creditControlEnabled ||
      nextCreditHoldReason !== (existing.creditHoldReason ?? null);

    const customer = await dbRentalCustomerRepo.update(params.id, {
      vettingStatus: body.vettingStatus,
      paymentTerms: body.paymentTerms,
      accountStatus: body.accountStatus,
      internalNotes: body.internalNotes,
      creditLimit,
      creditControlEnabled,
      creditHoldReason,
      creditLastReviewedAt: creditPolicyChanged ? new Date().toISOString() : undefined,
    });
    return NextResponse.json({ customer });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Customer update failed";
    const status = message === "Customer not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
