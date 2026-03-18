import "server-only";

import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";
import { supabaseAdmin } from "@/lib/supabase/server";

type DeleteRentalOrderRpcResult = {
  orderId: string;
  deleted: boolean;
  reason?: string;
  invoiceEmailCount?: number;
  paymentAllocationCount?: number;
  extensionCount?: number;
  holdCount?: number;
  invoiceCount?: number;
  orderCount?: number;
};

export type DeleteRentalOrderResult =
  | {
      orderId: string;
      status: "deleted";
      summary: DeleteRentalOrderRpcResult;
    }
  | {
      orderId: string;
      status: "not_found";
    };

export type DeleteRentalOrdersBatchResult = {
  deletedCount: number;
  skippedCount: number;
  results: DeleteRentalOrderResult[];
  failedIds: Array<{ orderId: string; error: string }>;
};

async function assertDeveloperDeleteToolsEnabled() {
  const operationsPolicy = await dbAdminSettingsRepo.getOperationsPolicy();
  if (!operationsPolicy.enableDeveloperDeleteTools) {
    throw new Error("Developer delete tools are disabled");
  }
}

function normalizeOrderIds(orderIds: string[]) {
  return [...new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean))];
}

export async function deleteRentalOrder(orderId: string): Promise<DeleteRentalOrderResult> {
  await assertDeveloperDeleteToolsEnabled();

  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new Error("Order id is required");
  }

  const order = await dbOrderRepo.get(normalizedOrderId);
  if (!order) {
    return {
      orderId: normalizedOrderId,
      status: "not_found",
    };
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc("developer_delete_rental_order", {
    p_order_id: normalizedOrderId,
  });

  if (error) {
    throw new Error(`Rental order delete failed: ${error.message}`);
  }

  const summary = (data ?? {}) as DeleteRentalOrderRpcResult;
  if (!summary.deleted) {
    throw new Error(summary.reason ? `Rental order delete failed: ${summary.reason}` : "Rental order delete failed");
  }

  return {
    orderId: normalizedOrderId,
    status: "deleted",
    summary,
  };
}

export async function deleteRentalOrders(orderIds: string[]): Promise<DeleteRentalOrdersBatchResult> {
  await assertDeveloperDeleteToolsEnabled();

  const normalizedOrderIds = normalizeOrderIds(orderIds);
  const results: DeleteRentalOrderResult[] = [];
  const failedIds: Array<{ orderId: string; error: string }> = [];

  for (const orderId of normalizedOrderIds) {
    try {
      results.push(await deleteRentalOrder(orderId));
    } catch (error) {
      failedIds.push({
        orderId,
        error: error instanceof Error ? error.message : "Rental order delete failed",
      });
    }
  }

  return {
    deletedCount: results.filter((result) => result.status === "deleted").length,
    skippedCount: results.filter((result) => result.status === "not_found").length,
    results,
    failedIds,
  };
}
