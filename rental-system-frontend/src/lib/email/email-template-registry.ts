import "server-only";

import { dbEmailTemplateSettingsRepo } from "@/lib/email/db-email-template-settings-repo";

export type EmailTemplateId =
  | "new_order_admin"
  | "invoice_send"
  | "invoice_checkout_paid"
  | "invoice_overdue_reminder"
  | "invoice_payment_receipt"
  | "return_reminder"
  | "contact_enquiry_admin"
  | "customer_password_reset"
  | "admin_test_email"
  | "extension_invoice_approved"
  | "extension_invoice_payment_received";

export type EmailTemplateFieldValues = {
  subject: string;
  heading: string;
  intro: string;
  footer: string;
  ctaLabel?: string;
};

type EmailTemplateGroup = "Orders" | "Invoices" | "Contact" | "Account" | "Admin";

type SampleEntry = {
  label: string;
  value: string;
};

type RenderedTemplate = {
  subject: string;
  html: string;
  sampleData: SampleEntry[];
};

type TemplateDefinition<TData> = {
  id: EmailTemplateId;
  group: EmailTemplateGroup;
  name: string;
  purpose: string;
  trigger: string;
  defaults: EmailTemplateFieldValues;
  sample: TData;
  render: (fields: EmailTemplateFieldValues, data: TData) => RenderedTemplate;
};

export type AdminEmailTemplateItem = {
  id: EmailTemplateId;
  group: EmailTemplateGroup;
  name: string;
  purpose: string;
  trigger: string;
  editableFields: EmailTemplateFieldValues;
  defaultFields: EmailTemplateFieldValues;
  isCustomized: boolean;
  subjectPreview: string;
  htmlPreview: string;
  sampleData: SampleEntry[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function moneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function renderBaseEmail(input: {
  greeting?: string;
  heading: string;
  intro?: string;
  bodyBlocks?: string[];
  ctaUrl?: string;
  ctaLabel?: string;
  footer?: string;
}) {
  return `
    <div style="font-family:Arial,sans-serif; line-height:1.5">
      ${input.greeting ? `<p>${escapeHtml(input.greeting)}</p>` : ""}
      <p><strong>${escapeHtml(input.heading)}</strong></p>
      ${input.intro ? `<p>${nl2br(input.intro)}</p>` : ""}
      ${(input.bodyBlocks ?? []).join("")}
      ${input.ctaUrl && input.ctaLabel ? `<p><a href="${escapeHtml(input.ctaUrl)}">${escapeHtml(input.ctaLabel)}</a></p>` : ""}
      ${input.footer ? `<p>${nl2br(input.footer)}</p>` : ""}
    </div>
  `;
}

const templateDefinitions = [
  {
    id: "new_order_admin",
    group: "Orders",
    name: "New Order Admin Notification",
    purpose: "Alerts admins when a rental checkout creates a new order.",
    trigger: "Sent after a new paid checkout is processed and notification routing resolves recipients.",
    defaults: {
      subject: "New rental order received",
      heading: "A new rental order has been received.",
      intro: "Review the order details below and open the admin order workspace if action is required.",
      footer: "Open the admin orders workspace to review scheduling, invoicing, and fulfilment details.",
      ctaLabel: "Open in admin orders",
    },
    sample: {
      orderId: "ORD-2026-00421",
      companyName: "Teesin Demo Projects",
      customerName: "Alicia Tan",
      rentalPeriod: "2026-04-15 to 2026-04-21",
      equipmentSummary: "Mini Excavator x2",
      adminUrl: "https://machinery.aaaii.uk/admin/rental/orders?orderId=ORD-2026-00421",
    },
    render(fields, data) {
      return {
        subject: `${fields.subject} - ${data.orderId}`,
        html: renderBaseEmail({
          heading: fields.heading,
          intro: fields.intro,
          bodyBlocks: [
            `<p><strong>Customer / Company:</strong> ${escapeHtml(data.companyName)}</p>`,
            `<p><strong>Contact:</strong> ${escapeHtml(data.customerName)}</p>`,
            `<p><strong>Order ID:</strong> ${escapeHtml(data.orderId)}</p>`,
            `<p><strong>Rental Period:</strong> ${escapeHtml(data.rentalPeriod)}</p>`,
            `<p><strong>Equipment:</strong> ${escapeHtml(data.equipmentSummary)}</p>`,
          ],
          ctaLabel: fields.ctaLabel,
          ctaUrl: data.adminUrl,
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Order ID", value: data.orderId },
          { label: "Company", value: data.companyName },
          { label: "Contact", value: data.customerName },
          { label: "Rental Period", value: data.rentalPeriod },
          { label: "Equipment", value: data.equipmentSummary },
        ],
      };
    },
  },
  {
    id: "invoice_send",
    group: "Invoices",
    name: "Invoice Send / Resend",
    purpose: "Sends the main issued tax invoice email with the invoice PDF attached.",
    trigger: "Used by admin send/resend actions and any shared invoice-send helper flow.",
    defaults: {
      subject: "Tax Invoice",
      heading: "Your tax invoice is ready.",
      intro: "Please find attached your tax invoice.",
      footer: "The invoice PDF is attached for reference.",
      ctaLabel: "",
    },
    sample: {
      customerName: "Alicia Tan",
      invoiceNo: "INV-202604-00021",
      billTo: "Teesin Demo Projects",
      customMessage: "",
    },
    render(fields, data) {
      const message = data.customMessage.trim() || `Dear ${data.customerName},\n\n${fields.intro}\n\n${fields.footer}`;
      return {
        subject: `${fields.subject} ${data.invoiceNo}`.trim(),
        html: `
          <div style="font-family:Arial,sans-serif; line-height:1.5">
            <p>${nl2br(message)}</p>
            <hr/>
            <p style="color:#666; font-size:12px">
              Invoice: <b>${escapeHtml(data.invoiceNo)}</b><br/>
              Bill To: ${escapeHtml(data.billTo)}<br/>
              PDF attached for reference.
            </p>
          </div>
        `,
        sampleData: [
          { label: "Invoice", value: data.invoiceNo },
          { label: "Bill To", value: data.billTo },
          { label: "Customer", value: data.customerName },
        ],
      };
    },
  },
  {
    id: "invoice_checkout_paid",
    group: "Invoices",
    name: "Checkout Paid Invoice Email",
    purpose: "Sends an issued invoice after a successful public checkout payment.",
    trigger: "Sent by the checkout invoice automation after payment mapping completes.",
    defaults: {
      subject: "Tax Invoice",
      heading: "Thank you for your payment.",
      intro: "Please find attached your tax invoice.",
      footer: "We have attached the invoice PDF for your records.",
      ctaLabel: "",
    },
    sample: {
      customerName: "Alicia Tan",
      invoiceNo: "INV-202604-00021",
      totalCents: 248000,
      paidCents: 248000,
      balanceCents: 0,
      depositCents: 50000,
    },
    render(fields, data) {
      return {
        subject: `${fields.subject} ${data.invoiceNo}`.trim(),
        html: renderBaseEmail({
          greeting: `Dear ${data.customerName},`,
          heading: fields.heading,
          intro: fields.intro,
          bodyBlocks: [
            `<p><strong>Total Amount:</strong> ${moneyFromCents(data.totalCents)}</p>`,
            `<p><strong>Invoice Amount Paid:</strong> ${moneyFromCents(data.paidCents)}</p>`,
            `<p><strong>Outstanding Balance:</strong> ${moneyFromCents(data.balanceCents)}</p>`,
            data.depositCents > 0
              ? `<p><strong>Refundable Deposit Held:</strong> ${moneyFromCents(data.depositCents)}</p>`
              : "",
          ],
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Invoice", value: data.invoiceNo },
          { label: "Total", value: moneyFromCents(data.totalCents) },
          { label: "Paid", value: moneyFromCents(data.paidCents) },
          { label: "Balance", value: moneyFromCents(data.balanceCents) },
        ],
      };
    },
  },
  {
    id: "invoice_overdue_reminder",
    group: "Invoices",
    name: "Invoice Overdue Reminder",
    purpose: "Reminds customers about overdue invoices without altering reminder-state during preview or test send.",
    trigger: "Used by overdue reminder automation when an issued invoice becomes eligible.",
    defaults: {
      subject: "Overdue Reminder for Invoice",
      heading: "Your invoice remains overdue.",
      intro: "Please arrange payment and quote the invoice number as reference.",
      footer: "A copy of the invoice is attached for convenience.",
      ctaLabel: "",
    },
    sample: {
      stageLabel: "First",
      customerName: "Alicia Tan",
      invoiceNo: "INV-202604-00021",
      overdueDate: "2026-04-03",
      outstandingBalanceCents: 124000,
    },
    render(fields, data) {
      return {
        subject: `${data.stageLabel} ${fields.subject} ${data.invoiceNo}`.trim(),
        html: renderBaseEmail({
          greeting: `Dear ${data.customerName},`,
          heading: `${data.stageLabel} reminder: ${fields.heading}`,
          intro: fields.intro,
          bodyBlocks: [
            `<p><strong>Invoice:</strong> ${escapeHtml(data.invoiceNo)}</p>`,
            `<p><strong>Overdue Since:</strong> ${escapeHtml(formatDate(data.overdueDate))}</p>`,
            `<p><strong>Outstanding Balance:</strong> ${moneyFromCents(data.outstandingBalanceCents)}</p>`,
          ],
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Reminder Stage", value: data.stageLabel },
          { label: "Invoice", value: data.invoiceNo },
          { label: "Outstanding", value: moneyFromCents(data.outstandingBalanceCents) },
        ],
      };
    },
  },
  {
    id: "invoice_payment_receipt",
    group: "Invoices",
    name: "Invoice Payment Receipt",
    purpose: "Confirms recorded payment against an issued invoice.",
    trigger: "Sent from the admin receipt action after payment exists on the invoice.",
    defaults: {
      subject: "Payment Receipt for Invoice",
      heading: "We acknowledge receipt of your payment.",
      intro: "A copy of the invoice is attached for reference.",
      footer: "Thank you.",
      ctaLabel: "",
    },
    sample: {
      customerName: "Alicia Tan",
      invoiceNo: "INV-202604-00021",
      totalCents: 248000,
      paidCents: 248000,
      balanceCents: 0,
      paymentStatus: "Paid",
      dueDate: "2026-04-20",
    },
    render(fields, data) {
      return {
        subject: `${fields.subject} ${data.invoiceNo}`.trim(),
        html: renderBaseEmail({
          greeting: `Dear ${data.customerName},`,
          heading: fields.heading,
          intro: fields.intro,
          bodyBlocks: [
            `<p><strong>Total Invoice Amount:</strong> ${moneyFromCents(data.totalCents)}</p>`,
            `<p><strong>Amount Paid To Date:</strong> ${moneyFromCents(data.paidCents)}</p>`,
            `<p><strong>Outstanding Balance:</strong> ${moneyFromCents(data.balanceCents)}</p>`,
            `<p><strong>Payment Status:</strong> ${escapeHtml(data.paymentStatus)}</p>`,
            `<p><strong>Due Date:</strong> ${escapeHtml(formatDate(data.dueDate))}</p>`,
          ],
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Invoice", value: data.invoiceNo },
          { label: "Paid", value: moneyFromCents(data.paidCents) },
          { label: "Status", value: data.paymentStatus },
        ],
      };
    },
  },
  {
    id: "return_reminder",
    group: "Orders",
    name: "Return Reminder",
    purpose: "Reminds customers about upcoming or due returns without mutating reminder events during testing.",
    trigger: "Used by return reminder automation when an active rental becomes eligible.",
    defaults: {
      subject: "Return Reminder for Rental Order",
      heading: "Your rental is approaching its scheduled return date.",
      intro: "Please arrange for the equipment to be returned by the current return date unless a separate extension request is approved.",
      footer: "Thank you.",
      ctaLabel: "Open customer portal",
    },
    sample: {
      stageLabel: "3-Day Return Reminder",
      orderId: "ORD-2026-00421",
      customerName: "Alicia Tan",
      equipmentTitle: "Mini Excavator",
      rentalEnd: "2026-04-21",
      portalUrl: "https://machinery.aaaii.uk/rental/account",
      extensionMessage:
        "If you need more time, you may request an extension from your customer portal. Approval depends on availability and account review.",
    },
    render(fields, data) {
      return {
        subject: `${data.stageLabel} - ${fields.subject} ${data.orderId}`.trim(),
        html: renderBaseEmail({
          greeting: `Dear ${data.customerName},`,
          heading: data.stageLabel,
          intro: fields.intro,
          bodyBlocks: [
            `<p><strong>Equipment:</strong> ${escapeHtml(data.equipmentTitle)}</p>`,
            `<p><strong>Current Return Date:</strong> ${escapeHtml(formatDate(data.rentalEnd))}</p>`,
            `<p>${escapeHtml(data.extensionMessage)}</p>`,
          ],
          ctaLabel: fields.ctaLabel,
          ctaUrl: data.portalUrl,
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Order", value: data.orderId },
          { label: "Equipment", value: data.equipmentTitle },
          { label: "Return Date", value: formatDate(data.rentalEnd) },
        ],
      };
    },
  },
  {
    id: "contact_enquiry_admin",
    group: "Contact",
    name: "Contact Enquiry Notification",
    purpose: "Forwards public website contact enquiries to the configured admin recipients.",
    trigger: "Sent after a public contact enquiry is stored and recipient routing resolves a destination.",
    defaults: {
      subject: "New website enquiry",
      heading: "A new website contact enquiry has been submitted.",
      intro: "Review the enquiry details below and follow up with the sender as needed.",
      footer: "Use the sender email as the reply-to address when following up.",
      ctaLabel: "",
    },
    sample: {
      enquiryId: "ENQ-2026-0041",
      name: "Alicia Tan",
      companyName: "Teesin Demo Projects",
      email: "alicia@example.com",
      phone: "+65 9000 1234",
      subjectLine: "Need a scissor lift next week",
      message: "Please share availability and delivery options for a 7-day rental.",
      submittedAt: "2026-04-10T09:30:00.000Z",
    },
    render(fields, data) {
      return {
        subject: `${fields.subject} - ${data.subjectLine}`.trim(),
        html: renderBaseEmail({
          heading: fields.heading,
          intro: fields.intro,
          bodyBlocks: [
            `<p><strong>Name:</strong> ${escapeHtml(data.name)}</p>`,
            `<p><strong>Company:</strong> ${escapeHtml(data.companyName)}</p>`,
            `<p><strong>Email:</strong> ${escapeHtml(data.email)}</p>`,
            `<p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>`,
            `<p><strong>Subject:</strong> ${escapeHtml(data.subjectLine)}</p>`,
            `<p><strong>Submitted:</strong> ${escapeHtml(new Date(data.submittedAt).toLocaleString("en-SG", { hour12: true }))}</p>`,
            `<p><strong>Enquiry ID:</strong> ${escapeHtml(data.enquiryId)}</p>`,
            `<p><strong>Message:</strong></p>`,
            `<div style="white-space:pre-wrap;border:1px solid #e2e8f0;background:#f8fafc;padding:12px;border-radius:8px;">${escapeHtml(data.message)}</div>`,
          ],
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Enquiry ID", value: data.enquiryId },
          { label: "Sender", value: `${data.name} (${data.email})` },
          { label: "Subject", value: data.subjectLine },
        ],
      };
    },
  },
  {
    id: "customer_password_reset",
    group: "Account",
    name: "Customer Password Reset",
    purpose: "Sends password reset instructions to rental customer accounts.",
    trigger: "Sent after a valid customer password reset request passes rate and guard checks.",
    defaults: {
      subject: "Reset your rental account password",
      heading: "We received a request to reset your password.",
      intro: "Use the link below to continue with your password reset.",
      footer: "This link expires in 1 hour. If you did not request this reset, you can ignore this email.",
      ctaLabel: "Reset your password",
    },
    sample: {
      customerName: "Alicia Tan",
      resetUrl: "https://machinery.aaaii.uk/rental/reset-password?token=sample-token",
    },
    render(fields, data) {
      return {
        subject: fields.subject,
        html: renderBaseEmail({
          greeting: `Dear ${data.customerName},`,
          heading: fields.heading,
          intro: fields.intro,
          ctaLabel: fields.ctaLabel,
          ctaUrl: data.resetUrl,
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Customer", value: data.customerName },
          { label: "Reset Link", value: data.resetUrl },
        ],
      };
    },
  },
  {
    id: "admin_test_email",
    group: "Admin",
    name: "Admin Test Email",
    purpose: "Verifies provider delivery without mutating real workflow state.",
    trigger: "Sent manually from admin settings for safe delivery checks.",
    defaults: {
      subject: "Admin settings test email",
      heading: "This is a test email from the admin settings page.",
      intro: "Use this to confirm sender configuration and inbox delivery.",
      footer: "No business workflow state is changed by this test send.",
      ctaLabel: "",
    },
    sample: {
      organisation: "Machinery Rental System",
      sentAt: "2026-04-10T10:00:00.000Z",
    },
    render(fields, data) {
      return {
        subject: `${fields.subject} - ${data.organisation}`.trim(),
        html: renderBaseEmail({
          heading: fields.heading,
          intro: fields.intro,
          bodyBlocks: [
            `<p><strong>Organisation:</strong> ${escapeHtml(data.organisation)}</p>`,
            `<p><strong>Sent At:</strong> ${escapeHtml(new Date(data.sentAt).toISOString())}</p>`,
          ],
          footer: fields.footer,
        }),
        sampleData: [
          { label: "Organisation", value: data.organisation },
          { label: "Sent At", value: new Date(data.sentAt).toISOString() },
        ],
      };
    },
  },
  {
    id: "extension_invoice_approved",
    group: "Invoices",
    name: "Extension Approved Invoice",
    purpose: "Sends the extension invoice when an extension is approved and billed.",
    trigger: "Used when an extension is approved and invoice delivery is required immediately.",
    defaults: {
      subject: "Tax Invoice",
      heading: "Your rental extension has been approved.",
      intro: "Please find attached your extension invoice.",
      footer: "Thank you.",
      ctaLabel: "",
    },
    sample: {
      customerName: "Alicia Tan",
      invoiceNo: "INV-202604-00032",
      requestedRentalEnd: "2026-04-28",
      billTo: "Teesin Demo Projects",
    },
    render(fields, data) {
      const message = `Dear ${data.customerName},\n\n${fields.heading} The extension now runs through ${data.requestedRentalEnd}. ${fields.intro}\n\n${fields.footer}`;
      return {
        subject: `${fields.subject} ${data.invoiceNo}`.trim(),
        html: `
          <div style="font-family:Arial,sans-serif; line-height:1.5">
            <p>${nl2br(message)}</p>
            <hr/>
            <p style="color:#666; font-size:12px">
              Invoice: <b>${escapeHtml(data.invoiceNo)}</b><br/>
              Bill To: ${escapeHtml(data.billTo)}<br/>
              PDF attached for reference.
            </p>
          </div>
        `,
        sampleData: [
          { label: "Invoice", value: data.invoiceNo },
          { label: "Extended Through", value: data.requestedRentalEnd },
          { label: "Customer", value: data.customerName },
        ],
      };
    },
  },
  {
    id: "extension_invoice_payment_received",
    group: "Invoices",
    name: "Extension Payment Confirmed",
    purpose: "Confirms payment and extension approval after the extension payment is received.",
    trigger: "Used after the extension payment session is confirmed and the extension is finalized.",
    defaults: {
      subject: "Tax Invoice",
      heading: "Your rental extension payment has been received.",
      intro: "Your extension is now confirmed and the invoice is attached.",
      footer: "Thank you.",
      ctaLabel: "",
    },
    sample: {
      customerName: "Alicia Tan",
      invoiceNo: "INV-202604-00033",
      requestedRentalEnd: "2026-04-28",
      billTo: "Teesin Demo Projects",
    },
    render(fields, data) {
      const message = `Dear ${data.customerName},\n\n${fields.heading} Your extension is now confirmed through ${data.requestedRentalEnd}. ${fields.intro}\n\n${fields.footer}`;
      return {
        subject: `${fields.subject} ${data.invoiceNo}`.trim(),
        html: `
          <div style="font-family:Arial,sans-serif; line-height:1.5">
            <p>${nl2br(message)}</p>
            <hr/>
            <p style="color:#666; font-size:12px">
              Invoice: <b>${escapeHtml(data.invoiceNo)}</b><br/>
              Bill To: ${escapeHtml(data.billTo)}<br/>
              PDF attached for reference.
            </p>
          </div>
        `,
        sampleData: [
          { label: "Invoice", value: data.invoiceNo },
          { label: "Confirmed Through", value: data.requestedRentalEnd },
          { label: "Customer", value: data.customerName },
        ],
      };
    },
  },
] satisfies TemplateDefinition<any>[];

function getDefinition(templateId: EmailTemplateId) {
  const match = templateDefinitions.find((template) => template.id === templateId);
  if (!match) throw new Error(`Unknown email template: ${templateId}`);
  return match;
}

function applyOverrides(
  defaults: EmailTemplateFieldValues,
  overrides?: Partial<EmailTemplateFieldValues>
): EmailTemplateFieldValues {
  return {
    ...defaults,
    ...(overrides ?? {}),
  };
}

async function getTemplateFields(templateId: EmailTemplateId) {
  const definition = getDefinition(templateId);
  const { overrides } = await dbEmailTemplateSettingsRepo.getAll();
  return {
    definition,
    fields: applyOverrides(definition.defaults, overrides[templateId]),
    isCustomized: Boolean(overrides[templateId] && Object.keys(overrides[templateId] ?? {}).length),
  };
}

export async function listAdminEmailTemplates(): Promise<AdminEmailTemplateItem[]> {
  const { overrides } = await dbEmailTemplateSettingsRepo.getAll();

  return templateDefinitions.map((definition) => {
    const fields = applyOverrides(definition.defaults, overrides[definition.id]);
    const rendered = definition.render(fields, definition.sample);
    return {
      id: definition.id,
      group: definition.group,
      name: definition.name,
      purpose: definition.purpose,
      trigger: definition.trigger,
      editableFields: fields,
      defaultFields: definition.defaults,
      isCustomized: Boolean(overrides[definition.id] && Object.keys(overrides[definition.id] ?? {}).length),
      subjectPreview: rendered.subject,
      htmlPreview: rendered.html,
      sampleData: rendered.sampleData,
    };
  });
}

export async function getAdminEmailTemplate(templateId: EmailTemplateId): Promise<AdminEmailTemplateItem> {
  const definition = getDefinition(templateId);
  const { fields, isCustomized } = await getTemplateFields(templateId);
  const rendered = definition.render(fields, definition.sample);

  return {
    id: definition.id,
    group: definition.group,
    name: definition.name,
    purpose: definition.purpose,
    trigger: definition.trigger,
    editableFields: fields,
    defaultFields: definition.defaults,
    isCustomized,
    subjectPreview: rendered.subject,
    htmlPreview: rendered.html,
    sampleData: rendered.sampleData,
  };
}

export async function updateAdminEmailTemplate(
  templateId: EmailTemplateId,
  fields: Partial<EmailTemplateFieldValues>
) {
  await dbEmailTemplateSettingsRepo.updateTemplate(templateId, fields);
  return getAdminEmailTemplate(templateId);
}

export async function restoreAdminEmailTemplate(templateId: EmailTemplateId) {
  await dbEmailTemplateSettingsRepo.restoreTemplate(templateId);
  return getAdminEmailTemplate(templateId);
}

export async function buildNewOrderNotificationTemplate(input: {
  orderId: string;
  companyName: string;
  customerName: string;
  rentalPeriod: string;
  equipmentSummary: string;
  adminUrl: string;
}) {
  const { definition, fields } = await getTemplateFields("new_order_admin");
  return definition.render(fields, input);
}

export async function buildInvoiceSendTemplate(input: {
  customerName: string;
  invoiceNo: string;
  billTo: string;
  customMessage?: string;
}) {
  const { definition, fields } = await getTemplateFields("invoice_send");
  return definition.render(fields, input);
}

export async function buildCheckoutPaidInvoiceTemplate(input: {
  customerName: string;
  invoiceNo: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  depositCents: number;
}) {
  const { definition, fields } = await getTemplateFields("invoice_checkout_paid");
  return definition.render(fields, input);
}

export async function buildOverdueReminderTemplate(input: {
  stageLabel: string;
  customerName: string;
  invoiceNo: string;
  overdueDate: string;
  outstandingBalanceCents: number;
}) {
  const { definition, fields } = await getTemplateFields("invoice_overdue_reminder");
  return definition.render(fields, input);
}

export async function buildPaymentReceiptTemplate(input: {
  customerName: string;
  invoiceNo: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  paymentStatus: string;
  dueDate?: string;
}) {
  const { definition, fields } = await getTemplateFields("invoice_payment_receipt");
  return definition.render(fields, {
    ...input,
    dueDate: input.dueDate || "",
  });
}

export async function buildReturnReminderTemplate(input: {
  stageLabel: string;
  orderId: string;
  customerName: string;
  equipmentTitle: string;
  rentalEnd: string;
  portalUrl: string;
  extensionMessage: string;
}) {
  const { definition, fields } = await getTemplateFields("return_reminder");
  return definition.render(fields, input);
}

export async function buildContactEnquiryTemplate(input: {
  enquiryId: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  subjectLine: string;
  message: string;
  submittedAt: string;
}) {
  const { definition, fields } = await getTemplateFields("contact_enquiry_admin");
  return definition.render(fields, input);
}

export async function buildCustomerPasswordResetTemplate(input: {
  customerName: string;
  resetUrl: string;
}) {
  const { definition, fields } = await getTemplateFields("customer_password_reset");
  return definition.render(fields, input);
}

export async function buildAdminTestEmailTemplate(input: {
  organisation: string;
  sentAt: string;
}) {
  const { definition, fields } = await getTemplateFields("admin_test_email");
  return definition.render(fields, input);
}

export async function buildExtensionApprovedInvoiceTemplate(input: {
  customerName: string;
  invoiceNo: string;
  requestedRentalEnd: string;
  billTo: string;
}) {
  const { definition, fields } = await getTemplateFields("extension_invoice_approved");
  return definition.render(fields, input);
}

export async function buildExtensionPaymentReceivedTemplate(input: {
  customerName: string;
  invoiceNo: string;
  requestedRentalEnd: string;
  billTo: string;
}) {
  const { definition, fields } = await getTemplateFields("extension_invoice_payment_received");
  return definition.render(fields, input);
}
