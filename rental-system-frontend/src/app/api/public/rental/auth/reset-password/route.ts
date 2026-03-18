import { NextResponse } from "next/server";

import {
  resetCustomerPassword,
  validateCustomerPasswordResetToken,
} from "@/lib/auth/customer-password-reset";

export const runtime = "nodejs";

type Body = {
  token?: string;
  password?: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token")?.trim() ?? "";
    const validation = token ? await validateCustomerPasswordResetToken(token) : { valid: false };
    return NextResponse.json({ valid: validation.valid });
  } catch {
    return NextResponse.json({ valid: false });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const token = body.token?.trim() ?? "";
    const password = body.password?.trim() ?? "";

    if (!token) {
      return NextResponse.json({ error: "Missing reset token" }, { status: 400 });
    }

    await resetCustomerPassword({ token, password });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
