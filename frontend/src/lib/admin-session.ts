/** Client-side admin session (staff portal only). */

export const ADMIN_SESSION_KEY = 'kdc-admin-session';
export const ADMIN_SESSION_EVENT = 'kdc-admin-session-change';

export type AdminSession = {
  role: string;
  email: string;
  at: number;
};

export function readAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AdminSession;
    if (!data?.role) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeAdminSession(session: Omit<AdminSession, 'at'>): void {
  const payload: AdminSession = { ...session, at: Date.now() };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT));
}

export function clearAdminSession(): void {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT));
}

export function isAdminLoggedIn(): boolean {
  return readAdminSession() !== null;
}
