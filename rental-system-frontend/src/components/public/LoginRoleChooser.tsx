"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, X } from "lucide-react";

type Props = {
  buttonClassName?: string;
};

export default function LoginRoleChooser({ buttonClassName }: Props) {
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Login
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Continue as"
          onMouseDown={(e) => {
            // click outside to close
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Continue as
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Choose your portal to log in.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 px-5 py-4">
              <Link
                href="/admin/login"
                onClick={() => setOpen(false)}
                className="group rounded-2xl border border-slate-200 p-4 hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-700">
                    <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Admin / Operator
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Manage inventory &amp; rental bookings
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-slate-700 opacity-0 transition group-hover:opacity-100">
                      Continue →
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
