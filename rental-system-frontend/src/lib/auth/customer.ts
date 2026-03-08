import "server-only";

import { NextResponse } from "next/server";

import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import type { RentalCustomer } from "@/lib/rental/orders/types";
import { supabaseAdmin } from "@/lib/supabase/server";

export const CUSTOMER_AUTH_COOKIE = "rental_customer_access_token";

export class CustomerUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "CustomerUnauthorizedError";
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

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setCustomerAuthCookie(res: NextResponse, accessToken: string, maxAgeSeconds: number) {
  res.cookies.set({
    name: CUSTOMER_AUTH_COOKIE,
    value: accessToken,
    ...cookieOptions(maxAgeSeconds),
  });
}

export function clearCustomerAuthCookie(res: NextResponse) {
  res.cookies.set({
    name: CUSTOMER_AUTH_COOKIE,
    value: "",
    ...cookieOptions(0),
  });
}

export async function getAuthenticatedCustomer(req: Request): Promise<RentalCustomer | null> {
  const accessToken = (readCookie(req, CUSTOMER_AUTH_COOKIE) ?? "").trim();
  if (!accessToken) return null;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.id) return null;

  return dbRentalCustomerRepo.findByAuthUserId(data.user.id);
}

export async function assertCustomer(req: Request): Promise<RentalCustomer> {
  const customer = await getAuthenticatedCustomer(req);
  if (!customer) throw new CustomerUnauthorizedError();
  return customer;
}

export function isCustomerUnauthorized(error: unknown): boolean {
  return error instanceof CustomerUnauthorizedError;
}

export function customerUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
