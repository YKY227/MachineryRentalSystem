import { z } from "zod";

export const itemSchema = z.object({
  description: z.string().min(3, "Item description is required"),
  category: z.enum([
    "document",
    "parcel",
    "fragile",
    "electronics",
    "food",
    "liquid",
    "oversized",
    "other",
  ]),
  quantity: z
    .number()
    .min(1, "Quantity must be at least 1")
    .max(999, "Quantity too large"),

  weightKg: z
    .number()
    .min(0, "Weight cannot be negative")
    .max(200, "Weight too large"),

  lengthCm: z
    .number()
    .min(0, "Invalid length")
    .max(200, "Length too large"),
  widthCm: z
    .number()
    .min(0, "Invalid width")
    .max(200, "Width too large"),
  heightCm: z
    .number()
    .min(0, "Invalid height")
    .max(200, "Height too large"),

  remarks: z.string().optional(),

  specialHandling: z.boolean().default(false),
});

export type ItemFormSchema = z.infer<typeof itemSchema>;
