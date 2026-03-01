// src/app/api/backend/admin/drivers/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(_req: NextRequest) {
  const res = await fetch(`${BACKEND_URL}/admin/drivers`, {
    method: "GET",
  });

  const text = await res.text();

  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type":
        res.headers.get("content-type") ?? "application/json",
    },
  });
}
