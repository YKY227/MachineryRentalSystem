import "server-only";

import type { Invoice } from "@/lib/rental/invoices/types";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";

export type PdfSupplierProfile = {
  name: string;
  addressLines: string[];
  email?: string;
  phone?: string;
  uen?: string;
  gstRegNo?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
};

function toLines(value?: string | null, fallback?: string[]) {
  if (typeof value === "string" && value.trim()) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return (fallback ?? []).filter(Boolean);
}

export async function getPdfSupplierProfile(inv: Invoice): Promise<PdfSupplierProfile> {
  try {
    const settings = await dbAdminSettingsRepo.get();

    return {
      name: settings.orgName.trim() || inv.supplier?.name || "Rental Supplier",
      addressLines: toLines(settings.companyAddress, inv.supplier?.addressLines),
      email: settings.supportEmail.trim() || inv.supplier?.email || undefined,
      phone:
        settings.companyPhone?.trim() ||
        settings.whatsappNumber?.trim() ||
        inv.supplier?.phone ||
        undefined,
      uen: settings.companyUen?.trim() || inv.supplier?.uen || undefined,
      gstRegNo: settings.companyGstRegNo?.trim() || inv.supplier?.gstRegNo || undefined,
      bankName: settings.bankName?.trim() || undefined,
      bankAccountName:
        settings.bankAccountName?.trim() ||
        settings.orgName.trim() ||
        inv.supplier?.name ||
        undefined,
      bankAccountNumber: settings.bankAccountNumber?.trim() || undefined,
    };
  } catch {
    return {
      name: inv.supplier?.name || "Rental Supplier",
      addressLines: (inv.supplier?.addressLines ?? []).filter(Boolean),
      email: inv.supplier?.email || undefined,
      phone: inv.supplier?.phone || undefined,
      uen: inv.supplier?.uen || undefined,
      gstRegNo: inv.supplier?.gstRegNo || undefined,
      bankName: undefined,
      bankAccountName: inv.supplier?.name || undefined,
      bankAccountNumber: undefined,
    };
  }
}
