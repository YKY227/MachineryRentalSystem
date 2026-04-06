import "server-only";

export type EmailLogProvider = "mock" | "sendgrid" | "resend" | "ses" | "postmark";
type EmailTransportProvider = "mock" | "sendgrid";

type EmailAttachment = {
  filename: string;
  content: Uint8Array | string;
  type?: string;
};

export type SendServerEmailInput = {
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

function normalizeProvider(value: string | undefined): EmailTransportProvider {
  const provider = (value ?? "sendgrid").trim().toLowerCase();
  if (provider === "mock") return "mock";
  if (provider === "sendgrid" || provider === "") return "sendgrid";
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

export function getConfiguredEmailProvider(): EmailLogProvider {
  const provider = (process.env.EMAIL_PROVIDER ?? "sendgrid").trim().toLowerCase();
  if (
    provider === "mock" ||
    provider === "sendgrid" ||
    provider === "resend" ||
    provider === "ses" ||
    provider === "postmark"
  ) {
    return provider;
  }
  return "sendgrid";
}

export async function sendServerEmail(input: SendServerEmailInput) {
  const provider = normalizeProvider(process.env.EMAIL_PROVIDER);
  const to = normalizeRecipients(input.to);
  const cc = normalizeRecipients(input.cc);
  const bcc = normalizeRecipients(input.bcc);

  if (!to.length) throw new Error("Missing recipient email");

  if (provider === "mock") {
    return {
      provider,
      providerMessageId: `mock_${Date.now()}`,
    };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mustEnv("SENDGRID_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: to.map((email) => ({ email })),
          cc: cc.length ? cc.map((email) => ({ email })) : undefined,
          bcc: bcc.length ? bcc.map((email) => ({ email })) : undefined,
        },
      ],
      from: { email: mustEnv("MAIL_FROM") },
      reply_to: input.replyTo ? { email: input.replyTo.trim() } : undefined,
      subject: input.subject,
      content: [
        {
          type: "text/html",
          value: input.html,
        },
      ],
      attachments: (input.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        type: attachment.type ?? "application/octet-stream",
        disposition: "attachment",
        content: toBase64(attachment.content),
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `SendGrid mail send failed: ${response.status} ${errorText || response.statusText}`.trim()
    );
  }

  return {
    provider,
    providerMessageId: response.headers.get("x-message-id") || null,
  };
}
