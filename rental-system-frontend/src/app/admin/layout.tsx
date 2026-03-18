"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Users,
  FileText,
  Boxes,
  Upload,
  Settings,
  LogOut,
  Package2,
  ChevronRight,
} from "lucide-react";

import {
  getCurrentAdmin,
  logoutAdmin,
  type AdminSession,
} from "@/lib/admin-auth";

type AdminLayoutProps = {
  children: ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: "prefix" | "exact";
};

const navItems: NavItem[] = [
  { label: "Calendar", href: "/admin/rental/calendar", icon: CalendarDays },
  { label: "Orders", href: "/admin/rental/orders", icon: ClipboardList },
  { label: "Customers", href: "/admin/rental/customers", icon: Users },
  { label: "Invoices", href: "/admin/rental/invoices", icon: FileText },
  { label: "Rental Inventory", href: "/admin/rental", icon: Boxes, match: "exact" },
  {
    label: "Import Equipment",
    href: "/admin/rental/equipment/import",
    icon: Upload,
  },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

function isActivePath(currentPath: string, itemHref: string, match: NavItem["match"] = "prefix") {
  if (currentPath === itemHref) return true;
  if (match === "exact") return false;
  if (currentPath.startsWith(itemHref + "/")) return true;
  return false;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  const safePathname = pathname ?? "";

  const [session, setSession] = useState<AdminSession | null>(null);
  const [initialised, setInitialised] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const isLoginPage = safePathname === "/admin/login";

  useEffect(() => {
    const s = getCurrentAdmin();
    setSession(s);
    setInitialised(true);
  }, [safePathname]);

  const isAuthenticated = !!session;

  useEffect(() => {
    if (!initialised) return;

    if (!isAuthenticated && !isLoginPage) {
      router.replace("/admin/login");
      return;
    }

    if (isAuthenticated && isLoginPage) {
      router.replace("/admin/rental");
    }
  }, [initialised, isAuthenticated, isLoginPage, router]);

  const currentNavItem = useMemo(() => {
    const sorted = [...navItems].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((item) => isActivePath(safePathname, item.href, item.match));
  }, [safePathname]);

  const breadcrumbText = useMemo(() => {
    const parts = ["Admin"];
    if (currentNavItem?.label) parts.push(currentNavItem.label);
    return parts.join(" / ");
  }, [currentNavItem]);

  const handleLogout = () => {
    void fetch("/api/admin/auth/token", {
      method: "DELETE",
      credentials: "include",
    });
    logoutAdmin();
    setSession(null);
    router.replace("/admin/login");
  };

  if (!initialised) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-xs text-slate-500">
        Loading admin console…
      </div>
    );
  }

  if (isLoginPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Fixed hover sidebar */}
      <aside
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
        className={[
          "fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white shadow-sm transition-all duration-200 md:flex md:flex-col",
          sidebarExpanded ? "w-72" : "w-20",
        ].join(" ")}
      >
        {/* Brand */}
        <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E]">
              <Package2 className="h-5 w-5" />
            </div>

            <div
              className={[
                "min-w-0 overflow-hidden transition-all duration-200",
                sidebarExpanded
                  ? "max-w-[180px] opacity-100"
                  : "max-w-0 opacity-0",
              ].join(" ")}
            >
              <div className="truncate text-sm font-semibold text-slate-900">
                Softtech
              </div>
              <div className="truncate text-xs text-slate-500">
                Admin Console
              </div>
            </div>
          </div>
        </div>

        {/* Section title */}
        <div
          className={[
            "px-4 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400 transition-opacity duration-200",
            sidebarExpanded ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          Overview
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-3">
          {navItems.map((item) => {
            const active = isActivePath(safePathname, item.href, item.match);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "group flex items-center rounded-xl px-3 py-2.5 text-sm transition-all",
                  active
                    ? "border border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  sidebarExpanded ? "justify-between" : "justify-center",
                ].join(" ")}
                title={!sidebarExpanded ? item.label : undefined}
              >
                <div
                  className={[
                    "flex items-center",
                    sidebarExpanded ? "gap-3" : "justify-center",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                      active
                        ? "bg-white text-[#B9382E]"
                        : "bg-transparent text-slate-500 group-hover:text-slate-800",
                    ].join(" ")}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>

                  <span
                    className={[
                      "overflow-hidden whitespace-nowrap transition-all duration-200",
                      sidebarExpanded
                        ? "max-w-[160px] opacity-100"
                        : "max-w-0 opacity-0",
                    ].join(" ")}
                  >
                    {item.label}
                  </span>
                </div>

                <span
                  className={[
                    "overflow-hidden transition-all duration-200",
                    sidebarExpanded ? "max-w-6 opacity-100" : "max-w-0 opacity-0",
                  ].join(" ")}
                >
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className={[
              "flex w-full items-center rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900",
              sidebarExpanded ? "justify-between" : "justify-center",
            ].join(" ")}
            title={!sidebarExpanded ? "Log out" : undefined}
          >
            <div
              className={[
                "flex items-center",
                sidebarExpanded ? "gap-3" : "justify-center",
              ].join(" ")}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500">
                <LogOut className="h-4.5 w-4.5" />
              </span>

              <span
                className={[
                  "overflow-hidden whitespace-nowrap transition-all duration-200",
                  sidebarExpanded
                    ? "max-w-[140px] opacity-100"
                    : "max-w-0 opacity-0",
                ].join(" ")}
              >
                Log out
              </span>
            </div>
          </button>

          <div
            className={[
              "mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all duration-200",
              sidebarExpanded
                ? "max-h-24 px-3 py-3 opacity-100"
                : "max-h-0 px-0 py-0 opacity-0 border-transparent",
            ].join(" ")}
          >
            <div className="truncate text-sm font-medium text-slate-800">
              {session?.email ?? "admin"}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Signed in administrator
            </div>
          </div>
        </div>
      </aside>

      {/* Main area: only reserve collapsed rail width */}
      <div className="md:pl-20">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
          <div>
            <p className="text-sm font-medium text-slate-700">{breadcrumbText}</p>
          </div>

          
        </header>

        <main className="px-4 py-4 md:px-6">{children}</main>
      </div>
    </div>
  );
}
