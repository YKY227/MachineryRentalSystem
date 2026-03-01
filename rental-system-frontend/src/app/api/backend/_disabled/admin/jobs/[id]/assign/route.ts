// src/app/api/backend/admin/jobs/[id]/assign/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3000";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = params;

  // Read body as text to pass through 1:1
  const bodyText = await req.text();

  const res = await fetch(`${BACKEND_URL}/admin/jobs/${id}/assign`, {
    method: "PATCH",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
    body: bodyText,
  });

  const responseText = await res.text();

  // Pass through status + body from Nest
  return new NextResponse(responseText, {
    status: res.status,
    headers: {
      "Content-Type":
        res.headers.get("content-type") || "application/json",
    },
  });
}
