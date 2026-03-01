// src/lib/config.ts

export const USE_BACKEND =
  process.env.NEXT_PUBLIC_USE_BACKEND === "true";

/**
 * Browser-facing base URL.
 * Always go through Next.js proxy to reach NestJS safely.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/backend";

/**
 * Server-only Nest base URL.
 * DO NOT use this in client components / browser fetches.
 * Only the Next.js API proxy route should use this.
 */
export const BACKEND_BASE =
  process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:3001";
