'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NoticeInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (searchParams.get('placed') !== '1') return;
    setMessage('Your order has been placed successfully.');
    router.replace('/', { scroll: false });
  }, [searchParams, router]);

  if (!message) return null;

  return (
    <div
      className="fixed inset-x-0 top-16 z-[60] mx-auto max-w-lg px-4"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-green-700/30 bg-green-700/10 px-4 py-3 text-center text-sm text-green-900 shadow-lg dark:text-green-300">
        {message}
      </div>
    </div>
  );
}

/** Success banner after guest checkout redirects to the home page. */
export function OrderPlacedNotice() {
  return (
    <Suspense fallback={null}>
      <NoticeInner />
    </Suspense>
  );
}
