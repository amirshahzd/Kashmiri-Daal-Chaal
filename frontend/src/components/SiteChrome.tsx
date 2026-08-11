'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, ShoppingBag, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState, Suspense } from 'react';
import { useCart } from '@/lib/cart';
import { cn } from '@/lib/utils';
import { BackButton, HomeButton } from '@/components/BackButton';
import {
  AUTH_SESSION_EVENT,
  clearAuthSession,
  isStaffUser,
  readAuthSession,
} from '@/lib/auth-session';
import { ADMIN_SESSION_EVENT, clearAdminSession, readAdminSession } from '@/lib/admin-session';

const publicLinks = [
  { href: '/', label: 'Home', tip: 'Home' },
  { href: '/menu', label: 'Menu', tip: 'Menu' },
  { href: '/order', label: 'Order', tip: 'Order' },
];

const navLinkClass = (active: boolean) =>
  cn(
    'rounded-full px-3.5 py-2 text-sm transition',
    active ? 'bg-crimson text-white' : 'text-ink/80 hover:bg-crimson/10 hover:text-crimson'
  );

const mobileNavLinkClass = (active: boolean) =>
  cn('rounded-lg px-3 py-2.5 text-sm text-left', active ? 'bg-crimson text-white' : 'hover:bg-crimson/10');

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const count = useCart((s) => s.count());
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [customerLoggedIn, setCustomerLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('kdc-theme');
    const preferDark =
      stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(preferDark);
    document.documentElement.classList.toggle('dark', preferDark);
  }, []);

  useEffect(() => {
    const sync = () => {
      const auth = readAuthSession();
      const staff = !!readAdminSession() || isStaffUser(auth?.user);
      setIsAdmin(staff);
      setCustomerLoggedIn(!!auth && !staff);
    };
    sync();
    window.addEventListener(AUTH_SESSION_EVENT, sync);
    window.addEventListener(ADMIN_SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, sync);
      window.removeEventListener(ADMIN_SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Admin may only use the admin portal until logout
  useEffect(() => {
    if (!isAdmin) return;
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return;
    router.replace('/admin');
  }, [isAdmin, pathname, router]);

  function handleLogout() {
    clearAuthSession();
    clearAdminSession();
    setOpen(false);
    window.location.assign('/');
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('kdc-theme', next ? 'dark' : 'light');
  }

  function renderAuthControl(mobile: boolean) {
    if (isAdmin || customerLoggedIn) {
      return (
        <button
          type="button"
          onClick={handleLogout}
          className={mobile ? mobileNavLinkClass(false) : navLinkClass(false)}
          data-tooltip="Logout"
          title="Logout"
          aria-label="Logout"
        >
          Logout
        </button>
      );
    }
    const href = '/account?mode=login';
    const accountActive = pathname === '/account' || pathname.startsWith('/account/');
    return (
      <Link
        href={href}
        onClick={mobile ? () => setOpen(false) : undefined}
        className={mobile ? mobileNavLinkClass(accountActive) : navLinkClass(accountActive)}
        data-tooltip="Sign in"
        title="Sign in"
      >
        Sign in / Sign up
      </Link>
    );
  }

  // Print slip / receipt screens: no chrome — Print + Back only on those pages
  const barePrint =
    pathname.startsWith('/admin/print-slip') || pathname.startsWith('/receipt/');
  if (barePrint) return null;

  if (isAdmin) {
    const adminActive = pathname === '/admin' || pathname.startsWith('/admin/');
    return (
      <header className="print-hide sticky top-0 z-50 border-b border-[var(--kdc-border)] bg-[color-mix(in_srgb,var(--background)_86%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link
            href="/admin"
            className="group flex min-w-0 flex-col leading-none"
            data-tooltip="Admin"
            title="Admin"
          >
            <span className="font-[family-name:var(--font-display)] text-xl tracking-wide text-crimson md:text-2xl">
              Kashmiri Daal Chawal
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-gold">
              Admin portal
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/admin"
              className={navLinkClass(adminActive)}
              data-tooltip="Admin"
              title="Admin"
            >
              Admin
            </Link>
            {renderAuthControl(false)}
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              className="rounded-full border border-[var(--kdc-border)] p-2"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              data-tooltip={open ? 'Close' : 'Menu'}
              title={open ? 'Close' : 'Menu'}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-[var(--kdc-border)] px-4 py-3 md:hidden">
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className={mobileNavLinkClass(adminActive)}
              data-tooltip="Admin"
              title="Admin"
            >
              Admin
            </Link>
            {renderAuthControl(true)}
          </nav>
        )}
      </header>
    );
  }

  return (
    <header className="print-hide sticky top-0 z-50 border-b border-[var(--kdc-border)] bg-[color-mix(in_srgb,var(--background)_86%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Suspense fallback={null}>
            <BackButton className="shrink-0" />
          </Suspense>
          <HomeButton className="shrink-0" />
          <Link
            href="/"
            className="group flex min-w-0 flex-col leading-none"
            data-tooltip="Home"
            title="Home"
          >
            <span className="font-[family-name:var(--font-display)] text-xl tracking-wide text-crimson md:text-2xl">
              Kashmiri Daal Chawal
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-gold">
              Hall Road · Lahore
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {publicLinks.map((l) => {
            const active =
              l.href === '/'
                ? pathname === '/'
                : pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={navLinkClass(active)}
                data-tooltip={l.tip}
                title={l.tip}
              >
                {l.label}
              </Link>
            );
          })}
          {renderAuthControl(false)}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={dark ? 'Light mode' : 'Dark mode'}
            data-tooltip={dark ? 'Light' : 'Dark'}
            title={dark ? 'Light' : 'Dark'}
            onClick={toggleTheme}
            className="rounded-full border border-[var(--kdc-border)] p-2 text-ink/80 hover:text-crimson"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link
            href="/cart"
            className="relative rounded-full border border-[var(--kdc-border)] p-2 text-ink/80 hover:text-crimson"
            aria-label="Cart"
            data-tooltip="Cart"
            title="Cart"
          >
            <ShoppingBag size={18} />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          <button
            type="button"
            className="rounded-full border border-[var(--kdc-border)] p-2 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            data-tooltip={open ? 'Close' : 'Menu'}
            title={open ? 'Close' : 'Menu'}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-[var(--kdc-border)] px-4 py-3 md:hidden">
          {publicLinks.map((l) => {
            const active =
              l.href === '/'
                ? pathname === '/'
                : pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={mobileNavLinkClass(active)}
                data-tooltip={l.tip}
                title={l.tip}
              >
                {l.label}
              </Link>
            );
          })}
          {renderAuthControl(true)}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const sync = () => {
      const auth = readAuthSession();
      setIsAdmin(!!readAdminSession() || isStaffUser(auth?.user));
    };
    sync();
    window.addEventListener(AUTH_SESSION_EVENT, sync);
    window.addEventListener(ADMIN_SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, sync);
      window.removeEventListener(ADMIN_SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (pathname.startsWith('/admin/print-slip') || pathname.startsWith('/receipt/')) return null;
  if (isAdmin) return null;

  return (
    <footer className="print-hide mt-20 border-t border-[var(--kdc-border)] bg-crimson-deep text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-3 md:px-6">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl text-gold-soft">
            Kashmiri Daal Chawal
          </p>
          <p className="mt-3 max-w-sm text-sm text-white/75">
            Eat in, take away, and order online. Halal Kashmiri comfort food from Hall Road, Lahore.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Visit</p>
          <p className="mt-3 text-sm text-white/80">Hall Road, Lahore, Pakistan</p>
          <p className="text-sm text-white/80">+92 42 3575 0000</p>
          <p className="text-sm text-white/80">hello@kashmiridaalchawal.pk</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Also on</p>
          <ul className="mt-3 space-y-1 text-sm text-white/80">
            <li>Foodpanda</li>
            <li>Bykea</li>
            <li>Careem</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} Kashmiri Daal Chawal. All rights reserved.
      </div>
    </footer>
  );
}
