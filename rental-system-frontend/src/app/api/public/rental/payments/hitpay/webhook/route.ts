//rental-system-frontend/src/app/api/public/rental/payments/hitpay/webhook/route.ts
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import {
  fetchHitPayPaymentRequest,
  verifyHitPayWebhookSignature,
} from "@/lib/rental/orders/hitpay";
import { runPaymentSessionAutomation } from "@/lib/rental/orders/payment-session-reconciliation";

export const runtime = "nodejs";

type HitPayWebhookPayload = Record<string, unknown>;

function toWebhookPayload(rawBody: string, contentType: string | null) {
  if ((contentType ?? "").toLowerCase().includes("application/json")) {
    return JSON.parse(rawBody) as HitPayWebhookPayload;
  }

  return Object.fromEntries(new URLSearchParams(rawBody).entries()) as HitPayWebhookPayload;
}

function getPayloadString(payload: HitPayWebhookPayload, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function getPayloadObject(payload: HitPayWebhookPayload, key: string) {
  const value = payload[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as HitPayWebhookPayload)
    : null;
}

function resolvePaymentRequestId(payload: HitPayWebhookPayload) {
  const direct =
    getPayloadString(payload, "payment_request_id") ||
    getPayloadString(payload, "id") ||
    getPayloadString(payload, "reference_number") ||
    getPayloadString(payload, "reference");

  if (direct) return direct;

  const data = getPayloadObject(payload, "data");
  if (!data) return "";

  return (
    getPayloadString(data, "payment_request_id") ||
    getPayloadString(data, "id") ||
    getPayloadString(data, "reference_number") ||
    getPayloadString(data, "reference")
  );
}

function requireWebhookEnv() {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "HITPAY_API_KEY",
    "HITPAY_WEBHOOK_SALT",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

export async function POST(req: Request) {
  try {
    requireWebhookEnv();

    const rawBody = await req.text();
    const contentType = req.headers.get("content-type");
    const payload = toWebhookPayload(rawBody, contentType);
    const headerSignature =
      req.headers.get("Hitpay-Signature") ??
      req.headers.get("hitpay-signature") ??
      req.headers.get("x-hitpay-signature") ??
      req.headers.get("X-Hitpay-Signature");
    const formHmac = getPayloadString(payload, "hmac") || null;

    if (!headerSignature && !formHmac) {
      console.error("[hitpay-webhook] missing signature", {
        contentType,
        payloadKeys: Object.keys(payload),
      });
      return new Response("Missing signature", { status: 401 });
    }

    if (!verifyHitPayWebhookSignature(rawBody, { headerSignature, formHmac })) {
      console.error("[hitpay-webhook] signature mismatch", {
        hasHeaderSignature: Boolean(headerSignature),
        hasFormHmac: Boolean(formHmac),
        contentType,
      });
      return new Response("Invalid signature", { status: 401 });
    }

    const paymentRequestId = resolvePaymentRequestId(payload);

    if (!paymentRequestId) {
      console.error("[hitpay-webhook] missing payment request id", {
        payloadKeys: Object.keys(payload),
        contentType,
      });
      return new Response("Missing payment request id", { status: 400 });
    }

    const session = await dbOrderPaymentSessionRepo.findByProviderPaymentRequestId(paymentRequestId);
    if (!session) {
      console.log("[hitpay-webhook] session not found", { paymentRequestId });
      return new Response("ok", { status: 200 });
    }

    let providerState;
    try {
      providerState = await fetchHitPayPaymentRequest(paymentRequestId);
    } catch (error) {
      console.error("[hitpay-webhook] provider status fetch failed", {
        stage: "provider_status_fetch",
        paymentRequestId,
        sessionId: session.id,
        contentType,
        error: describeError(error),
      });
      return new Response("Webhook processing failed", { status: 400 });
    }

    let nextSession;
    try {
      nextSession = await dbOrderPaymentSessionRepo.update(session.id, {
        providerReferenceNumber: providerState.referenceNumber || session.providerReferenceNumber,
        status: providerState.status,
        webhookPayload: {
          webhook: payload,
          provider: providerState.raw,
        },
        paidAt:
          providerState.status === "paid"
            ? providerState.paidAt ?? session.paidAt ?? new Date().toISOString()
            : session.paidAt,
      });
    } catch (error) {
      console.error("[hitpay-webhook] payment session update failed", {
        stage: "payment_session_update",
        paymentRequestId,
        sessionId: session.id,
        contentType,
        providerStatus: providerState.status,
        error: describeError(error),
      });
      return new Response("Webhook processing failed", { status: 400 });
    }

    if (nextSession.status === "paid") {
      try {
        await runPaymentSessionAutomation({
          session: nextSession,
          source: "hitpay_webhook",
        });
      } catch (error) {
        const failedAt = new Date().toISOString();
        console.error("[hitpay-webhook] invoice automation failed", {
          stage: "invoice_automation",
          paymentRequestId,
          sessionId: nextSession.id,
          contentType,
          error: describeError(error),
        });

        try {
          await dbOrderPaymentSessionRepo.update(nextSession.id, {
            webhookPayload: {
              ...(nextSession.webhookPayload ?? {}),
              automation: {
                status: "failed",
                failedAt,
                error: describeError(error),
              },
            },
          });
        } catch (updateError) {
          console.error("[hitpay-webhook] invoice automation failure marker update failed", {
            stage: "invoice_automation_failure_marker",
            paymentRequestId,
            sessionId: nextSession.id,
            error: describeError(updateError),
          });
        }

        return new Response("ok", { status: 200 });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[hitpay-webhook] unexpected failure", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return new Response("Webhook processing failed", { status: 400 });
  }
}
