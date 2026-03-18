import { NextResponse } from "next/server";

import { createCustomerPasswordResetRequest } from "@/lib/auth/customer-password-reset";

export const runtime = "nodejs";

type Body = {
  email?: string;
};

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = body.email?.trim() ?? "";

    if (email) {
      await createCustomerPasswordResetRequest(req, email);
    }

    return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
  } catch {
    return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
  }
}
