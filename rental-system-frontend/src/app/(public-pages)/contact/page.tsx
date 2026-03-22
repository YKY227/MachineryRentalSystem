"use client";

import Link from "next/link";
import { Mail, PhoneCall, Send } from "lucide-react";
import { useState } from "react";

type SubmitState = "idle" | "success";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [formStartedAt] = useState(() => Date.now());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          companyName,
          email,
          phone,
          subject,
          message,
          website,
          formStartedAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to submit enquiry");

      setSubmitState("success");
      setName("");
      setCompanyName("");
      setEmail("");
      setPhone("");
      setSubject("");
      setMessage("");
      setWebsite("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit enquiry");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(210,67,56,0.12),_transparent_34%),linear-gradient(180deg,#fffdfc_0%,#f8fafc_55%,#f4f6f8_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur hover:bg-slate-50">
            <Mail className="h-4 w-4 text-[#D24338]" />
            Contact Teesin Machinery
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/rental" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Browse equipment
            </Link>
            <Link href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Back to home
            </Link>
          </div>
        </div>

        <section className="grid gap-8 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#B9382E]">
              <PhoneCall className="h-4 w-4" />
              Contact us
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[#2A2A2A] md:text-5xl">
              Ask us about machinery rental, site delivery, or account setup.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              Send a note and our team will follow up. Your enquiry is recorded server-side and routed to the configured operations inbox.
            </p>

            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">What to include</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  Job dates, preferred equipment, delivery location, and any access constraints help our team respond faster.
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Direct email reply</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  The internal email uses your submitted address as Reply-To so operations can respond directly from their mailbox.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white/92 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="text-xl font-semibold text-[#2A2A2A]">Website enquiry form</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Required fields are kept short and practical. Short abuse protection checks run server-side before the enquiry is recorded.
            </p>

            {submitState === "success" && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Thanks for reaching out. Your enquiry has been received and routed to our team.
              </div>
            )}
            {error && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label className="grid gap-1 text-sm">
                  <span>Leave this field empty</span>
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    name="website"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" required />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Company name</span>
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Email</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" required />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Phone</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Subject</span>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" required />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Message</span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-40 rounded-xl border border-slate-200 px-4 py-3 text-sm" required />
              </label>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3 pt-2">
                <button type="submit" disabled={submitting} className="inline-flex items-center rounded-2xl bg-[#D24338] px-6 py-3 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300">
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? "Submitting..." : "Send enquiry"}
                </button>
                <span className="text-xs text-slate-500">If you submit repeatedly in a short window, the form will ask you to try again later.</span>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

