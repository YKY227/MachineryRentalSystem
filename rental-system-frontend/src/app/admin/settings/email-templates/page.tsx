"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, RefreshCcw, RotateCcw, Send } from "lucide-react";

import {
  SettingsBanner,
  SettingsCard,
  SettingsPageHeader,
  settingsInputClass,
} from "@/app/admin/settings/_components";

type EmailTemplateFieldValues = {
  subject: string;
  heading: string;
  intro: string;
  footer: string;
  ctaLabel?: string;
};

type EmailTemplateItem = {
  id: string;
  group: string;
  name: string;
  purpose: string;
  trigger: string;
  editableFields: EmailTemplateFieldValues;
  defaultFields: EmailTemplateFieldValues;
  isCustomized: boolean;
  subjectPreview: string;
  htmlPreview: string;
  sampleData: Array<{ label: string; value: string }>;
};

type TemplateDraft = EmailTemplateFieldValues & {
  testRecipient: string;
};

const actionButtonClass =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primaryButtonClass =
  "rounded-xl bg-[#D24338] px-3 py-2 text-sm font-medium text-white hover:bg-[#B9382E] disabled:opacity-50";

function createDraft(template: EmailTemplateItem, fallbackTestRecipient: string): TemplateDraft {
  return {
    ...template.editableFields,
    testRecipient: fallbackTestRecipient,
  };
}

export default function AdminSettingsEmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, string>>({});
  const [defaultTestRecipient, setDefaultTestRecipient] = useState("");

  const groupedTemplates = useMemo(() => {
    const grouped = new Map<string, EmailTemplateItem[]>();
    for (const template of templates) {
      grouped.set(template.group, [...(grouped.get(template.group) ?? []), template]);
    }
    return Array.from(grouped.entries());
  }, [templates]);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/admin/settings/email-templates", {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to load email templates (${res.status})`);
      }

      const data = (await res.json()) as { templates: EmailTemplateItem[] };
      setTemplates(data.templates);
      setDrafts((current) =>
        Object.fromEntries(
          data.templates.map((template) => [
            template.id,
            {
              ...createDraft(template, defaultTestRecipient),
              testRecipient: current[template.id]?.testRecipient ?? defaultTestRecipient,
            },
          ])
        )
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load email templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  function updateDraft(templateId: string, field: keyof TemplateDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [templateId]: {
        ...(current[templateId] ?? {
          subject: "",
          heading: "",
          intro: "",
          footer: "",
          ctaLabel: "",
          testRecipient: defaultTestRecipient,
        }),
        [field]: value,
      },
    }));
  }

  async function saveTemplate(templateId: string) {
    const draft = drafts[templateId];
    if (!draft) return;

    setBusyIds((current) => ({ ...current, [templateId]: "save" }));
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch(`/api/admin/settings/email-templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: draft.subject,
          heading: draft.heading,
          intro: draft.intro,
          footer: draft.footer,
          ctaLabel: draft.ctaLabel,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save template (${res.status})`);
      }

      const data = (await res.json()) as { template: EmailTemplateItem };
      setTemplates((current) =>
        current.map((item) => (item.id === templateId ? data.template : item))
      );
      setDrafts((current) => ({
        ...current,
        [templateId]: {
          ...createDraft(data.template, defaultTestRecipient),
          testRecipient: current[templateId]?.testRecipient ?? defaultTestRecipient,
        },
      }));
      setOkMsg(`${data.template.name} saved.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save template");
    } finally {
      setBusyIds((current) => {
        const next = { ...current };
        delete next[templateId];
        return next;
      });
    }
  }

  async function restoreTemplate(templateId: string) {
    setBusyIds((current) => ({ ...current, [templateId]: "restore" }));
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch(`/api/admin/settings/email-templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to restore template (${res.status})`);
      }

      const data = (await res.json()) as { template: EmailTemplateItem };
      setTemplates((current) =>
        current.map((item) => (item.id === templateId ? data.template : item))
      );
      setDrafts((current) => ({
        ...current,
        [templateId]: {
          ...createDraft(data.template, defaultTestRecipient),
          testRecipient: current[templateId]?.testRecipient ?? defaultTestRecipient,
        },
      }));
      setOkMsg(`${data.template.name} restored to defaults.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to restore template");
    } finally {
      setBusyIds((current) => {
        const next = { ...current };
        delete next[templateId];
        return next;
      });
    }
  }

  async function sendTest(templateId: string) {
    const draft = drafts[templateId];
    const recipient = draft?.testRecipient?.trim();
    if (!recipient) {
      setError("Enter a test recipient email before sending.");
      setOkMsg(null);
      return;
    }

    setBusyIds((current) => ({ ...current, [templateId]: "test" }));
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch(
        `/api/admin/settings/email-templates/${templateId}/test-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: recipient }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to send test email (${res.status})`);
      }

      const data = (await res.json()) as { recipient: string };
      setOkMsg(`Test email sent to ${data.recipient}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to send test email");
    } finally {
      setBusyIds((current) => {
        const next = { ...current };
        delete next[templateId];
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Mail}
        title="Email Templates"
        description="Preview current email templates, adjust safe structured copy, and send test emails without mutating production workflows."
      />

      {error ? <SettingsBanner kind="error" message={error} /> : null}
      {okMsg ? <SettingsBanner kind="success" message={okMsg} /> : null}

      <SettingsCard
        icon={Mail}
        title="Testing"
        description="Use one test inbox across templates, then send template-specific previews without touching reminder state or invoice lifecycles."
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Default test recipient
            </span>
            <input
              type="email"
              value={defaultTestRecipient}
              onChange={(e) => {
                const value = e.target.value;
                setDefaultTestRecipient(value);
                setDrafts((current) =>
                  Object.fromEntries(
                    Object.entries(current).map(([templateId, draft]) => [
                      templateId,
                      {
                        ...draft,
                        testRecipient: draft.testRecipient || value,
                      },
                    ])
                  )
                );
              }}
              placeholder="tester@example.com"
              className={settingsInputClass}
            />
          </label>

          <button
            type="button"
            onClick={() => void loadTemplates()}
            disabled={loading}
            className={actionButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              Reload templates
            </span>
          </button>
        </div>
      </SettingsCard>

      {groupedTemplates.map(([group, items]) => (
        <SettingsCard
          key={group}
          icon={Mail}
          title={group}
          description={`${items.length} template${items.length === 1 ? "" : "s"} in this group.`}
        >
          <div className="space-y-4">
            {items.map((template) => {
              const draft = drafts[template.id] ?? createDraft(template, defaultTestRecipient);
              const busy = busyIds[template.id];
              return (
                <section
                  key={template.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                          {template.name}
                        </h3>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em]",
                            template.isCustomized
                              ? "bg-[#FCE9E7] text-[#B9382E]"
                              : "bg-slate-200 text-slate-600",
                          ].join(" ")}
                        >
                          {template.isCustomized ? "Customized" : "Default"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{template.purpose}</p>
                      <p className="text-xs text-slate-500">{template.trigger}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-sm font-medium text-slate-700">Subject</span>
                          <input
                            type="text"
                            value={draft.subject}
                            onChange={(e) => updateDraft(template.id, "subject", e.target.value)}
                            className={settingsInputClass}
                          />
                        </label>

                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-sm font-medium text-slate-700">Heading</span>
                          <input
                            type="text"
                            value={draft.heading}
                            onChange={(e) => updateDraft(template.id, "heading", e.target.value)}
                            className={settingsInputClass}
                          />
                        </label>

                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-sm font-medium text-slate-700">Intro</span>
                          <textarea
                            value={draft.intro}
                            onChange={(e) => updateDraft(template.id, "intro", e.target.value)}
                            className={`${settingsInputClass} min-h-24`}
                          />
                        </label>

                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-sm font-medium text-slate-700">Footer / Sign-off</span>
                          <textarea
                            value={draft.footer}
                            onChange={(e) => updateDraft(template.id, "footer", e.target.value)}
                            className={`${settingsInputClass} min-h-24`}
                          />
                        </label>

                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-sm font-medium text-slate-700">CTA Label</span>
                          <input
                            type="text"
                            value={draft.ctaLabel ?? ""}
                            onChange={(e) => updateDraft(template.id, "ctaLabel", e.target.value)}
                            className={settingsInputClass}
                            placeholder="Only used for templates with a CTA link"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void saveTemplate(template.id)}
                          disabled={Boolean(busy)}
                          className={primaryButtonClass}
                        >
                          {busy === "save" ? "Saving..." : "Save Template"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void restoreTemplate(template.id)}
                          disabled={Boolean(busy)}
                          className={actionButtonClass}
                        >
                          <span className="inline-flex items-center gap-2">
                            <RotateCcw className="h-4 w-4" />
                            {busy === "restore" ? "Restoring..." : "Restore Default"}
                          </span>
                        </button>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                          <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-700">
                              Test recipient
                            </span>
                            <input
                              type="email"
                              value={draft.testRecipient}
                              onChange={(e) =>
                                updateDraft(template.id, "testRecipient", e.target.value)
                              }
                              className={settingsInputClass}
                              placeholder="tester@example.com"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => void sendTest(template.id)}
                            disabled={Boolean(busy)}
                            className={actionButtonClass}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Send className="h-4 w-4" />
                              {busy === "test" ? "Sending..." : "Send Test"}
                            </span>
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Test sends use sample template data only. They do not mark reminders sent,
                          change invoice history, or alter order lifecycle state.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Subject Preview
                        </p>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {template.subjectPreview}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Sample Scenario
                        </p>
                        <dl className="mt-3 grid gap-2 text-sm">
                          {template.sampleData.map((entry) => (
                            <div
                              key={`${template.id}-${entry.label}`}
                              className="grid gap-1 md:grid-cols-[140px_minmax(0,1fr)]"
                            >
                              <dt className="font-medium text-slate-700">{entry.label}</dt>
                              <dd className="break-words text-slate-600">{entry.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <details className="rounded-xl border border-slate-200 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-medium text-slate-900">
                          Default System Copy
                        </summary>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600">
                          <p><strong>Subject:</strong> {template.defaultFields.subject}</p>
                          <p><strong>Heading:</strong> {template.defaultFields.heading}</p>
                          <p><strong>Intro:</strong> {template.defaultFields.intro}</p>
                          <p><strong>Footer:</strong> {template.defaultFields.footer}</p>
                          <p><strong>CTA Label:</strong> {template.defaultFields.ctaLabel || "-"}</p>
                        </div>
                      </details>

                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Rendered Preview
                        </p>
                        <div
                          className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800"
                          dangerouslySetInnerHTML={{ __html: template.htmlPreview }}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </SettingsCard>
      ))}
    </div>
  );
}
