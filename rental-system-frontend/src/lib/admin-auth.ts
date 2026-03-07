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
 * Persists a client-side admin session after server auth succeeds.
 */
export async function loginAdmin(
  email: string,
  _password: string
): Promise<AdminSession> {
  if (!email.trim()) {
    throw new Error("Email is required");
  }

  const session: AdminSession = { email: email.trim() };
  setAdminSession(session);
  return session;
}

export function logoutAdmin() {
  setAdminSession(null);
}
