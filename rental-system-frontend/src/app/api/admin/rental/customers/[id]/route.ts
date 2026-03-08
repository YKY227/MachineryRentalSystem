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
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as UpdateBody;
    const customer = await dbRentalCustomerRepo.update(params.id, {
      vettingStatus: body.vettingStatus,
      paymentTerms: body.paymentTerms,
      accountStatus: body.accountStatus,
      internalNotes: body.internalNotes,
    });
    return NextResponse.json({ customer });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Customer update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
