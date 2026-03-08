import { NextResponse } from "next/server";

import { setCustomerAuthCookie } from "@/lib/auth/customer";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LoginBody = {
  email?: string;
  password?: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LoginBody;
    const email = normalizeEmail(body.email ?? "");
    const password = body.password?.trim() ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    const authUserId = data.user?.id;
    if (!authUserId) throw new Error("Customer auth user not found");

    const customer =
      (await dbRentalCustomerRepo.findByAuthUserId(authUserId)) ??
      (await dbRentalCustomerRepo.ensureForAuthUser({
        authUserId,
        companyName:
          String(data.user?.user_metadata?.company_name ?? "").trim() ||
          String(data.user?.email ?? "").trim(),
        contactName:
          String(data.user?.user_metadata?.contact_name ?? "").trim() ||
          String(data.user?.email ?? "").trim(),
        email: data.user?.email ?? email,
      }));

    if (customer.accountStatus !== "active") {
      return NextResponse.json({ error: "Customer account is suspended" }, { status: 403 });
    }
    if (!data.session?.access_token) throw new Error("Customer session was not created");

    const res = NextResponse.json({ customer });
    setCustomerAuthCookie(res, data.session.access_token, data.session.expires_in ?? 3600);
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer login failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
