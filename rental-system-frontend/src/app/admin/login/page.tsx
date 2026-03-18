"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { loginAdmin } from "@/lib/admin-auth";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("ops@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Invalid credentials. Use ops@example.com / demo1234.");
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? "Login failed");

      await loginAdmin(email, password);
      router.replace("/admin");
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      badgeIcon={LayoutDashboard}
      badgeLabel="Operations access"
      title="Sign in to the Teesin admin operations area."
      description="Access operational tools for equipment, scheduling, invoices, reminders, downtime, and customer account review."
      panelTitle="Admin access context"
      panelDescription="This page is intentionally more restrained than the customer auth flow. Public browsing remains customer-first, while admin access stays operational."
      panelItems={[
        {
          icon: ShieldCheck,
          title: "Operational controls",
          detail: "Admin access is used for scheduling, order review, invoicing, equipment management, and maintenance operations.",
        },
        {
          icon: LockKeyhole,
          title: "Separate from customer checkout",
          detail: "Admin sessions can browse public equipment, but customer checkout remains restricted to customer accounts.",
        },
      ]}
      variant="admin"
    >
      <div>
        <h2 className="text-xl font-semibold text-[#2A2A2A]">Admin login</h2>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to access Teesin operational tools. Existing admin auth behavior and redirect flow remain unchanged.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="grid gap-1.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <Mail className="h-4 w-4 text-[#D24338]" />
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
              placeholder="ops@example.com"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
              <KeyRound className="h-4 w-4 text-[#D24338]" />
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#D24338] focus:ring-1 focus:ring-[#F2C7C2]"
              placeholder="demo1234"
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Demo credentials: <code>ops@example.com</code> / <code>demo1234</code>.
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[#2A2A2A] px-3 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
