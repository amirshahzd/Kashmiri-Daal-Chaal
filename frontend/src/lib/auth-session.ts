/** Client-side customer/staff session from /auth login|register. */

export const AUTH_SESSION_KEY = 'kdc-auth-session';
export const AUTH_SESSION_EVENT = 'kdc-auth-session-change';

export type AuthSessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions?: string[];
  branchId?: string;
};

export type AuthSession = {
  user: AuthSessionUser;
  accessToken: string;
  refreshToken?: string;
  storage?: string;
  at: number;
};

export function readAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AuthSession;
    if (!data?.user?.email || !data?.accessToken) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeAuthSession(session: Omit<AuthSession, 'at'>) {
  const payload: AuthSession = { ...session, at: Date.now() };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(payload));
  // Keep legacy key used by older pages
  localStorage.setItem(
    'kdc-user',
    JSON.stringify({
      name: `${session.user.firstName} ${session.user.lastName}`.trim(),
      email: session.user.email,
      id: session.user.id,
      roles: session.user.roles,
    })
  );
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem('kdc-user');
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function isCustomerLoggedIn() {
  const session = readAuthSession();
  if (!session) return false;
  // Staff sessions are not treated as storefront “signed-in customers”
  return !isStaffUser(session.user);
}

export function isStaffUser(user?: AuthSessionUser | null) {
  if (!user) return false;
  return user.roles.some((r) => r !== 'customer');
}

/** Display label — "owner" is shown as Admin (same access). */
export function roleDisplayName(role: string) {
  if (role === 'owner' || role === 'admin') return 'Admin';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function formatRolesLabel(roles: string[] | undefined) {
  if (!roles?.length) return 'customer';
  return roles.map(roleDisplayName).join(', ');
}
