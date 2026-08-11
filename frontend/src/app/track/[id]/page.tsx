'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BRANCH, formatPKR } from '@/lib/data';

type StoredOrder = {
  id: string;
  status: string;
  orderType: string;
  total: number;
  subtotal?: number;
  discount?: number;
  tax?: number;
  deliveryFee?: number;
  payment?: string;
  paymentStatus?: string;
  paymentRef?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  tableNumber?: string;
  specialInstructions?: string;
  createdAt: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    specialInstructions?: string;
  }>;
};

/** Stages shown only when admin advances them — order starts at “received”. */
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

function loadOrder(id: string): StoredOrder | null {
  try {
    const history = JSON.parse(localStorage.getItem('kdc-orders') || '[]') as StoredOrder[];
    const fromHistory = history.find((o) => o.id === id);
    if (fromHistory) return fromHistory;
    const raw = localStorage.getItem('kdc-last-order');
    if (raw) {
      const parsed = JSON.parse(raw) as StoredOrder;
      if (parsed.id === id) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function TrackInner({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const justPlaced = searchParams.get('placed') === '1';
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [showPlacedBanner, setShowPlacedBanner] = useState(justPlaced);

  const refresh = useCallback(() => {
    setOrder(loadOrder(id));
  }, [id]);

  useEffect(() => {
    refresh();
    // Re-read when admin updates status (another tab or this tab via event)
    const onChange = () => refresh();
    window.addEventListener('storage', onChange);
    window.addEventListener('kdc-orders-change', onChange);
    const poll = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('kdc-orders-change', onChange);
      clearInterval(poll);
    };
  }, [refresh]);

  const steps = useMemo(() => {
    if (order?.orderType === 'delivery') return [...DELIVERY_STEPS];
    return [...COLLECTION_STEPS];
  }, [order?.orderType]);

  const statusKey = (order?.status || 'received').toLowerCase();
  const orderClosed = statusKey === 'delivered' || statusKey === 'cancelled' || statusKey === 'canceled';
  let resolvedIdx = steps.findIndex((s) => s === statusKey);
  if (resolvedIdx < 0) resolvedIdx = 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Order tracking</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Order {id}</h1>

      {orderClosed ? (
        <>
          <p className="mt-6 text-muted">
            This order has already been completed. Delivery status is no longer available.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/account" className="kdc-button kdc-button-primary">
              Back to account
            </Link>
            <Link href="/menu" className="kdc-button border border-crimson/30 text-crimson">
              Order again
            </Link>
          </div>
        </>
      ) : (
        <>
          {showPlacedBanner && (
            <div
              className="mt-6 rounded-2xl border border-green-700/30 bg-green-700/10 px-4 py-4 text-sm text-green-900 dark:text-green-300"
              role="status"
            >
              <p className="text-base font-semibold">Your order has been placed successfully.</p>
              <p className="mt-1">
                We have received order <strong>{id}</strong>
                {order?.total != null ? ` · ${formatPKR(order.total)}` : ''}. Staff will update each stage
                below as your order is prepared — only the kitchen/admin can change the status.
              </p>
              <button
                type="button"
                className="mt-3 text-xs underline opacity-80"
                onClick={() => setShowPlacedBanner(false)}
              >
                Dismiss
              </button>
            </div>
          )}

          {order && (
            <p className="mt-2 text-muted">
              {order.orderType.replace('_', ' ')} · {formatPKR(order.total)}
              {order.customerName ? ` · ${order.customerName}` : ''}
            </p>
          )}
          {!order && (
            <p className="mt-2 text-sm text-muted">
              Looking up your order… If this is a new order, status starts at Received until the restaurant
              updates it.
            </p>
          )}
          {order?.payment && (
            <p className="mt-1 text-sm text-muted">
              Payment: {order.payment}
              {order.paymentStatus === 'paid'
                ? ' · Paid'
                : order.paymentStatus === 'cod'
                  ? ' · Cash on collection'
                  : ''}
              {order.paymentRef ? ` · Ref ${order.paymentRef}` : ''}
            </p>
          )}
          <p className="mt-1 text-sm text-muted">Collect / kitchen: {BRANCH.address}</p>

          <ol className="mt-10 space-y-4">
            {steps
              .filter((s) => s !== 'delivered')
              .map((s, i) => {
                const done = i < resolvedIdx;
                const current = i === resolvedIdx;
                return (
                  <li key={s} className="flex items-center gap-4">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                        current
                          ? 'bg-crimson text-white ring-2 ring-crimson/30'
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

          <p className="mt-8 rounded-xl bg-crimson/5 px-4 py-3 text-sm text-crimson">
            Current status (set by restaurant only):{' '}
            <strong>{labelStatus(statusKey === 'received' && !order ? 'received' : statusKey)}</strong>
          </p>
          <p className="mt-2 text-xs text-muted">
            Stages do not advance automatically. When the kitchen updates your order, this page refreshes
            itself.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/receipt/${id}`} className="kdc-button kdc-button-primary">
              View / print receipt
            </Link>
            <Link href="/account" className="kdc-button border border-crimson/30 text-crimson">
              My orders
            </Link>
            <Link href="/menu" className="kdc-button border border-crimson/30 text-crimson">
              Order again
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p className="px-4 py-16 text-center text-sm text-muted">Loading order…</p>}>
      <TrackInner id={id} />
    </Suspense>
  );
}
