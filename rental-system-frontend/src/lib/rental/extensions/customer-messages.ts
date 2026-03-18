import type { RentalOrderExtensionStatus } from "@/lib/rental/extensions/types";

export const EXTENSION_REVIEW_SUBMITTED_MESSAGE = "Extension request submitted for review.";
export const EXTENSION_REVIEW_CLARIFICATION_MESSAGE = "Approval depends on availability and account review.";

export function getCustomerExtensionStatusMessage(status: RentalOrderExtensionStatus) {
  switch (status) {
    case "availability_blocked":
      return "This extension is unavailable for the selected dates. Please contact us.";
    case "awaiting_admin_review":
      return `${EXTENSION_REVIEW_SUBMITTED_MESSAGE} ${EXTENSION_REVIEW_CLARIFICATION_MESSAGE}`;
    case "approved_pending_payment":
      return "Your extension has been approved and payment is required before it is confirmed.";
    case "approved_confirmed":
      return "Your extension has been confirmed.";
    case "rejected":
      return "Your extension request was not approved.";
    case "cancelled":
    default:
      return "This extension request is closed.";
  }
}
