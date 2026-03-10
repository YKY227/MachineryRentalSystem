import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  processOverdueInvoiceReminders,
} from "@/lib/rental/invoices/overdue-reminder-service";

export const runtime = "nodejs";

type ReminderBody = {
  invoiceId?: string;
  dryRun?: boolean;
  limit?: number;
  guardWindowHours?: number;
};

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const body = (await req.json()) as ReminderBody;
    const report = await processOverdueInvoiceReminders({
      invoiceId: body.invoiceId,
      dryRun: body.dryRun,
      limit: body.limit,
      guardWindowHours: body.guardWindowHours,
    });

    if (body.invoiceId?.trim()) {
      const result = report.results[0];
      if (!result) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      const status = result.status === "failed" ? 400 : 200;
      return NextResponse.json(
        {
          ok: result.status === "sent",
          guardWindowHours: report.policy.reminderGuardWindowHours,
          policy: report.policy,
          result,
          report,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: report.totalFailed === 0,
      guardWindowHours: report.policy.reminderGuardWindowHours,
      policy: report.policy,
      report,
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Reminder send failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
