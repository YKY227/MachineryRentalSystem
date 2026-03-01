// src/app/driver/login/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, USE_BACKEND } from "@/lib/config";
import { setDriverToken } from "@/lib/driver-auth";
import { useDriverIdentity } from "@/lib/use-driver-identity";

export default function DriverLoginPage() {
  const router = useRouter();
const { setDriver } = useDriverIdentity();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return code.trim().length > 0 && /^\d{6}$/.test(pin) && !submitting;
  }, [code, pin, submitting]);

  const keypad = ["1","2","3","4","5","6","7","8","9","CLEAR","0","⌫"];

  const onKey = (k: string) => {
    if (k === "CLEAR") {
      setPin("");
      return;
    }
    if (k === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    // digit
    setPin((p) => (p.length >= 6 ? p : p + k));
  };

    async function login() {
    setError(null);

    console.log("[DriverLogin] clicked login", {
      USE_BACKEND,
      API_BASE_URL,
      codeRaw: code,
      pinLen: pin.length,
    });

    if (!USE_BACKEND) {
      setError("Backend is disabled (USE_BACKEND=false).");
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanPin = pin.trim();

    console.log("[DriverLogin] normalized input", { cleanCode, pinLen: cleanPin.length });

    if (!cleanCode) return setError("Driver code is required.");
    if (!/^\d{6}$/.test(cleanPin)) return setError("PIN must be exactly 6 digits.");

    setSubmitting(true);
    try {
      // IMPORTANT: use proxy route (matches your architecture)
      const url = `/api/backend/driver/auth/login`;
      console.log("[DriverLogin] POST", url);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode, pin: cleanPin }),
      });

      console.log("[DriverLogin] response", {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        redirected: (res as any).redirected,
        url: (res as any).url,
      });

      const rawText = await res.text().catch(() => "");
      console.log("[DriverLogin] raw response text (first 300 chars)", rawText.slice(0, 300));

      if (!res.ok) {
        throw new Error(`Login failed: ${res.status} ${res.statusText} ${rawText}`);
      }

      const json = rawText ? JSON.parse(rawText) : {};
      console.log("[DriverLogin] parsed json", json);

      const token = (json?.accessToken ?? json?.token) as string | undefined;
      console.log("[DriverLogin] token present?", { hasToken: Boolean(token), tokenLen: token?.length });

      if (!token || typeof token !== "string") {
        throw new Error("Login response missing accessToken.");
      }

            setDriverToken(token);
      console.log("[DriverLogin] token saved, fetching /driver/me...");

      const meRes = await fetch("/api/backend/driver/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const meText = await meRes.text().catch(() => "");
      console.log("[DriverLogin] /driver/me response", {
        ok: meRes.ok,
        status: meRes.status,
        preview: meText.slice(0, 200),
      });

      if (!meRes.ok) {
        throw new Error(`Failed to load driver profile: ${meRes.status} ${meText}`);
      }

      const meJson = meText ? JSON.parse(meText) : null;

      // Expecting something like { id, code, name, email, phone, primaryRegion, vehicleType }
      if (!meJson?.id || !meJson?.name) {
        throw new Error("Invalid /driver/me response (missing id/name).");
      }

      setDriver({
        id: meJson.id,
        code: meJson.code,
        name: meJson.name,
        email: meJson.email,
        phone: meJson.phone,
        primaryRegion: meJson.primaryRegion,
        vehicleType: meJson.vehicleType,
      });

      console.log("[DriverLogin] driver identity set, redirecting to /driver/jobs");
      router.replace("/driver/jobs");

    } catch (e: any) {
      console.error("[DriverLogin] ERROR", e);
      setError(e?.message ?? "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Driver Login</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your <span className="font-medium">Driver Code</span> and 6-digit <span className="font-medium">PIN</span>.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Driver Code</label>
              <input
  value={code}
  onChange={(e) => setCode(e.target.value)}
  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
             text-slate-900 placeholder-slate-400
             focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
  placeholder="e.g. DRV-001"
  autoCapitalize="characters"
/>

            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">PIN</label>
              <input
  value={pin}
  onChange={(e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPin(v);
  }}
  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
             tracking-[0.25em]
             text-slate-900 placeholder-slate-300
             focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
  placeholder="••••••"
  type="password"
  inputMode="numeric"
  pattern="\d*"
  maxLength={6}
/>

              <div className="text-[11px] text-slate-500">Use keypad below (mobile-friendly).</div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {keypad.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKey(k)}
                  className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 active:scale-[0.99]"
                >
                  {k}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={login}
              className="mt-2 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-slate-500">
          PIN issues? Ask admin to reset your PIN.
        </p>
      </div>
    </div>
  );
}
