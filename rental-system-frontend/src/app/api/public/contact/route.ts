import { NextResponse } from "next/server";

import { guardContactSubmission } from "@/lib/public/contact/contact-submission-guard";
import { submitRentalContactEnquiry } from "@/lib/rental/contact-enquiries/contact-enquiry-service";

export const runtime = "nodejs";

type ContactBody = {
  name?: string;
  companyName?: string | null;
  email?: string;
  phone?: string | null;
  subject?: string;
  message?: string;
  website?: string | null;
  formStartedAt?: string | number | null;
};

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeOptionalString(value: unknown) {
  const trimmed = sanitizeString(value);
  return trimmed || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ContactBody;
    const guard = await guardContactSubmission({
      req,
      honeypot: body.website,
      formStartedAt: body.formStartedAt,
    });

    if (!guard.allowed) {
      return NextResponse.json({ error: guard.publicMessage }, { status: guard.status });
    }

    const name = sanitizeString(body.name);
    const email = sanitizeString(body.email).toLowerCase();
    const subject = sanitizeString(body.subject);
    const message = sanitizeString(body.message);
    const companyName = sanitizeOptionalString(body.companyName);
    const phone = sanitizeOptionalString(body.phone);

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (name.length > 120 || subject.length > 180 || message.length > 5000) {
      return NextResponse.json({ error: "Submitted enquiry is too long" }, { status: 400 });
    }
    if (companyName && companyName.length > 160) {
      return NextResponse.json({ error: "Company name is too long" }, { status: 400 });
    }
    if (phone && phone.length > 60) {
      return NextResponse.json({ error: "Phone number is too long" }, { status: 400 });
    }

    const result = await submitRentalContactEnquiry({
      name,
      companyName,
      email,
      phone,
      subject,
      message,
      source: "website_contact_form",
    });

    return NextResponse.json({
      ok: true,
      enquiryId: result.enquiryId,
      message: "Thanks for reaching out. Our team has received your enquiry.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contact enquiry submission failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
