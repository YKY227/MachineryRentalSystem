"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";

export default function RentalCustomerRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = useMemo(() => searchParams?.get("next") || "/rental/checkout", [searchParams]);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [uen, setUen] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch("/api/public/rental/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName,
          email,
          phone,
          uen,
          address,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Registration failed");

      router.push(nextUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      badgeIcon={UserPlus}
      badgeLabel="Customer account setup"
      title="Create your Teesin rental customer account."
      description="Set up your company and contact access once, then use the same customer portal for rentals, invoices, deposits, and payments."
      panelTitle="Before you continue"
      panelDescription="New customer accounts default to upfront payment until admin vetting is completed. Your registration flow and redirects remain unchanged."
      panelItems={[
        {
          icon: Users,
          title: "Company + contact ready",
          detail: "Provide the main company and contact details used for portal access, billing, and rental communication.",
        },
        {
          icon: CreditCard,
          title: "Upfront by default",
          detail: "New accounts begin on upfront terms and can move through the existing vetting workflow later.",
        },
      ]}
    >
      <div>
        <h2 className="text-xl font-semibold text-[#2A2A2A]">Customer registration</h2>
        <p className="mt-2 text-sm text-slate-600">
          Create an account for your company so future rentals, invoices, and account activity remain linked to one customer record.
        </p>

        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <Building2 className="h-4 w-4 text-[#D24338]" />
              Company name
            </span>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <Users className="h-4 w-4 text-[#D24338]" />
              Contact name
            </span>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <Phone className="h-4 w-4 text-[#D24338]" />
              Phone
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <Mail className="h-4 w-4 text-[#D24338]" />
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
              autoComplete="email"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <KeyRound className="h-4 w-4 text-[#D24338]" />
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <ShieldCheck className="h-4 w-4 text-[#D24338]" />
              UEN
            </span>
            <input
              type="text"
              value={uen}
              onChange={(e) => setUen(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
            />
          </label>

          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <MapPin className="h-4 w-4 text-[#D24338]" />
              Address
            </span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="min-h-24 rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-[#D24338] px-4 py-3 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300 sm:col-span-2"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-600">
          Already registered?{" "}
          <Link
            href={`/rental/account/login?next=${encodeURIComponent(nextUrl)}`}
            className="font-medium text-[#B9382E] hover:text-[#D24338]"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
