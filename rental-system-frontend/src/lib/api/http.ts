// src/lib/api/http.ts

let backendDownUntil = 0;

function makeRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function markBackendDown(ms = 15_000) {
  backendDownUntil = Date.now() + ms;
  console.warn("[backend] marked DOWN until", new Date(backendDownUntil).toISOString());
}

export function isBackendDown() {
  return Date.now() < backendDownUntil;
}

function shouldMarkBackendDownByStatus(status: number) {
  // ✅ Only backend/server issues, not client mistakes
  return status >= 500;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorMessage(parsed: any, fallbackText: string) {
  if (!parsed) return fallbackText.slice(0, 200);

  // NestJS default: { message: string[] | string, error: string, statusCode: number }
  const msg = parsed.message ?? parsed.error ?? parsed.detail ?? parsed.title;

  if (Array.isArray(msg)) return msg.join(" | ");
  if (typeof msg === "string") return msg;

  // Sometimes custom format: { ok:false, ... }
  if (typeof parsed === "object") return JSON.stringify(parsed).slice(0, 200);

  return fallbackText.slice(0, 200);
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const requestId = makeRequestId();

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("x-request-id", requestId);

  let res: Response;
  let text = "";

  try {
    res = await fetch(url, { ...init, headers });
    text = await res.text();
  } catch (err) {
    // 🚨 Network-level failure → backend likely down
    markBackendDown();
    console.error("[fetchJson] NETWORK ERROR", { requestId, url, error: err });

    throw new Error(`[${requestId}] Network error while calling ${url}. Backend may be down.`);
  }

  const contentType = res.headers.get("content-type") || "";

  // ❌ HTML response (proxy / wrong server / Next.js fallback) => backend/proxy broken
  if (contentType.includes("text/html")) {
    markBackendDown();
    console.error("[fetchJson] HTML RESPONSE (WRONG BACKEND)", {
      requestId,
      url,
      status: res.status,
      preview: text.slice(0, 200),
    });

    throw new Error(`[${requestId}] Expected JSON but received HTML. Proxy/routing is broken.`);
  }

  const parsed = contentType.includes("application/json") ? safeJsonParse(text) : null;

  // ❌ Non-OK HTTP status
  if (!res.ok) {
    // ✅ only mark backend down for 5xx (server errors)
    if (shouldMarkBackendDownByStatus(res.status)) {
      markBackendDown();
    }

    const msg = extractErrorMessage(parsed, text);

    console.error("[fetchJson] HTTP ERROR", {
      requestId,
      url,
      status: res.status,
      statusText: res.statusText,
      contentType,
      msg,
      preview: text.slice(0, 200),
    });

    throw new Error(`[${requestId}] ${res.status} @ ${url} :: ${msg}`);
  }

  // ✅ If response is JSON, return parsed JSON (even if empty body)
  if (contentType.includes("application/json")) {
    if (parsed === null) {
      // JSON parse failed on OK response => backend is returning invalid JSON
      markBackendDown();
      console.error("[fetchJson] JSON PARSE ERROR", {
        requestId,
        url,
        contentType,
        preview: text.slice(0, 200),
      });
      throw new Error(`[${requestId}] Invalid JSON from backend: ${text.slice(0, 200)}`);
    }
    return parsed as T;
  }

  // ✅ Fallback: allow non-JSON OK responses (rare), return text as any
  return text as unknown as T;
}

export async function pingHealth(apiBaseUrl: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/health`, { method: "GET" });
    if (!res.ok) throw new Error("health not ok");

    backendDownUntil = 0;
    console.info("[backend] health check OK");
    return true;
  } catch {
    markBackendDown();
    return false;
  }
}
