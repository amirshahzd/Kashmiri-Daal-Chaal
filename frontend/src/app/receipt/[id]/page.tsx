'use client';

import { use, useEffect, useState } from 'react';
import { BRANCH, formatPKR } from '@/lib/data';

type StoredOrder = {
  id: string;
  orderType: string;
  total: number;
  subtotal?: number;
  discount?: number;
  tax?: number;
  deliveryFee?: number;
  payment?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  tableNumber?: string;
  specialInstructions?: string;
  createdAt: string;
  restaurant?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<StoredOrder | null>(null);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('kdc-orders') || '[]') as StoredOrder[];
    const found = history.find((o) => o.id === id);
    if (found) setOrder(found);
    else {
      const raw = localStorage.getItem('kdc-last-order');
      if (raw) {
        const parsed = JSON.parse(raw) as StoredOrder;
        if (parsed.id === id) setOrder(parsed);
      }
    }
  }, [id]);

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-muted">Receipt not found for {id}.</p>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-4 kdc-button kdc-button-ghost"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:px-6">
      <div className="mb-6 flex gap-3 print:hidden">
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

      <article className="rounded-2xl border border-[var(--kdc-border)] bg-white p-6 text-ink shadow-sm print:border-0 print:shadow-none">
        <header className="border-b border-dashed border-crimson/30 pb-4 text-center">
          <p className="font-[family-name:var(--font-display)] text-3xl text-crimson">
            {order.restaurant || BRANCH.name}
          </p>
          <p className="mt-1 text-sm text-muted">{order.restaurantAddress || BRANCH.address}</p>
          <p className="text-sm text-muted">{order.restaurantPhone || BRANCH.phone}</p>
          <p className="mt-3 font-mono text-xs">Invoice / Receipt · {order.id}</p>
          <p className="text-xs text-muted">{new Date(order.createdAt).toLocaleString('en-PK')}</p>
        </header>

        <div className="mt-4 space-y-1 text-sm">
          <p>
            <span className="text-muted">Customer:</span> {order.customerName || 'Guest'}
          </p>
          {order.customerPhone && (
            <p>
              <span className="text-muted">Phone:</span> {order.customerPhone}
            </p>
          )}
          <p>
            <span className="text-muted">Type:</span> {order.orderType.replace('_', ' ')}
          </p>
          {order.tableNumber && (
            <p>
              <span className="text-muted">Table:</span> {order.tableNumber}
            </p>
          )}
          {order.deliveryAddress && (
            <p>
              <span className="text-muted">Address:</span> {order.deliveryAddress}
            </p>
          )}
          {order.payment && (
            <p>
              <span className="text-muted">Payment:</span> {order.payment}
            </p>
          )}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--kdc-border)] text-left text-muted">
              <th className="py-2">Item</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item, i) => (
              <tr key={i} className="border-b border-[var(--kdc-border)]/60">
                <td className="py-2">{item.name}</td>
                <td className="py-2 text-center">{item.quantity}</td>
                <td className="py-2 text-right">{formatPKR(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatPKR(order.subtotal ?? order.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Discount</dt>
            <dd>-{formatPKR(order.discount ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Sales tax</dt>
            <dd>{formatPKR(order.tax ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd>{formatPKR(order.deliveryFee ?? 0)}</dd>
          </div>
          <div className="flex justify-between border-t border-dashed border-crimson/30 pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd className="text-crimson">{formatPKR(order.total)}</dd>
          </div>
        </dl>

        {order.specialInstructions && (
          <p className="mt-4 text-xs text-muted">Notes: {order.specialInstructions}</p>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          Shukriya · Thank you for ordering from Kashmiri Daal Chawal
        </p>
      </article>
    </div>
  );
}
