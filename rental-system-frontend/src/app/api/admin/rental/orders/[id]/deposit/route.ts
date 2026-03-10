import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";

export const runtime = "nodejs";

type ResolveBody = {
  actionType?: "release" | "retain" | "split";
  releaseAmountCents?: number | string;
  retainAmountCents?: number | string;
  note?: string;
  externalReference?: string;
};

function parseAmount(value: number | string | undefined) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) throw new Error("Amount must be a valid number");
  return Math.max(0, Math.round(parsed));
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const deposit = await dbRentalDepositRepo.getByOrderId(params.id);
    const summary = await dbRentalDepositRepo.getSummaryByOrderId(params.id);
    const transactions = deposit
      ? await dbRentalDepositRepo.listTransactionsByDepositId(deposit.id)
      : [];

    return NextResponse.json({
      deposit,
      summary,
      transactions,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Deposit read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as ResolveBody;
    const actionType = body.actionType;
    if (!actionType) {
      return NextResponse.json({ error: "actionType is required" }, { status: 400 });
    }

    let releaseAmountCents = parseAmount(body.releaseAmountCents);
    let retainAmountCents = parseAmount(body.retainAmountCents);

    if (actionType === "release") {
      retainAmountCents = 0;
    } else if (actionType === "retain") {
      releaseAmountCents = 0;
    } else if (actionType !== "split") {
      return NextResponse.json({ error: "Invalid actionType" }, { status: 400 });
    }

    const result = await dbRentalDepositRepo.resolveHeldDeposit({
      orderId: params.id,
      releaseAmountCents,
      retainAmountCents,
      note: body.note?.trim() || undefined,
      externalReference: body.externalReference?.trim() || undefined,
    });
    const summary = await dbRentalDepositRepo.getSummaryByOrderId(params.id);

    return NextResponse.json({
      success: true,
      depositStatus: summary.status,
      heldAmountCents: summary.heldAmountCents,
      releasedAmountCents: summary.releasedAmountCents,
      retainedAmountCents: summary.retainedAmountCents,
      unresolvedAmountCents: summary.unresolvedAmountCents,
      transactionIds: result.transactions.map((transaction) => transaction.id),
      message:
        actionType === "split"
          ? "Deposit release and retention recorded."
          : actionType === "release"
            ? "Deposit release recorded."
            : "Deposit retention recorded.",
      deposit: result.deposit,
      summary,
      transactions: result.transactions,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Deposit resolution failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
