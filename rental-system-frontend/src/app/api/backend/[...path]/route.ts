// src/app/api/backend/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE =
  process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:3001";

function buildTargetUrl(req: NextRequest, pathSegments: string[]) {
  // pathSegments for /api/backend/admin/drivers should be ["admin","drivers"]
  // But if you accidentally included "backend" earlier, strip it safely.
  const clean = pathSegments?.[0] === "backend" ? pathSegments.slice(1) : pathSegments;

  const target = new URL(BACKEND_BASE);
  target.pathname = "/" + clean.join("/");
  target.search = req.nextUrl.search; // keep query string

  return target.toString();
}

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const url = buildTargetUrl(req, ctx.params.path || []);

  const headers = new Headers(req.headers);
  headers.delete("host");

  const res = await fetch(url, {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.arrayBuffer(),
    redirect: "manual",
  });

  const outHeaders = new Headers(res.headers);
  outHeaders.delete("content-encoding");

  return new NextResponse(res.body, {
    status: res.status,
    headers: outHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
