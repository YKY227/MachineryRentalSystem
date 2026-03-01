"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getDriverToken, clearDriverToken } from "@/lib/driver-auth";

import { useDriverIdentity, DriverIdentityProvider } from "@/lib/use-driver-identity";
import { REGION_LABELS } from "@/lib/mock/drivers";

const NAV_ITEMS = [
  { href: "/driver/jobs", label: "Jobs" },
  { href: "/driver/history", label: "History" },
  { href: "/driver/settings", label: "Settings" },
];

// Outer layout just provides context
export default function DriverLayout({ children }: { children: ReactNode }) {
  return (
    <DriverIdentityProvider>
      <DriverLayoutInner>{children}</DriverLayoutInner>
    </DriverIdentityProvider>
  );
}

function DriverLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { driver, loaded, logoutDriver } = useDriverIdentity();

  // ✅ avoid "possibly null" everywhere
  const safePathname = pathname ?? "";

  const isLoginRoute = safePathname === "/driver/login";

  // Guard: if not logged in and not on login page, redirect to /driver/login
  useEffect(() => {
    if (!loaded) return;

    const token = getDriverToken();

    // 1️⃣ Hard auth guard: token is source of truth
    if (!token && !isLoginRoute) {
      clearDriverToken();
      logoutDriver();
      router.replace("/driver/login");
      return;
    }

    // 2️⃣ Identity guard (extra safety)
    if (!driver && !isLoginRoute) {
      router.replace("/driver/login");
      return;
    }

    // 3️⃣ Convenience redirect
    if (driver && safePathname === "/driver") {
      router.replace("/driver/jobs");
      return;
    }
  }, [loaded, driver, isLoginRoute, safePathname, router, logoutDriver]);

  // While loading identity from localStorage
  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-xs text-slate-400">Loading driver profile…</p>
      </div>
    );
  }

  // On /driver/login we *don't* show the driver shell (header + bottom nav)
  if (isLoginRoute) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <main className="mx-auto flex min-h-screen max-w-md flex-col">
          <section className="flex-1 overflow-y-auto">{children}</section>
        </main>
      </div>
    );
  }

  // All other /driver/* pages – require driver to be present
  if (!driver) {
    // Effect above will redirect; this is just a fallback
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-xs text-slate-400">Redirecting to login…</p>
      </div>
    );
  }

  // ✅ Safe region label (handles optional primaryRegion)
  const regionLabel = driver.primaryRegion ? REGION_LABELS[driver.primaryRegion] : "Region not set";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-md flex-col">
        {/* Header */}
        <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold">Driver App</h1>
            <p className="text-[11px] text-slate-400">
              Signed in as{" "}
              <span className="font-medium text-slate-100">{driver.name}</span> ·{" "}
              {regionLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              logoutDriver();
              router.replace("/driver/login");
            }}
            className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:border-sky-500 hover:text-sky-100"
          >
            Logout
          </button>
        </header>

        {/* Content */}
        <section className="flex-1 overflow-y-auto">{children}</section>

        {/* Bottom nav */}
        <nav className="sticky bottom-0 border-t border-slate-800 bg-slate-950/95 px-2 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-around gap-2 text-[11px]">
            {NAV_ITEMS.map((item) => {
              // ✅ uses safePathname so no TS error
              const active =
                safePathname === item.href ||
                safePathname.startsWith(item.href + "/") ||
                safePathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex flex-1 flex-col items-center rounded-xl px-2 py-1.5 transition",
                    active
                      ? "bg-slate-800 text-sky-300"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
                  ].join(" ")}
                >
                  <span className="font-medium">{item.label}</span>

                  {item.href === "/driver/jobs" && (
                    <span className="text-[10px] text-slate-400">Today&apos;s runs</span>
                  )}
                  {item.href === "/driver/history" && (
                    <span className="text-[10px] text-slate-400">Past jobs</span>
                  )}
                  {item.href === "/driver/settings" && (
                    <span className="text-[10px] text-slate-400">Profile &amp; app</span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
  );
}
