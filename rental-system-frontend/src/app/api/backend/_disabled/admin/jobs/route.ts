// src/app/api/backend/admin/jobs/route.ts
import type { NextRequest } from "next/server";

const NEST_BASE =
  process.env.NEXT_PUBLIC_NEST_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const upstreamUrl =
      qs.length > 0
        ? `${NEST_BASE}/admin/jobs?${qs}`
        : `${NEST_BASE}/admin/jobs`;

    const upstream = await fetch(upstreamUrl, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error(
        "[proxy] GET /admin/jobs upstream failed",
        upstream.status,
        text
      );
      return new Response(
        JSON.stringify({ error: "Upstream error", status: upstream.status }),
        {
          status: upstream.status,
          headers: { "content-type": "application/json" },
        }
      );
    }

    return new Response(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[proxy] GET /admin/jobs threw", err);
    return new Response(JSON.stringify({ error: "Proxy crashed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    const upstream = await fetch(`${NEST_BASE}/admin/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error(
        "[proxy] POST /admin/jobs upstream failed",
        upstream.status,
        text
      );
      return new Response(
        JSON.stringify({ error: "Upstream error", status: upstream.status }),
        {
          status: upstream.status,
          headers: { "content-type": "application/json" },
        }
      );
    }

    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[proxy] POST /admin/jobs threw", err);
    return new Response(JSON.stringify({ error: "Proxy crashed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
