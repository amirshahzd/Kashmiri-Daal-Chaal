'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BRANCH, formatPKR } from '@/lib/data';
import { api, ApiError } from '@/lib/api';
import {
  clearAuthSession,
  formatRolesLabel,
  isStaffUser,
  readAuthSession,
  writeAuthSession,
  type AuthSessionUser,
} from '@/lib/auth-session';
import { writeAdminSession, clearAdminSession } from '@/lib/admin-session';

type Mode = 'login' | 'register' | 'forgot';

type LocalOrder = {
  id: string;
  total: number;
  orderType: string;
  createdAt: string;
  status: string;
  items?: Array<{ name: string; quantity: number }>;
  loyaltyPointsEarned?: number;
  payment?: string;
  paymentStatus?: string;
};

const DELIVERY_STEPS = [
  'received',
  'accepted',
  'preparing',
  'cooking',
  'ready',
  'out_for_delivery',
  'delivered',
] as const;

const COLLECTION_STEPS = [
  'received',
  'accepted',
  'preparing',
  'cooking',
  'ready',
  'delivered',
] as const;

function labelStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Delivered orders are no longer trackable for customers. */
function isOrderClosedForCustomer(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'delivered' || s === 'cancelled' || s === 'canceled';
}

function readLocalOrdersList(): LocalOrder[] {
  try {
    const o = localStorage.getItem('kdc-orders');
    if (o) return JSON.parse(o) as LocalOrder[];
  } catch {
    /* ignore */
  }
  return [];
}

/** Newest order that is still in progress (not delivered/received by customer). */
function findActiveTrackableOrder(list: LocalOrder[]): LocalOrder | null {
  for (const o of list) {
    if (o?.id && !isOrderClosedForCustomer(o.status || '')) return o;
  }
  try {
    const raw = localStorage.getItem('kdc-last-order');
    if (raw) {
      const last = JSON.parse(raw) as LocalOrder;
      if (last?.id && !isOrderClosedForCustomer(last.status || '')) return last;
    }
  } catch {
    /* ignore */
  }
  return null;
}

type LoyaltyInfo = {
  tierLabel: string;
  points: number;
  totalSpent?: number;
  earnRule: string;
  redeemRule: string;
  nextTierHint: string;
  codes: Array<{ code: string; label: string; available: boolean }>;
};

type CustomerProfile = {
  phone?: string;
  full_address?: string;
  city?: string;
  address_line1?: string;
  loyalty_points?: number;
  total_orders?: number;
  total_spent?: number;
  loyalty?: LoyaltyInfo;
};

type AuthApiResult = {
  user: AuthSessionUser;
  accessToken: string;
  refreshToken?: string;
  storage?: string;
  message?: string;
};

function AccountInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get('mode') as Mode) || 'login';

  const [mode, setMode] = useState<Mode>(
    initialMode === 'register' || initialMode === 'forgot' ? initialMode : 'login'
  );
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [trackOrder, setTrackOrder] = useState<LocalOrder | null>(null);

  const refreshTrackableOrder = useCallback(() => {
    const list = readLocalOrdersList();
    // Prefer live status from local store (admin updates) over stale API list
    const fromLocal = findActiveTrackableOrder(list);
    if (fromLocal) {
      setTrackOrder(fromLocal);
      return;
    }
    setTrackOrder(findActiveTrackableOrder(orders));
  }, [orders]);

  async function loadCustomerData() {
    const session = readAuthSession();
    if (!session?.accessToken) return;
    try {
      const [me, remoteOrders] = await Promise.all([
        api<CustomerProfile>('/customers/me', { token: session.accessToken }),
        api<{ orders: Array<Record<string, unknown>> }>('/customers/me/orders', {
          token: session.accessToken,
        }),
      ]);
      setProfile(me);
      const mapped: LocalOrder[] = (remoteOrders.orders || []).map((o) => ({
        id: String(o.id || o.order_number || ''),
        total: Number(o.total ?? o.total_amount ?? 0),
        orderType: String(o.orderType || o.order_type || ''),
        createdAt: String(o.createdAt || o.created_at || new Date().toISOString()),
        status: String(o.status || 'received'),
        items: Array.isArray(o.items)
          ? (o.items as Array<{ name: string; quantity: number }>)
          : undefined,
        loyaltyPointsEarned: Number(o.loyaltyPointsEarned || 0) || undefined,
        payment: typeof o.payment === 'string' ? o.payment : undefined,
        paymentStatus: typeof o.paymentStatus === 'string' ? o.paymentStatus : undefined,
      }));
      if (mapped.length) {
        // Merge remote with local so admin status updates on this device are kept
        const local = readLocalOrdersList();
        const byId = new Map(mapped.map((o) => [o.id, o]));
        for (const lo of local) {
          const remote = byId.get(lo.id);
          if (!remote) {
            byId.set(lo.id, lo);
          } else if (lo.status && lo.status !== remote.status) {
            // Local kitchen/admin status is source of truth on this browser
            byId.set(lo.id, { ...remote, ...lo, status: lo.status });
          }
        }
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setOrders(merged);
        localStorage.setItem('kdc-orders', JSON.stringify(merged.slice(0, 30)));
      } else {
        setOrders(readLocalOrdersList());
      }
    } catch {
      setOrders(readLocalOrdersList());
    }
  }

  useEffect(() => {
    const session = readAuthSession();
    if (session) {
      if (isStaffUser(session.user)) {
        router.replace('/admin');
        return;
      }
      setUser(session.user);
      void loadCustomerData();
    } else {
      setOrders(readLocalOrdersList());
    }
  }, [router]);

  useEffect(() => {
    const m = searchParams.get('mode') as Mode | null;
    if (m === 'login' || m === 'register' || m === 'forgot') setMode(m);
    if (searchParams.get('placed') === '1') {
      setMessage(
        'Your order has been placed successfully. You can track it from Track your order below.'
      );
      // Clean query so refresh does not re-show as new placement forever
      router.replace('/account', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    refreshTrackableOrder();
    const onChange = () => {
      // orders list may also sync from storage
      setOrders(readLocalOrdersList());
      refreshTrackableOrder();
    };
    window.addEventListener('storage', onChange);
    window.addEventListener('kdc-orders-change', onChange);
    const poll = setInterval(refreshTrackableOrder, 3000);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('kdc-orders-change', onChange);
      clearInterval(poll);
    };
  }, [refreshTrackableOrder]);

  const trackSteps = useMemo(() => {
    if (!trackOrder) return [...COLLECTION_STEPS];
    if ((trackOrder.orderType || '').toLowerCase() === 'delivery') return [...DELIVERY_STEPS];
    return [...COLLECTION_STEPS];
  }, [trackOrder]);

  const trackStatusKey = (trackOrder?.status || 'received').toLowerCase();
  let trackIdx = trackSteps.findIndex((s) => s === trackStatusKey);
  if (trackIdx < 0) trackIdx = 0;

  function onTrackClick() {
    refreshTrackableOrder();
    setShowTrack(true);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
    router.replace(next === 'login' ? '/account' : `/account?mode=${next}`);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);

    try {
      if (mode === 'forgot') {
        const email = String(fd.get('email') || '').trim();
        if (!email) {
          setError('Please enter your email address.');
          return;
        }
        await api<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setMessage('Reset login details have been emailed.');
        return;
      }

      if (mode === 'register') {
        const password = String(fd.get('password') || '');
        const confirm = String(fd.get('confirmPassword') || '');
        const phone = String(fd.get('phone') || '').trim();
        if (!phone) {
          setError('Contact number is required.');
          return;
        }
        if (password !== confirm) {
          setError('Passwords do not match.');
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }

        const result = await api<AuthApiResult>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            firstName: String(fd.get('firstName') || '').trim(),
            lastName: String(fd.get('lastName') || '').trim(),
            email: String(fd.get('email') || '').trim(),
            phone,
            password,
            dateOfBirth: String(fd.get('dateOfBirth') || '') || undefined,
            addressLine1: String(fd.get('addressLine1') || '').trim() || undefined,
            addressLine2: String(fd.get('addressLine2') || '').trim() || undefined,
            city: String(fd.get('city') || '').trim() || undefined,
            postcode: String(fd.get('postcode') || '').trim() || undefined,
            country: String(fd.get('country') || 'Pakistan').trim() || 'Pakistan',
            marketingOptIn: fd.get('marketingOptIn') === 'on',
          }),
        });

        writeAuthSession({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          storage: result.storage,
        });
        clearAdminSession();

        const successMsg =
          result.message || 'Your account has been created successfully. You are now signed in.';
        setMessage(successMsg);
        setUser(result.user);
        form.reset();
        void loadCustomerData();
        return;
      }

      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!email || !password) {
        setError('Invalid login details');
        return;
      }

      const result = await api<AuthApiResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      writeAuthSession({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        storage: result.storage,
      });

      if (isStaffUser(result.user)) {
        const r = result.user.roles.find((role) => role !== 'customer') || 'admin';
        writeAdminSession({
          role: r === 'owner' ? 'admin' : r,
          email: result.user.email,
        });
        setBusy(false);
        router.replace('/admin');
        return;
      }

      clearAdminSession();
      setUser(result.user);
      setMessage('You have signed in successfully.');
      void loadCustomerData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Request failed';
      if (mode === 'register') {
        setError(
          msg.includes('already') || msg.includes('registered')
            ? msg
            : msg === 'Request failed'
              ? 'Could not create account. Please try again.'
              : msg
        );
      } else if (mode === 'login') {
        setError(
          msg === 'Invalid credentials' || msg.includes('Invalid') ? 'Invalid login details' : msg
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const session = readAuthSession();
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session?.refreshToken }),
        token: session?.accessToken,
      });
    } catch {
      /* ignore network */
    }
    clearAuthSession();
    clearAdminSession();
    window.location.assign('/');
  }

  if (user) {
    const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
    const staff = isStaffUser(user);
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-14">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              {staff ? 'Staff account' : 'Your account'}
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
              {displayName}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {user.email}
              <span className="mx-2">·</span>
              Roles: {formatRolesLabel(user.roles)}
            </p>
          </div>
          <button type="button" onClick={() => void logout()} className="text-sm text-crimson underline">
            Sign out
          </button>
        </div>

        {message && (
          <p className="mt-4 rounded-xl border border-green-700/30 bg-green-700/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
            {message}
          </p>
        )}

        {!staff && (
          <>
            {profile && (
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted">Loyalty</p>
                  <p className="mt-1 text-lg font-semibold text-crimson">
                    {profile.loyalty?.tierLabel || 'Bronze'} · {profile.loyalty_points || 0} pts
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted">Orders</p>
                  <p className="mt-1 text-lg font-semibold">{profile.total_orders ?? orders.length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted">Spent</p>
                  <p className="mt-1 text-lg font-semibold">{formatPKR(Number(profile.total_spent || 0))}</p>
                </div>
              </div>
            )}

            <div className="mt-10">
              <button
                type="button"
                onClick={onTrackClick}
                className="kdc-button kdc-button-primary w-full sm:w-auto"
              >
                Track your order
              </button>
            </div>

            {showTrack && (
              <div className="mt-6 rounded-2xl border border-[var(--kdc-border)] bg-surface px-4 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">
                    Order status
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowTrack(false)}
                    className="text-sm text-muted underline"
                  >
                    Close
                  </button>
                </div>

                {!trackOrder ? (
                  <p className="mt-4 text-sm text-muted">You have not placed an order yet.</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-muted">
                      Order <span className="font-medium text-ink">{trackOrder.id}</span>
                      {trackOrder.orderType ? ` · ${trackOrder.orderType}` : ''}
                      {trackOrder.total != null ? ` · ${formatPKR(trackOrder.total)}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">Kitchen: {BRANCH.address}</p>
                    <ol className="mt-6 space-y-3">
                      {/* Hide final “delivered” step from customers — when delivered, panel shows empty state */}
                      {trackSteps
                        .filter((s) => s !== 'delivered')
                        .map((s, i) => {
                          const done = i < trackIdx;
                          const current = i === trackIdx;
                          return (
                            <li key={s} className="flex items-center gap-3 text-sm">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                  current
                                    ? 'bg-crimson text-white'
                                    : done
                                      ? 'bg-crimson/80 text-white'
                                      : 'border border-[var(--kdc-border)] text-muted'
                                }`}
                              >
                                {done ? '✓' : i + 1}
                              </span>
                              <span
                                className={
                                  current
                                    ? 'font-semibold text-ink'
                                    : done
                                      ? 'text-ink/70'
                                      : 'text-muted'
                                }
                              >
                                {labelStatus(s)}
                                {current ? ' · now' : done ? ' · done' : ''}
                              </span>
                            </li>
                          );
                        })}
                    </ol>
                    <p className="mt-4 rounded-xl bg-crimson/5 px-3 py-2 text-sm text-crimson">
                      Current status: <strong>{labelStatus(trackStatusKey)}</strong>
                    </p>
                  </>
                )}
              </div>
            )}

            <h2 className="mt-10 font-[family-name:var(--font-display)] text-2xl">Recent orders</h2>
            <ul className="mt-4 space-y-3">
              {orders.length === 0 && <li className="text-sm text-muted">No orders yet.</li>}
              {orders.slice(0, 8).map((o) => (
                <li key={o.id} className="border-b border-[var(--kdc-border)] py-3 text-sm">
                  <span className="font-medium">{o.id}</span>
                  <span className="mx-2 text-muted">·</span>
                  {formatPKR(o.total)}
                  <span className="mx-2 text-muted">·</span>
                  {o.orderType}
                  {!isOrderClosedForCustomer(o.status) && (
                    <>
                      <span className="mx-2 text-muted">·</span>
                      <span className="text-crimson">{labelStatus(o.status || 'received')}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-8">
              <Link href="/order" className="text-sm text-crimson underline">
                Order again
              </Link>
            </p>
          </>
        )}

        {staff && (
          <p className="mt-8 max-w-xl text-sm text-muted">
            Your staff account is stored in the accounts database
            {readAuthSession()?.storage === 'file' ? ' (local file store while Postgres is offline)' : ''}.
            Use Admin for attendance, inventory, and payroll.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Members</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
        {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Sign up' : 'Forgot password'}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {mode === 'register'
          ? 'Create a customer account. Staff access is only assigned by Admin after you contact the restaurant.'
          : mode === 'login'
            ? 'Sign in with the email and password you registered.'
            : 'We will send a reset link if the email exists.'}
      </p>

      {error && (
        <p
          className="mt-4 rounded-xl border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson"
          role="alert"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          className="mt-4 rounded-xl border border-green-700/30 bg-green-700/10 px-4 py-3 text-sm text-green-800 dark:text-green-300"
          role="status"
        >
          {message}
        </p>
      )}

      <div className="mt-6">
        <button type="button" onClick={onTrackClick} className="kdc-button kdc-button-gold w-full">
          Track your order
        </button>
        {showTrack && (
          <div className="mt-4 rounded-2xl border border-[var(--kdc-border)] bg-surface px-4 py-4 text-sm">
            {!trackOrder ? (
              <p className="text-muted">You have not placed an order yet.</p>
            ) : (
              <>
                <p className="font-medium text-ink">Order {trackOrder.id}</p>
                <p className="mt-1 text-muted">
                  Current status: <strong className="text-crimson">{labelStatus(trackStatusKey)}</strong>
                  {trackOrder.total != null ? ` · ${formatPKR(trackOrder.total)}` : ''}
                </p>
                <ol className="mt-4 space-y-2">
                  {trackSteps
                    .filter((s) => s !== 'delivered')
                    .map((s, i) => {
                      const done = i < trackIdx;
                      const current = i === trackIdx;
                      return (
                        <li key={s} className="flex items-center gap-2 text-xs">
                          <span
                            className={
                              current ? 'font-semibold text-ink' : done ? 'text-ink/70' : 'text-muted'
                            }
                          >
                            {done ? '✓ ' : current ? '● ' : '○ '}
                            {labelStatus(s)}
                            {current ? ' · now' : ''}
                          </span>
                        </li>
                      );
                    })}
                </ol>
              </>
            )}
          </div>
        )}
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
        {mode === 'register' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="firstName"
                required
                placeholder="First name"
                className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
              />
              <input
                name="lastName"
                required
                placeholder="Last name"
                className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
              />
            </div>
            <input
              name="phone"
              type="tel"
              required
              minLength={7}
              placeholder="Contact number (required)"
              className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
            />
            <input
              name="dateOfBirth"
              type="date"
              className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
            />
            <input
              name="addressLine1"
              placeholder="Address line 1"
              className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
            />
            <input
              name="addressLine2"
              placeholder="Address line 2 (optional)"
              className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="city"
                placeholder="City"
                defaultValue="Lahore"
                className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
              />
              <input
                name="postcode"
                placeholder="Postcode"
                className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
              />
            </div>
            <input
              name="country"
              placeholder="Country"
              defaultValue="Pakistan"
              className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
            />
          </>
        )}

        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          autoComplete="email"
          className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
        />

        {mode !== 'forgot' && (
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 characters)"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
          />
        )}

        {mode === 'register' && (
          <>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              placeholder="Confirm password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
            />
            <label className="flex items-start gap-2 text-sm text-muted">
              <input name="marketingOptIn" type="checkbox" className="mt-1" />
              Email me offers and loyalty updates from Kashmiri Daal Chawal
            </label>
          </>
        )}

        <button type="submit" disabled={busy} className="kdc-button kdc-button-primary w-full disabled:opacity-60">
          {busy
            ? 'Please wait…'
            : mode === 'login'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create account'
                : 'Send reset link'}
        </button>
      </form>

      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        {mode !== 'login' && (
          <button type="button" className="text-crimson underline" onClick={() => switchMode('login')}>
            Sign in
          </button>
        )}
        {mode !== 'register' && (
          <button type="button" className="text-crimson underline" onClick={() => switchMode('register')}>
            Sign up
          </button>
        )}
        {mode !== 'forgot' && (
          <button type="button" className="text-muted underline" onClick={() => switchMode('forgot')}>
            Forgot password
          </button>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="px-4 py-16 text-center text-sm text-muted">Loading…</p>}>
      <AccountInner />
    </Suspense>
  );
}
