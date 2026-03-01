import { z } from "zod";

export const pickupSchema = z.object({
  companyName: z.string().optional(),
  contactName: z.string().min(2, "Contact name is required"),
  contactPhone: z
    .string()
    .min(8, "Phone number must have at least 8 digits")
    .regex(/^[0-9+\-\s]+$/, "Invalid phone format"),
  contactEmail: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  addressLine1: z.string().min(3, "Address is required"),
  addressLine2: z.string().optional(),
  postalCode: z
    .string()
    .min(6, "Postal code must be 6 digits")
    .regex(/^\d{6}$/, "Postal code must be 6 digits"),
  remarks: z.string().optional(),
  saveAsFavorite: z.boolean(),
});

export type PickupSchema = z.infer<typeof pickupSchema>;
