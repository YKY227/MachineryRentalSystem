import { NextResponse } from "next/server";

import { setCustomerAuthCookie } from "@/lib/auth/customer";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RegisterBody = {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  uen?: string;
  address?: string;
  password?: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;
    const companyName = body.companyName?.trim() ?? "";
    const contactName = body.contactName?.trim() ?? "";
    const email = normalizeEmail(body.email ?? "");
    const password = body.password?.trim() ?? "";

    if (!companyName) return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    if (!contactName) return NextResponse.json({ error: "Contact name is required" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        company_name: companyName,
        contact_name: contactName,
      },
    });

    if (createError) throw new Error(createError.message);
    const authUserId = created.user?.id;
    if (!authUserId) throw new Error("Customer auth user was not created");

    const customer = await dbRentalCustomerRepo.ensureForAuthUser({
      authUserId,
      companyName,
      contactName,
      email,
      phone: body.phone,
      uen: body.uen,
      address: body.address,
      vettingStatus: "new",
      paymentTerms: "upfront",
      accountStatus: "active",
    });

    const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw new Error(signInError.message);
    if (!sessionData.session?.access_token) throw new Error("Customer session was not created");

    const res = NextResponse.json({ customer });
    setCustomerAuthCookie(res, sessionData.session.access_token, sessionData.session.expires_in ?? 3600);
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
