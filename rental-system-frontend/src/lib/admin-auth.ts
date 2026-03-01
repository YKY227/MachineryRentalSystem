// src/lib/admin-auth.ts
export type AdminSession = {
  email: string;
};

const STORAGE_KEY = "courier-admin-auth-v1";

export function getCurrentAdmin(): AdminSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAdminSession(session: AdminSession | null) {
  if (typeof window === "undefined") return;

  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

/**
 * Demo login – front-end only for now.
 * Uses NEXT_PUBLIC_ADMIN_DEMO_PASSWORD or falls back to "demo1234".
 */
export async function loginAdmin(
  email: string,
  password: string
): Promise<AdminSession> {
  const demoPassword =
    process.env.NEXT_PUBLIC_ADMIN_DEMO_PASSWORD || "demo1234";

  if (!email || password !== demoPassword) {
    throw new Error("Invalid email or password");
  }

  const session: AdminSession = { email };
  setAdminSession(session);
  return session;
}

export function logoutAdmin() {
  setAdminSession(null);
}
