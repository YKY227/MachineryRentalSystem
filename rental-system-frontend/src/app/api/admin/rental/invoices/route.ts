import { NextResponse } from "next/server";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import {
  loadAdminInvoiceListPage,
  parseAdminInvoiceListQuery,
} from "@/lib/rental/invoices/admin-invoice-list";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import type { InvoiceListItem } from "@/lib/rental/invoices/types";

export const runtime = "nodejs";

function requireInvoiceEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    requireInvoiceEnv();

    const { searchParams } = new URL(req.url);
    const orderId = (searchParams.get("orderId") ?? "").trim();
    const orderIdsRaw = (searchParams.get("orderIds") ?? "").trim();

    if (!orderId && !orderIdsRaw) {
      const query = parseAdminInvoiceListQuery(searchParams);
      const pageResult = await loadAdminInvoiceListPage(query);
      console.log("[invoice-api] GET list", {
        invoiceCount: pageResult.items.length,
        totalItems: pageResult.totalItems,
        lifecycleStatus: query.lifecycleStatus ?? null,
        paymentStatus: query.paymentStatus ?? null,
        hasQuery: Boolean(query.q),
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      });
      return NextResponse.json({
        items: pageResult.items satisfies InvoiceListItem[],
        pagination: {
          page: pageResult.page,
          pageSize: pageResult.pageSize,
          totalItems: pageResult.totalItems,
          totalPages: pageResult.totalPages,
        },
      });
    }

    if (orderId) {
      const invoice = await dbInvoiceRepo.findActiveByOrderId(orderId);
      console.log("[invoice-api] GET by orderId", { orderId, found: Boolean(invoice) });
      return NextResponse.json({ invoice });
    }

    if (orderIdsRaw) {
      const orderIds = orderIdsRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      const invoices = await dbInvoiceRepo.listByOrderIds(orderIds);
      console.log("[invoice-api] GET by orderIds", { orderCount: orderIds.length, invoiceCount: invoices.length });
      return NextResponse.json({ invoices });
    }

  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice query failed";
    console.log("[invoice-api] GET failed", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    requireInvoiceEnv();

    const body = (await req.json()) as { orderId?: string };
    const orderId = (body?.orderId ?? "").trim();

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const existing = await dbInvoiceRepo.findActiveByOrderId(orderId);
    if (existing) return NextResponse.json({ invoice: existing });

    const order = await dbOrderRepo.get(orderId);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const invoice = await dbInvoiceRepo.createDraftFromOrder({
      orderId: order.id,
      customerId: order.customerId,
      customerSnapshot: order.customerSnapshot,
      equipmentTitle: order.equipmentTitle,
      qty: order.qty,
      start: order.start,
      end: order.end,
      pricingSnapshot: {
        rentalSubtotal: order.pricingSnapshot.rentalSubtotal,
        deliveryFee: order.pricingSnapshot.deliveryFee,
        collectionFee: order.pricingSnapshot.collectionFee,
        deposit: order.pricingSnapshot.deposit,
        total: order.pricingSnapshot.total,
      },
    });

    await dbRentalDepositRepo.ensureOrderDeposit({
      orderId: order.id,
      customerId: order.customerId,
      requiredAmountCents: Math.round(Number(order.pricingSnapshot?.deposit ?? 0) * 100),
      sourceInvoiceId: invoice.id,
    });

    console.log("[invoice-api] POST createDraftFromOrder success", {
      orderId: order.id,
      invoiceId: invoice.id,
      status: invoice.status,
      invoiceNo: invoice.invoiceNo ?? null,
    });

    return NextResponse.json({ invoice });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice create failed";
    console.log("[invoice-api] POST createDraftFromOrder failed", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
