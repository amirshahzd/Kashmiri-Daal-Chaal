'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BRANCH, formatPKR } from '@/lib/data';
import {
  findOrderByBarcode,
  formatType,
  labelStatus,
  markDeliveredByBarcode,
  paymentLabel,
  type OpsOrder,
  ORDERS_EVENT,
} from '@/lib/order-workflow';

/**
 * Mobile driver page: scan/open barcode from slip or type barcode number,
 * then press Delivered to update status online.
 */
function DriverInner() {
  const searchParams = useSearchParams();
  const initial = (searchParams.get('c') || searchParams.get('code') || '').trim().toUpperCase();
  const [code, setCode] = useState(initial);
  const [order, setOrder] = useState<OpsOrder | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  function lookup(value: string) {
    setError('');
    setSuccess('');
    const found = findOrderByBarcode(value);
    if (!found) {
      setOrder(null);
      setError('No order found for this barcode. Check the slip number.');
      return;
    }
    setOrder(found);
  }

  useEffect(() => {
    if (initial) lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    const refresh = () => {
      if (!code.trim()) return;
      const found = findOrderByBarcode(code);
      if (found) setOrder(found);
    };
    window.addEventListener(ORDERS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ORDERS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [code]);

  function onLookup(e: FormEvent) {
    e.preventDefault();
    lookup(code);
  }

  function onDelivered() {
    setBusy(true);
    setError('');
    setSuccess('');
    const res = markDeliveredByBarcode(code, 'delivery-driver');
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      if (res.order) setOrder(res.order);
      return;
    }
    setSuccess(res.message);
    if (res.order) setOrder(res.order);
  }

  return (
    <div className="mx-auto min-h-[100svh] max-w-md px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Delivery driver</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-ink">
        Confirm delivery
      </h1>
      <p className="mt-2 text-sm text-muted">
        Scan the slip barcode (or open the link from the QR code), or type the barcode number. Then
        press <strong>Delivered</strong> so the system updates online.
      </p>
      <p className="mt-1 text-xs text-muted">{BRANCH.name} · {BRANCH.phone}</p>

      <form onSubmit={onLookup} className="mt-8 space-y-3">
        <label className="block text-sm font-medium">
          Delivery barcode
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. KDC1234ABCD"
            className="mt-2 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 font-mono text-base tracking-wider outline-none focus:ring-2 focus:ring-crimson"
            autoComplete="off"
            inputMode="text"
          />
        </label>
        <button type="submit" className="kdc-button kdc-button-primary w-full">
          Look up order
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-xl bg-crimson/10 px-3 py-2 text-sm text-crimson" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-4 rounded-xl border border-emerald-400/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      )}

      {order && (
        <div className="mt-6 rounded-2xl border border-[var(--kdc-border)] bg-surface p-5">
          <p className="font-mono text-xs text-gold">{order.id}</p>
          <p className="mt-1 text-xl font-semibold">{order.customerName || 'Customer'}</p>
          <p className="text-sm text-muted">
            {formatType(order)} · {labelStatus(order.status)}
          </p>
          <p className="mt-2 text-sm">
            <span className="text-muted">Phone:</span> {order.customerPhone || '—'}
          </p>
          {(order.orderType === 'delivery' || order.type === 'delivery') && (
            <p className="mt-1 text-sm">
              <span className="text-muted">Address:</span> {order.deliveryAddress || '—'}
            </p>
          )}
          <p className="mt-1 text-sm">
            <span className="text-muted">Payment:</span> {paymentLabel(order)}
          </p>
          <p className="mt-3 text-lg font-semibold text-crimson">{formatPKR(order.total)}</p>
          {order.paymentStatus === 'cod' && order.status !== 'delivered' && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-sm font-medium text-amber-900">
              Collect cash: {formatPKR(order.total)}
            </p>
          )}

          {order.status === 'delivered' ? (
            <p className="mt-5 rounded-xl bg-emerald-100 px-3 py-3 text-center text-sm font-semibold text-emerald-900">
              ✓ Food delivered successfully
              {order.deliveredAt && (
                <span className="mt-1 block text-xs font-normal">
                  {new Date(order.deliveredAt).toLocaleString('en-PK')}
                </span>
              )}
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onDelivered}
              className="kdc-button kdc-button-gold mt-5 w-full !py-4 text-base font-semibold disabled:opacity-60"
            >
              {busy ? 'Updating…' : 'Delivered — food handed over'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DriverPage() {
  return (
    <Suspense fallback={<p className="px-4 py-16 text-center text-sm text-muted">Loading driver…</p>}>
      <DriverInner />
    </Suspense>
  );
}
