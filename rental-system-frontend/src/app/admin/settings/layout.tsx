"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, Clock, Code, Wrench } from "lucide-react";

const navItems = [
  { href: "/admin/settings/organisation", label: "Organisation", icon: Building2 },
  { href: "/admin/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/settings/operations", label: "Operations", icon: Wrench },
  { href: "/admin/settings/reminders", label: "Reminder Automation", icon: Clock },
  { href: "/admin/settings/developer", label: "Developer Tools", icon: Code },
];

export default function AdminSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 border-b border-slate-100 pb-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B9382E]">
                Settings
              </div>
              <div className="mt-2 text-lg font-semibold text-[#2A2A2A]">
                Admin Workspace
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Organisation, routing, operational defaults, and developer controls.
              </p>
            </div>
            <nav className="space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={[
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      isActive
                        ? "border border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E]"
                        : "border border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition",
                    isActive
                      ? "border border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E]"
                      : "border border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
