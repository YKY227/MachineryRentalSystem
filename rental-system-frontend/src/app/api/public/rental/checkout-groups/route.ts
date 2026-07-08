import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getAuthenticatedCustomer } from "@/lib/auth/customer";
import { dbRentalCheckoutGroupRepo } from "@/lib/rental/checkout-groups/db-checkout-group-repo";
import type { CreateRentalCheckoutGroupLineInput } from "@/lib/rental/checkout-groups/types";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import { calculateAuthoritativeRentalPricing } from "@/lib/rental/orders/pricing";
import type { FulfillmentMode } from "@/lib/rental/orders/types";

export const runtime = "nodejs";

type CheckoutGroupLineBody = {
  cartLineId?: string;
  equipmentId?: string;
  qty?: number;
  startDate?: string;
  endDate?: string;
  fulfillment?: string;
  deliveryAddress?: string | null;
};

type CheckoutGroupBody = {
  lines?: CheckoutGroupLineBody[];
};

function requireCheckoutGroupEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function normalizeFulfillment(value: unknown): FulfillmentMode {
  return value === "self_collect" ? "self_collect" : "deliver";
}

function amountToCents(value: unknown) {
  const next = Number(value ?? 0);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.round(next * 100));
}

function sumCents(lines: CreateRentalCheckoutGroupLineInput[], key: keyof CreateRentalCheckoutGroupLineInput) {
  return lines.reduce((sum, line) => sum + Math.max(0, Number(line[key] ?? 0)), 0);
}

function normalizeLine(input: CheckoutGroupLineBody, index: number) {
  const equipmentId = String(input.equipmentId ?? "").trim();
  const startDate = String(input.startDate ?? "").trim();
  const endDate = String(input.endDate ?? "").trim();
  const qty = Math.max(1, Math.floor(Number(input.qty ?? 1) || 1));
  const fulfillment = normalizeFulfillment(input.fulfillment);
  if (!equipmentId) throw new Error(`Line ${index + 1}: equipment is required`);
  if (!startDate || !endDate) throw new Error(`Line ${index + 1}: rental dates are required`);
  return {
    cartLineId: String(input.cartLineId ?? "").trim() || undefined,
    equipmentId,
    qty,
    startDate,
    endDate,
    fulfillment,
    deliveryAddress: String(input.deliveryAddress ?? "").trim() || undefined,
  };
}

export async function POST(req: Request) {
  try {
    requireCheckoutGroupEnv();
    if (isAdminAuthenticated(req)) {
      return NextResponse.json(
        { error: "Grouped checkout is only available for customer accounts" },
        { status: 403 }
      );
    }

    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json({ error: "Customer login is required before grouped checkout" }, { status: 401 });
    }
    if (customer.accountStatus !== "active") {
      return NextResponse.json({ error: "Customer account is suspended" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as CheckoutGroupBody;
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (!rawLines.length) {
      return NextResponse.json({ error: "Select at least one rental item for grouped checkout" }, { status: 400 });
    }

    const normalizedLines = rawLines.map(normalizeLine);
    const groupLines: CreateRentalCheckoutGroupLineInput[] = [];

    for (const [index, line] of normalizedLines.entries()) {
      const equipment = await dbRentalEquipmentRepo.getPublicByIdOrSlug(line.equipmentId);
      if (!equipment) {
        return NextResponse.json(
          { error: `Line ${index + 1}: equipment is not available for rental checkout` },
          { status: 400 }
        );
      }

      const pricing = calculateAuthoritativeRentalPricing({
        equipment,
        qty: line.qty,
        start: line.startDate,
        end: line.endDate,
        fulfillment: line.fulfillment,
      });
      const snapshot = pricing.pricingSnapshot;

      groupLines.push({
        lineIndex: index,
        cartLineIdSnapshot: line.cartLineId,
        equipmentId: equipment.id,
        equipmentTitleSnapshot: equipment.title,
        equipmentImageUrlSnapshot: equipment.images?.[0] ?? equipment.imageUrl,
        qty: line.qty,
        startDate: line.startDate,
        endDate: line.endDate,
        fulfillment: line.fulfillment,
        deliveryAddress: line.fulfillment === "deliver" ? line.deliveryAddress : undefined,
        pricingSnapshot: snapshot,
        rentalSubtotalCents: amountToCents(snapshot.rentalSubtotal),
        deliveryFeeCents: amountToCents(snapshot.deliveryFee),
        collectionFeeCents: amountToCents(snapshot.collectionFee),
        gstCents: amountToCents(snapshot.gstAmount),
        depositCents: amountToCents(snapshot.deposit),
        payableTotalCents: amountToCents(snapshot.payableTotal),
        displayTotalCents: amountToCents(snapshot.total),
      });
    }

    const group = await dbRentalCheckoutGroupRepo.createGroup({
      customerId: customer.id,
      customerName: customer.contactName.trim() || customer.companyName.trim(),
      customerEmail: customer.email.trim(),
      customerPhone: customer.phone,
      companyName: customer.companyName,
      currency: "SGD",
      rentalSubtotalCents: sumCents(groupLines, "rentalSubtotalCents"),
      deliveryFeeCents: sumCents(groupLines, "deliveryFeeCents"),
      collectionFeeCents: sumCents(groupLines, "collectionFeeCents"),
      gstCents: sumCents(groupLines, "gstCents"),
      depositCents: sumCents(groupLines, "depositCents"),
      payableTotalCents: sumCents(groupLines, "payableTotalCents"),
      displayTotalCents: sumCents(groupLines, "displayTotalCents"),
    });

    await dbRentalCheckoutGroupRepo.createLines(group.id, groupLines);
    const holdResult = await dbRentalCheckoutGroupRepo.acquireHolds(group.id);
    const refreshedGroup = await dbRentalCheckoutGroupRepo.getGroupWithLines(group.id);

    const responseBody = {
      group: refreshedGroup,
      holdResult,
      message: holdResult.ok
        ? "Rental holds acquired. Continue to the checkout group page to pay while holds are active."
        : holdResult.message ?? "One or more rental lines are unavailable.",
      paymentEnabled: true,
    };

    return NextResponse.json(responseBody, { status: holdResult.ok ? 201 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grouped checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
