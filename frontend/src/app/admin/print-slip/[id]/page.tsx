'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BRANCH, formatPKR } from '@/lib/data';
import {
  formatType,
  generateDeliveryBarcode,
  getOpsOrder,
  labelStatus,
  paymentLabel,
  type OpsOrder,
  writeOpsOrders,
  readOpsOrders,
} from '@/lib/order-workflow';

/** Ensure barcode exists on order for driver scan. */
function withBarcode(order: OpsOrder): OpsOrder {
  if (order.deliveryBarcode) return order;
  const deliveryBarcode = generateDeliveryBarcode(order.id);
  const next = { ...order, deliveryBarcode };
  try {
    const list = readOpsOrders().map((o) => (o.id === order.id ? next : o));
    if (!list.some((o) => o.id === order.id)) list.unshift(next);
    writeOpsOrders(list);
    localStorage.setItem('kdc-last-order', JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Delivery / collection slip — Print + Back only. Barcode for driver phone scan. */
export default function PrintSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OpsOrder | null>(null);

  useEffect(() => {
    const found = getOpsOrder(id);
    if (found) setOrder(withBarcode(found));
    const q = new URLSearchParams(window.location.search);
    if (q.get('auto') === '1') {
      const t = window.setTimeout(() => window.print(), 600);
      return () => window.clearTimeout(t);
    }
  }, [id]);

  const driverUrl = useMemo(() => {
    if (!order?.deliveryBarcode || typeof window === 'undefined') return '';
    return `${window.location.origin}/driver?c=${encodeURIComponent(order.deliveryBarcode)}`;
  }, [order?.deliveryBarcode]);

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted">Slip not found for {id}.</p>
        <div className="mt-6 flex justify-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="kdc-button kdc-button-primary min-w-[120px]"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="min-w-[120px] rounded-full border-2 border-ink bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-sm hover:bg-ink/5"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const isDelivery = (order.orderType || order.type) === 'delivery';
  const isCod = order.paymentStatus === 'cod';
  const code = order.deliveryBarcode || '';

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* Print + Back only — high-contrast on light page */}
      <div className="mb-4 flex gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="kdc-button kdc-button-primary flex-1 !py-3 text-base font-semibold"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex-1 rounded-full border-2 border-ink bg-white px-5 py-3 text-base font-semibold text-ink shadow-sm hover:bg-ink/5"
        >
          Back
        </button>
      </div>

      <article className="rounded-2xl border-2 border-ink bg-white p-5 text-ink print:border print:shadow-none">
        <header className="border-b-2 border-dashed border-ink pb-3 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl">{BRANCH.name}</p>
          <p className="text-xs">{BRANCH.address}</p>
          <p className="text-xs">{BRANCH.phone}</p>
          <p className="mt-2 text-sm font-bold uppercase tracking-widest">
            {isDelivery ? 'Delivery slip' : 'Collection slip'}
          </p>
          <p className="mt-1 font-mono text-sm font-bold">{order.id}</p>
          <p className="text-xs text-muted">
            {order.createdAt ? new Date(order.createdAt).toLocaleString('en-PK') : ''}
          </p>
        </header>

        <section className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-semibold">Customer:</span> {order.customerName || '—'}
          </p>
          <p>
            <span className="font-semibold">Contact:</span> {order.customerPhone || '—'}
          </p>
          <p>
            <span className="font-semibold">Order type:</span> {formatType(order)}
          </p>
          <p>
            <span className="font-semibold">Status:</span> {labelStatus(order.status)}
          </p>
          {isDelivery && (
            <p className="rounded-lg border border-ink/20 bg-amber-50 p-2">
              <span className="font-semibold">Delivery address:</span>
              <br />
              {order.deliveryAddress || '—'}
            </p>
          )}
          <p className="rounded-lg border border-ink/20 p-2">
            <span className="font-semibold">Payment method:</span> {order.payment || '—'}
            <br />
            <span className="font-semibold">Payment status:</span> {paymentLabel(order)}
            {order.paymentRef && (
              <>
                <br />
                <span className="font-semibold">Ref:</span> {order.paymentRef}
              </>
            )}
            {isCod && (
              <>
                <br />
                <span className="font-bold text-crimson">
                  Collect cash from customer: {formatPKR(order.total)}
                </span>
              </>
            )}
          </p>
        </section>

        <section className="mt-4 border-t border-dashed border-ink pt-3">
          <p className="text-xs font-bold uppercase tracking-wider">Items</p>
          <ul className="mt-2 space-y-1 text-sm">
            {(order.items || []).map((it, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {it.quantity}× {it.name}
                </span>
                <span>{formatPKR(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {order.specialInstructions && (
            <p className="mt-2 text-xs italic">Notes: {order.specialInstructions}</p>
          )}
          <p className="mt-3 flex justify-between border-t border-ink pt-2 text-base font-bold">
            <span>Total</span>
            <span>{formatPKR(order.total)}</span>
          </p>
        </section>

        {/* Delivery driver barcode */}
        <section className="mt-5 border-t-2 border-ink pt-4 text-center">
          <p className="text-xs font-bold uppercase tracking-widest">Driver delivery barcode</p>
          <p className="mt-1 text-[11px] text-muted">
            Scan or open on phone → mark Delivered when food is handed over
          </p>
          {driverUrl ? (
            <a href={driverUrl} className="mt-3 inline-block">
              <QRCodeSVG value={driverUrl} size={148} level="M" includeMargin />
            </a>
          ) : (
            <div className="mx-auto mt-3 h-[148px] w-[148px] bg-muted/20" />
          )}
          {/* Visual bar code style strip */}
          <div
            className="mx-auto mt-3 flex h-12 max-w-[280px] items-stretch justify-center overflow-hidden"
            aria-hidden
          >
            {code.split('').map((ch, i) => (
              <span
                key={i}
                className="bg-ink"
                style={{
                  width: 2 + (ch.charCodeAt(0) % 4),
                  marginRight: i % 3 === 0 ? 3 : 1,
                  opacity: 0.85 + (ch.charCodeAt(0) % 3) * 0.05,
                }}
              />
            ))}
          </div>
          <p className="mt-2 font-mono text-lg font-bold tracking-wider">{code}</p>
          <p className="mt-1 text-[10px] text-muted">Enter this number on /driver if scan fails</p>
        </section>

        <footer className="mt-6 grid grid-cols-2 gap-6 text-center text-xs text-muted">
          <div>
            <div className="mx-auto mb-8 w-full border-b border-ink" />
            Kitchen sign
          </div>
          <div>
            <div className="mx-auto mb-8 w-full border-b border-ink" />
            Rider / counter sign
          </div>
        </footer>
      </article>
    </div>
  );
}
