'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';

const btnClass =
  'inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] bg-surface/80 px-3 py-1.5 text-sm text-ink/80 transition hover:border-crimson/40 hover:text-crimson';

/**
 * Navigate to the browser’s previous page only (history.back).
 * Does not force a fixed route such as Menu, Account, or Admin.
 */
export function goToPreviousPage() {
  if (typeof window === 'undefined') return;
  window.history.back();
}

/** Back always returns to the previous page in the browser history. */
export function BackButton({ className = '' }: { className?: string }) {
  const pathname = usePathname();

  // No back on home; previous history is not meaningful as an in-site control
  if (!pathname || pathname === '/') return null;

  return (
    <button
      type="button"
      onClick={goToPreviousPage}
      aria-label="Go to previous page"
      data-tooltip="Back"
      title="Back"
      className={`${btnClass} ${className}`}
    >
      <ArrowLeft size={16} />
      <span>Back</span>
    </button>
  );
}

/** Always available (except on Home) to jump to the home page. */
export function HomeButton({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <Link
      href="/"
      aria-label="Go to home page"
      data-tooltip="Home"
      title="Home"
      className={`${btnClass} ${className}`}
    >
      <Home size={16} />
      <span>Home</span>
    </Link>
  );
}
