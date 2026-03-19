"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

export default function RentalResetPasswordPage() {
  return (
    <Suspense fallback={<RentalResetPasswordFallback />}>
      <RentalResetPasswordPageInner />
    </Suspense>
  );
}

function RentalResetPasswordPageInner() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams?.get("token")?.trim() ?? "", [searchParams]);

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!token) {
        if (mounted) {
          setValid(false);
          setChecking(false);
        }
        return;
      }

      try {
        setChecking(true);
        const res = await fetch(
          `/api/public/rental/auth/reset-password?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        setValid(Boolean(data?.valid));
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch("/api/public/rental/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Password reset failed");
      setMessage("Your password has been reset. You can now sign in.");
      setValid(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Password reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Reset password</h1>

        {checking ? (
          <p className="mt-4 text-sm text-slate-600">Validating reset link...</p>
        ) : message ? (
          <>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </div>
            <Link
              href="/rental/account/login"
              className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Go to sign in
            </Link>
          </>
        ) : valid ? (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-700">New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-slate-700">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-sky-400"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {submitting ? "Updating password..." : "Reset password"}
            </button>
          </form>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">
              This reset link is invalid or has expired. Request a new password reset link to continue.
            </p>
            <Link
              href="/rental/forgot-password"
              className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Request new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
function RentalResetPasswordFallback() {
  return (
    <div className="mx-auto max-w-md p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Reset password</h1>
        <p className="mt-4 text-sm text-slate-600">Validating reset link...</p>
      </div>
    </div>
  );
}
