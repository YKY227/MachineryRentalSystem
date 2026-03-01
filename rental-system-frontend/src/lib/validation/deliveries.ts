import { z } from "zod";

export const deliveryPointSchema = z.object({
  contactName: z.string().min(2, "Recipient name is required"),
  contactPhone: z
    .string()
    .min(8, "Phone number must have at least 8 digits")
    .regex(/^[0-9+\-\s]+$/, "Invalid phone format"),
  contactEmail: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  addressLine1: z.string().min(3, "Delivery address is required"),
  addressLine2: z.string().optional(),
  postalCode: z
    .string()
    .regex(/^\d{6}$/, "Postal code must be 6 digits"),
  remarks: z.string().optional(),
  saveAsFavorite: z.boolean().optional(),
});

export const deliveriesSchema = z.object({
  deliveries: z
    .array(deliveryPointSchema)
    .min(1, "At least one delivery point is required"),
});

export type DeliveryPointForm = z.infer<typeof deliveryPointSchema>;
export type DeliveriesFormSchema = z.infer<typeof deliveriesSchema>;
