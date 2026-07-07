"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";

function RentalCustomerLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = useMemo(() => searchParams?.get("next") || "/rental/checkout", [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch("/api/public/rental/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Login failed");

      router.push(nextUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      badgeIcon={LogIn}
      badgeLabel="Customer portal access"
      title="Sign in to your rental customer account."
      description="Access bookings, invoices, payments, deposit status, and extension requests through the Teesin customer portal."
      panelTitle="Customer account entry"
      panelDescription="Sign in with the customer account linked to your rental activity. Existing checkout and redirect behavior stays unchanged."
      panelItems={[
        {
          icon: ShieldCheck,
          title: "Portal-linked rentals",
          detail: "Bookings, invoices, payments, and notices remain tied to your customer account records.",
        },
        {
          icon: Building2,
          title: "Company-aware access",
          detail: "Use the account associated with your company profile so operational and billing history stay in one place.",
        },
      ]}
    >
      <div>
        <h2 className="text-xl font-semibold text-[#2A2A2A]">Customer sign-in</h2>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to continue as a customer. If you started browsing equipment first, you will return to the same flow after login.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
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
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#D24338] px-4 py-3 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-5 space-y-3 text-sm text-slate-600">
          <p>
            <Link href="/rental/forgot-password" className="font-medium text-[#B9382E] hover:text-[#D24338]">
              Forgot your password?
            </Link>
          </p>

          <p>
            New customer account?{" "}
            <Link
              href={`/rental/account/register?next=${encodeURIComponent(nextUrl)}`}
              className="font-medium text-[#B9382E] hover:text-[#D24338]"
            >
              Register here
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}

export default function RentalCustomerLoginPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-600">Loading sign-in...</div>}>
      <RentalCustomerLoginContent />
    </Suspense>
  );
}
