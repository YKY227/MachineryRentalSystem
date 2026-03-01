// src/app/api/backend/admin/drivers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3000";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const res = await fetch(`${BACKEND_URL}/admin/drivers/${params.id}`, {
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

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const bodyText = await req.text();

  const res = await fetch(`${BACKEND_URL}/admin/drivers/${params.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    body: bodyText,
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
