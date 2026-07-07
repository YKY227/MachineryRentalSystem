import { NextResponse } from "next/server";

import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import { dbRentalEquipmentSaleEnquiryRepo } from "@/lib/rental/sale-enquiries/db-sale-enquiry-repo";
import type { EquipmentSaleFulfillmentMode } from "@/lib/rental/types";

export const runtime = "nodejs";

type SaleEnquiryBody = {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string | null;
  companyName?: string | null;
  fulfillmentPreference?: string | null;
  message?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ENQUIRY_STATUSES = new Set(["available_for_sale", "on_request"]);

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const trimmed = normalizeText(value);
  return trimmed || undefined;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const equipment = await dbRentalEquipmentRepo.getPublicByIdOrSlug(params.id);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found or not published" }, { status: 404 });
    }

    const sale = equipment.sale;
    const saleStatus = sale?.enabled ? sale.status : "not_available";
    if (!sale?.enabled) {
      return NextResponse.json({ error: "This equipment is not available for sale enquiries" }, { status: 400 });
    }
    if (!ALLOWED_ENQUIRY_STATUSES.has(saleStatus)) {
      const message =
        saleStatus === "sold"
          ? "This equipment has been sold and is no longer available for purchase enquiries"
          : "This equipment is not available for purchase enquiries";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as SaleEnquiryBody;
    const customerName = normalizeText(body.customerName);
    const customerEmail = normalizeText(body.customerEmail).toLowerCase();
    if (!customerName) throw new Error("Customer name is required");
    if (!customerEmail) throw new Error("Customer email is required");
    if (!EMAIL_RE.test(customerEmail)) throw new Error("Enter a valid customer email");

    const fulfillmentPreference = normalizeOptionalText(body.fulfillmentPreference);
    const fulfillmentModes = sale.fulfillmentModes ?? [];
    if (fulfillmentPreference) {
      if (
        !fulfillmentModes.includes(fulfillmentPreference as EquipmentSaleFulfillmentMode)
      ) {
        throw new Error("Selected sale fulfillment option is not available");
      }
    }

    const enquiry = await dbRentalEquipmentSaleEnquiryRepo.create({
      equipmentId: equipment.id,
      equipmentTitleSnapshot: equipment.title,
      saleStatusSnapshot: saleStatus,
      salePriceModeSnapshot: sale.priceMode,
      salePriceCentsSnapshot: sale.priceCents ?? null,
      saleConditionSnapshot: sale.condition ?? null,
      saleWarrantySnapshot: sale.warranty ?? null,
      customerName,
      customerEmail,
      customerPhone: normalizeOptionalText(body.customerPhone),
      companyName: normalizeOptionalText(body.companyName),
      fulfillmentPreference: fulfillmentPreference as EquipmentSaleFulfillmentMode | undefined,
      message: normalizeOptionalText(body.message),
    });

    return NextResponse.json({ enquiry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sale enquiry submission failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
