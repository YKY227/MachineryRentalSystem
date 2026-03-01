// src/components/wizard/StepLayout.tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";

interface StepLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
  backHref?: string;
}

export function StepLayout({
  title,
  subtitle,
  children,
  currentStep,
  totalSteps,
  backHref,
}: StepLayoutProps) {
  const progress = Math.min(100, Math.max(0, (currentStep / totalSteps) * 100));

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 md:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Booking Wizard
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-2xl text-base text-slate-600 md:text-lg">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 text-left md:text-right">
            <p className="text-sm text-slate-500">
              Step <span className="font-semibold text-slate-700">{currentStep}</span>{" "}
              of <span className="font-semibold text-slate-700">{totalSteps}</span>
            </p>

            <div className="mt-2 h-2 w-44 overflow-hidden rounded-full bg-slate-200 md:w-56">
              <div
                className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Back link */}
        {backHref ? (
          <div className="mb-4">
            <Link
              href={backHref}
              className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Back
            </Link>
          </div>
        ) : null}

        {/* Content card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <div className="text-base md:text-lg">{children}</div>
        </section>
      </div>
    </main>
  );
}
