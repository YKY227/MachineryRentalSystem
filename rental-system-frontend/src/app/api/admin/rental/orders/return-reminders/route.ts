import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { processReturnReminderAutomation } from "@/lib/rental/orders/return-reminder-service";

export const runtime = "nodejs";

type ReminderBody = {
  orderId?: string;
  dryRun?: boolean;
  limit?: number;
  reminderDays?: number[];
  includeDueToday?: boolean;
};

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const body = (await req.json()) as ReminderBody;
    const report = await processReturnReminderAutomation({
      orderId: body.orderId,
      dryRun: body.dryRun,
      limit: body.limit,
      reminderDays: body.reminderDays,
      includeDueToday: body.includeDueToday,
    });

    if (body.orderId?.trim()) {
      const result = report.results[0];
      if (!result) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      const status = result.status === "failed" ? 400 : 200;
      return NextResponse.json(
        {
          ok: result.status === "sent",
          policy: report.policy,
          result,
          report,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: report.totalFailed === 0,
      policy: report.policy,
      report,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Return reminder run failed";
    const status = message === "Order not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
