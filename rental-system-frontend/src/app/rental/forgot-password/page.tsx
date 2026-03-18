"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function RentalForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch("/api/public/rental/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to request password reset");
      setMessage(
        data?.message ?? "If an account exists for this email, a password reset link has been sent."
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to request password reset");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter your customer account email and we will send a reset link if the account exists.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
              autoComplete="email"
              required
            />
          </label>

          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {submitting ? "Submitting..." : "Send reset link"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Remembered your password?{" "}
          <Link href="/rental/account/login" className="font-medium text-sky-700 hover:text-sky-800">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
