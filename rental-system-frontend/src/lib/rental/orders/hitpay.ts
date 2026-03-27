//src/lib/rental/orders/hitpay.ts
import "server-only";

import crypto from "node:crypto";

type HitPayPaymentStatus = "pending" | "paid" | "failed" | "expired" | "cancelled";

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function hitpayBaseUrl() {
  return (process.env.HITPAY_API_BASE_URL ?? "https://api.sandbox.hit-pay.com").replace(/\/+$/, "");
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

async function hitpayRequest(path: string, init?: RequestInit) {
  const apiKey = mustEnv("HITPAY_API_KEY");
  const res = await fetch(`${hitpayBaseUrl()}${path}`, {
    ...init,
    headers: {
      "X-BUSINESS-API-KEY": apiKey,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message ?? "HitPay request failed");
  }
  return data as Record<string, unknown>;
}

function mapHitPayStatus(input?: string): HitPayPaymentStatus {
  switch ((input ?? "").toLowerCase()) {
    case "completed":
    case "succeeded":
    case "paid":
      return "paid";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "pending":
    default:
      return "pending";
  }
}

export function getCheckoutStatusPageUrl(sessionId: string) {
  const baseUrl = appBaseUrl();
  if (!baseUrl) throw new Error("Missing env: APP_BASE_URL");
  return `${baseUrl}/rental/checkout/status?sessionId=${encodeURIComponent(sessionId)}`;
}

export function getCheckoutOrderStatusPageUrl(orderId: string) {
  const baseUrl = appBaseUrl();
  if (!baseUrl) throw new Error("Missing env: APP_BASE_URL");
  return `${baseUrl}/rental/checkout/status?orderId=${encodeURIComponent(orderId)}`;
}

export async function createHitPayPaymentRequest(input: {
  amountCents: number;
  currency: string;
  purpose: string;
  referenceNumber: string;
  redirectUrl: string;
}) {
  const form = new URLSearchParams();
  form.set("amount", (input.amountCents / 100).toFixed(2));
  form.set("currency", input.currency);
  form.set("purpose", input.purpose);
  form.set("reference_number", input.referenceNumber);
  form.set("redirect_url", input.redirectUrl);

  const data = await hitpayRequest("/v1/payment-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  return {
    id: String(data.id ?? ""),
    url: String(data.url ?? ""),
    referenceNumber: String(data.reference_number ?? input.referenceNumber),
    status: mapHitPayStatus(typeof data.status === "string" ? data.status : undefined),
    raw: data,
  };
}

export async function fetchHitPayPaymentRequest(paymentRequestId: string) {
  const data = await hitpayRequest(`/v1/payment-requests/${encodeURIComponent(paymentRequestId)}`, {
    method: "GET",
  });

  return {
    id: String(data.id ?? paymentRequestId),
    referenceNumber: String(data.reference_number ?? ""),
    status: mapHitPayStatus(typeof data.status === "string" ? data.status : undefined),
    paidAt:
      typeof data.payment_request_completed === "string"
        ? data.payment_request_completed
        : typeof data.updated_at === "string"
          ? data.updated_at
          : undefined,
    raw: data,
  };
}

function safeCompareHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function verifyHitPayWebhookSignature(
  rawBody: string,
  input: { headerSignature?: string | null; formHmac?: string | null }
) {
  const salt = mustEnv("HITPAY_WEBHOOK_SALT");
  const formHmac = (input.formHmac ?? "").trim();
  if (formHmac) {
    const params = new URLSearchParams(rawBody);
    const source: string[] = [];
    const keys = Array.from(new Set(Array.from(params.keys())))
      .filter((key) => key !== "hmac")
      .sort((a, b) => a.localeCompare(b));

    for (const key of keys) {
      for (const value of params.getAll(key)) {
        source.push(`${key}${value}`);
      }
    }

    const expected = crypto.createHmac("sha256", salt).update(source.join("")).digest("hex");
    return safeCompareHex(expected, formHmac);
  }

  const headerSignature = (input.headerSignature ?? "").trim();
  if (!headerSignature) return false;

  const expected = crypto.createHmac("sha256", salt).update(rawBody).digest("hex");
  return safeCompareHex(expected, headerSignature);
}
