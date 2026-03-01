// Shared utility helpers for the courier frontend.

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(value: number, currency: string = "SGD") {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
  }).format(value);
}
