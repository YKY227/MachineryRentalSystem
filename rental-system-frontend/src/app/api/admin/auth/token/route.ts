import { NextResponse } from "next/server";

import { ADMIN_AUTH_COOKIE } from "@/lib/auth/admin";

export const runtime = "nodejs";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const DEMO_EMAIL = "ops@example.com";
const DEMO_PASSWORD = "demo1234";

function configuredAdminKey() {
  const key = (process.env.ADMIN_API_KEY ?? "").trim();
  if (!key) throw new Error("ADMIN_API_KEY is not configured");
  return key;
}

export async function POST(req: Request) {
  try {
    const expected = configuredAdminKey();
    const body = (await req.json()) as {
      key?: string;
      email?: string;
      password?: string;
    };

    const providedKey = (body?.key ?? "").trim();
    const providedEmail = (body?.email ?? "").trim().toLowerCase();
    const providedPassword = (body?.password ?? "").trim();
    const demoMatch =
      providedEmail === DEMO_EMAIL && providedPassword === DEMO_PASSWORD;
    const keyMatch = Boolean(providedKey) && providedKey === expected;

    if (!demoMatch && !keyMatch) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: ADMIN_AUTH_COOKIE,
      value: expected,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Auth token failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
