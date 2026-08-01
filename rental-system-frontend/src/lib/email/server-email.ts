import "server-only";

export type EmailLogProvider = "mock" | "sendgrid" | "resend" | "ses" | "postmark";
type EmailTransportProvider = "mock" | "resend";

type EmailAttachment = {
  filename: string;
  content: Uint8Array | string;
  type?: string;
};

export type SendServerEmailInput = {
  templateId?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
};

function mustEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizeProvider(value: string | undefined): EmailTransportProvider {
  const provider = (value ?? "resend").trim().toLowerCase();
  if (provider === "mock") return "mock";
  if (provider === "resend" || provider === "") return "resend";
  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}

function normalizeRecipients(value: string | string[] | undefined) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of items) {
    const email = String(item ?? "").trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    next.push(email);
  }

  return next;
}

function toBase64(content: Uint8Array | string) {
  return Buffer.from(content).toString("base64");
}

function maskEmail(email: string) {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 1) return "***";
  return `${trimmed.slice(0, 2)}***${trimmed.slice(at)}`;
}

function summarizeRecipients(input: {
  to: string[];
  cc: string[];
  bcc: string[];
}) {
  const all = [...input.to, ...input.cc, ...input.bcc];
  return {
    total: all.length,
    sample: all.slice(0, 3).map(maskEmail),
  };
}

function extractEmailAddress(value: string) {
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? trimmed).trim().toLowerCase();
}

function extractDomainFromAddress(value: string | undefined) {
  if (!value) return undefined;
  const address = extractEmailAddress(value);
  const at = address.lastIndexOf("@");
  if (at < 0 || at === address.length - 1) return undefined;
  return address.slice(at + 1);
}

export function getEmailConfigDiagnostics() {
  const provider = normalizeProvider(process.env.EMAIL_PROVIDER);
  const from = getOptionalEnv("MAIL_FROM");
  const replyTo = getOptionalEnv("MAIL_REPLY_TO");
  return {
    provider,
    from,
    fromDomain: extractDomainFromAddress(from),
    replyTo,
    replyToDomain: extractDomainFromAddress(replyTo),
    hasResendApiKey: Boolean(getOptionalEnv("RESEND_API_KEY")),
  };
}

function buildResendAdminError(input: {
  status: number;
  responseText: string;
  fromDomain?: string;
}) {
  const normalizedText = input.responseText.toLowerCase();
  if (
    input.status === 403 &&
    (normalizedText.includes("not authorized to send emails from") ||
      normalizedText.includes("not authorized"))
  ) {
    return `Resend API key does not have permission to send from the configured MAIL_FROM domain${input.fromDomain ? ` (${input.fromDomain})` : ""}`;
  }
  return null;
}

export function getConfiguredEmailProvider(): EmailLogProvider {
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (
    provider === "mock" ||
    provider === "sendgrid" ||
    provider === "resend" ||
    provider === "ses" ||
    provider === "postmark"
  ) {
    return provider;
  }
  return "resend";
}

export async function sendServerEmail(input: SendServerEmailInput) {
  const provider = normalizeProvider(process.env.EMAIL_PROVIDER);
  const to = normalizeRecipients(input.to);
  const cc = normalizeRecipients(input.cc);
  const bcc = normalizeRecipients(input.bcc);
  const config = getEmailConfigDiagnostics();

  if (!to.length) throw new Error("Missing recipient email");

  if (provider === "mock") {
    console.info("[email] mock send", {
      provider,
      templateId: input.templateId ?? "unspecified",
      fromDomain: config.fromDomain ?? "missing",
      recipientCount: summarizeRecipients({ to, cc, bcc }).total,
    });
    return {
      provider,
      providerMessageId: `mock_${Date.now()}`,
    };
  }

  const from = mustEnv("MAIL_FROM");
  const replyTo = input.replyTo?.trim() || config.replyTo || undefined;
  const recipientSummary = summarizeRecipients({ to, cc, bcc });
  console.info("[email] resend send attempt", {
    provider,
    templateId: input.templateId ?? "unspecified",
    fromDomain: config.fromDomain ?? "missing",
    replyToDomain: extractDomainFromAddress(replyTo),
    hasResendApiKey: config.hasResendApiKey,
    recipientCount: recipientSummary.total,
    recipientSample: recipientSummary.sample,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mustEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      reply_to: replyTo,
      subject: input.subject,
      html: input.html,
      attachments: (input.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        content: toBase64(attachment.content),
        content_type: attachment.type ?? "application/octet-stream",
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const adminMessage = buildResendAdminError({
      status: response.status,
      responseText: errorText || response.statusText,
      fromDomain: config.fromDomain,
    });
    console.error("[email] resend send failed", {
      provider,
      templateId: input.templateId ?? "unspecified",
      fromDomain: config.fromDomain ?? "missing",
      hasResendApiKey: config.hasResendApiKey,
      recipientCount: recipientSummary.total,
      recipientSample: recipientSummary.sample,
      status: response.status,
      providerError: (errorText || response.statusText).slice(0, 500),
    });
    throw new Error(
      (adminMessage ??
        `Resend mail send failed: ${response.status} ${errorText || response.statusText}`).trim()
    );
  }

  const payload = (await response.json()) as { id?: string };
  console.info("[email] resend send succeeded", {
    provider,
    templateId: input.templateId ?? "unspecified",
    fromDomain: config.fromDomain ?? "missing",
    recipientCount: recipientSummary.total,
    providerMessageId: payload.id ?? null,
  });

  return {
    provider,
    providerMessageId: payload.id ?? null,
  };
}
