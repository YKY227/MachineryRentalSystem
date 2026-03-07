import "server-only";

import { NextResponse } from "next/server";

export const ADMIN_AUTH_COOKIE = "admin_key";

export class AdminUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AdminUnauthorizedError";
  }
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const pair of cookieHeader.split(";")) {
    const [rawName, ...rest] = pair.trim().split("=");
    if (rawName !== name) continue;
    return decodeURIComponent(rest.join("=") || "");
  }

  return null;
}

export function assertAdmin(req: Request): void {
  const expected = (process.env.ADMIN_API_KEY ?? "").trim();
  if (!expected) {
    throw new Error("ADMIN_API_KEY is not configured");
  }

  const headerKey = (req.headers.get("x-admin-key") ?? "").trim();
  const cookieKey = (readCookie(req, ADMIN_AUTH_COOKIE) ?? "").trim();
  const provided = headerKey || cookieKey;

  if (!provided || provided !== expected) {
    throw new AdminUnauthorizedError();
  }
}

export function isAdminUnauthorized(error: unknown): boolean {
  return error instanceof AdminUnauthorizedError;
}

export function adminUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
