import "server-only";

import crypto from "crypto";

import { Resend } from "resend";

import { customerPasswordResetRepo } from "@/lib/auth/customer-password-reset-repo";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import type { RentalCustomer } from "@/lib/rental/orders/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_GUARD_WINDOW_MS = 15 * 60 * 1000;
const RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RESET_RATE_LIMIT_MAX_REQUESTS = 5;

type EmailProvider = "mock" | "resend" | "ses" | "postmark";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createProvider() {
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase() as EmailProvider;
  const from = provider === "resend" ? mustEnv("RESEND_FROM") : "mock";
  const resend = provider === "resend" ? new Resend(mustEnv("RESEND_API_KEY")) : null;
  return { provider, from, resend };
}

function deriveAppOrigin(req: Request) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin.replace(/\/+$/, "");
}

async function sendPasswordResetEmail(input: {
  req: Request;
  customer: RentalCustomer;
  token: string;
}) {
  const { provider, from, resend } = createProvider();
  const resetLink = `${deriveAppOrigin(input.req)}/rental/reset-password?token=${encodeURIComponent(input.token)}`;
  const subject = "Reset your rental account password";
  const customerName = input.customer.contactName.trim() || input.customer.companyName.trim() || "Customer";

  if (provider === "mock") {
    return { provider, providerMessageId: `mock_${Date.now()}`, resetLink };
  }

  const result = await resend!.emails.send({
    from,
    to: input.customer.email,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif; line-height:1.5">
        <p>Dear ${customerName},</p>
        <p>We received a request to reset your rental customer account password.</p>
        <p>
          <a href="${resetLink}">Reset your password</a>
        </p>
        <p>This link expires in 1 hour. If you did not request this reset, you can ignore this email.</p>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    provider,
    providerMessageId: result.data?.id ?? null,
    resetLink,
  };
}

export function hashCustomerPasswordResetToken(token: string) {
  return hashToken(token);
}

export async function createCustomerPasswordResetRequest(req: Request, email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  const customer = await dbRentalCustomerRepo.findByEmail(normalizedEmail);
  if (!customer?.authUserId) return;

  const now = Date.now();
  const recentResets = await customerPasswordResetRepo.listRecentByCustomer(
    customer.id,
    new Date(now - RESET_RATE_LIMIT_WINDOW_MS).toISOString()
  );

  if (recentResets.length >= RESET_RATE_LIMIT_MAX_REQUESTS) return;

  const newestReset = recentResets[0];
  if (newestReset) {
    const newestCreatedAt = new Date(newestReset.createdAt).getTime();
    if (Number.isFinite(newestCreatedAt) && now - newestCreatedAt < RESET_GUARD_WINDOW_MS) {
      return;
    }
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now + RESET_TOKEN_TTL_MS).toISOString();

  await customerPasswordResetRepo.create({
    customerId: customer.id,
    tokenHash,
    expiresAt,
  });

  await sendPasswordResetEmail({
    req,
    customer,
    token,
  });
}

export async function validateCustomerPasswordResetToken(token: string): Promise<{
  valid: boolean;
  customer?: RentalCustomer;
  resetId?: string;
}> {
  const tokenHash = hashToken(token.trim());
  if (!tokenHash) return { valid: false };

  const reset = await customerPasswordResetRepo.findByTokenHash(tokenHash);
  if (!reset || reset.usedAt) return { valid: false };

  const expiresAt = new Date(reset.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { valid: false };

  const customer = await dbRentalCustomerRepo.getById(reset.customerId);
  if (!customer?.authUserId) return { valid: false };

  return {
    valid: true,
    customer,
    resetId: reset.id,
  };
}

export async function resetCustomerPassword(input: {
  token: string;
  password: string;
}): Promise<void> {
  const validation = await validateCustomerPasswordResetToken(input.token);
  if (!validation.valid || !validation.customer?.authUserId || !validation.resetId) {
    throw new Error("Reset link is invalid or expired");
  }

  const password = input.password.trim();
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.auth.admin.updateUserById(validation.customer.authUserId, {
    password,
  });
  if (error) throw new Error(`Password reset failed: ${error.message}`);

  const usedAt = new Date().toISOString();
  await customerPasswordResetRepo.markUsed(validation.resetId, usedAt);
  await customerPasswordResetRepo.invalidateOtherActiveTokens(
    validation.customer.id,
    usedAt,
    validation.resetId
  );
}
