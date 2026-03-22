export type RentalContactEnquiryStatus = "new" | "emailed" | "email_failed";

export type RentalContactEnquirySource = "website_contact_form";

export type RentalContactEnquiry = {
  id: string;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: RentalContactEnquiryStatus;
  source: RentalContactEnquirySource;
  emailSentAt?: string;
  emailSendError?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRentalContactEnquiryInput = {
  name: string;
  companyName?: string | null;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  source?: RentalContactEnquirySource;
};
