'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatPKR } from '@/lib/data';
import {
  adminUnlockStage,
  arrangeDispatch,
  canDispatch,
  canKitchenReady,
  canManagerMarkDelivered,
  canManagerProceed,
  formatType,
  getDeliveryStatusInfo,
  getOpsOrder,
  kitchenMarkReadyForDelivery,
  labelStatus,
  managerConfirmDelivered,
  managerProceedToKitchen,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsForRole,
  normalizeStaffRole,
  paymentLabel,
  readOpsOrders,
  unreadNotificationsForRole,
  type OpsOrder,
  type OrderNotification,
  type StageKey,
  NOTIFY_EVENT,
  ORDERS_EVENT,
} from '@/lib/order-workflow';

function useLiveOrders() {
  const [orders, setOrders] = useState<OpsOrder[]>([]);
  const reload = useCallback(() => setOrders(readOpsOrders()), []);
  useEffect(() => {
    reload();
    window.addEventListener(ORDERS_EVENT, reload);
    window.addEventListener('storage', reload);
    const t = window.setInterval(reload, 2500);
    return () => {
      window.removeEventListener(ORDERS_EVENT, reload);
      window.removeEventListener('storage', reload);
      window.clearInterval(t);
    };
  }, [reload]);
  return orders;
}

function useLiveNotifications(role: string) {
  const [notes, setNotes] = useState<OrderNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const reload = useCallback(() => {
    setNotes(notificationsForRole(role));
    setUnread(unreadNotificationsForRole(role).length);
  }, [role]);
  useEffect(() => {
    reload();
    window.addEventListener(NOTIFY_EVENT, reload);
    window.addEventListener('storage', reload);
    const t = window.setInterval(reload, 2500);
    return () => {
      window.removeEventListener(NOTIFY_EVENT, reload);
      window.removeEventListener('storage', reload);
      window.clearInterval(t);
    };
  }, [reload]);
  return { notes, unread, reload };
}

function OrderCard({
  order,
  accent,
  children,
}: {
  order: OpsOrder;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${
        accent || 'border-[var(--kdc-border)] bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-gold">{order.id}</p>
          <p className="mt-1 text-lg font-semibold text-ink">{order.customerName || 'Guest'}</p>
          <p className="text-sm text-muted">
            {formatType(order)} · {labelStatus(order.status)}
          </p>
        </div>
        <p className="text-lg font-semibold text-crimson">{formatPKR(order.total)}</p>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Payment</dt>
          <dd className="text-right font-medium">{paymentLabel(order)}</dd>
        </div>
        {order.paymentRef && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Reference</dt>
            <dd className="font-mono text-xs">{order.paymentRef}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Phone</dt>
          <dd>{order.customerPhone || '—'}</dd>
        </div>
        {(order.orderType === 'delivery' || order.type === 'delivery') && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Address</dt>
            <dd className="max-w-[60%] text-right">{order.deliveryAddress || '—'}</dd>
          </div>
        )}
        {order.createdAt && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Placed</dt>
            <dd className="text-right text-xs">
              {new Date(order.createdAt).toLocaleString('en-PK')}
            </dd>
          </div>
        )}
      </dl>
      {!!order.items?.length && (
        <ul className="mt-3 space-y-1 border-t border-[var(--kdc-border)] pt-3 text-sm">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {it.quantity}× {it.name}
              </span>
              <span className="text-muted">{formatPKR(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
      )}
      {order.specialInstructions && (
        <p className="mt-2 rounded-lg bg-gold/10 px-2 py-1 text-xs text-ink">
          Note: {order.specialInstructions}
        </p>
      )}
      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}

function BoardColumn({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[280px] flex-col rounded-2xl border border-[var(--kdc-border)] bg-surface p-4">
      <div className="mb-3 border-b border-[var(--kdc-border)] pb-3">
        <h2 className="text-lg font-semibold text-ink">
          {title}{' '}
          <span className="text-sm font-normal text-muted">({count})</span>
        </h2>
        <p className="mt-1 text-xs text-muted">{subtitle}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">{children}</div>
    </section>
  );
}

/** Kitchen-only view: dish names and quantities — no customer/payment details. */
function KitchenItemsTicket({
  order,
  accent,
  children,
}: {
  order: OpsOrder;
  accent?: string;
  children?: ReactNode;
}) {
  const items = order.items || [];
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${
        accent || 'border-[var(--kdc-border)] bg-surface'
      }`}
    >
      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-base">
              <span className="font-semibold leading-snug">{it.name}</span>
              <span className="shrink-0 tabular-nums font-bold">×{it.quantity}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-70">No food items on this order.</p>
      )}
      {children ? <div className="mt-4 border-t border-current/15 pt-3">{children}</div> : null}
    </article>
  );
}

function DeliveryStatusModal({
  order,
  onClose,
  onConfirmDelivered,
}: {
  order: OpsOrder;
  onClose: () => void;
  onConfirmDelivered: (id: string) => void;
}) {
  const info = getDeliveryStatusInfo(order);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-[var(--kdc-border)] bg-surface p-6 shadow-xl">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-2xl">Order status</h3>
          <p className="mt-1 font-mono text-xs text-gold">{order.id}</p>
        </div>

        <div className="rounded-xl border border-[var(--kdc-border)] p-4 text-sm">
          <p className="text-lg font-semibold text-ink">{info.headline}</p>
          <p className="mt-2 text-muted">{info.detail}</p>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Customer</dt>
            <dd className="font-medium">{order.customerName || 'Guest'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Phone</dt>
            <dd>{order.customerPhone || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Type</dt>
            <dd>{formatType(order)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Payment</dt>
            <dd>{paymentLabel(order)}</dd>
          </div>
          {(order.orderType === 'delivery' || order.type === 'delivery') && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Address</dt>
              <dd className="max-w-[60%] text-right">{order.deliveryAddress || '—'}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Total</dt>
            <dd className="font-semibold text-crimson">{formatPKR(order.total)}</dd>
          </div>
          {info.assignedDriver && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Driver</dt>
              <dd className="font-medium">{info.assignedDriver}</dd>
            </div>
          )}
          {info.dispatchedAt && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Left for delivery</dt>
              <dd>{new Date(info.dispatchedAt).toLocaleString('en-PK')}</dd>
            </div>
          )}
          {info.deliveredBy && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Delivered by</dt>
              <dd className="font-medium">{info.deliveredBy}</dd>
            </div>
          )}
          {info.deliveredAt && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Delivered at</dt>
              <dd>{new Date(info.deliveredAt).toLocaleString('en-PK')}</dd>
            </div>
          )}
          {order.deliveryBarcode && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Barcode</dt>
              <dd className="font-mono text-xs">{order.deliveryBarcode}</dd>
            </div>
          )}
        </dl>

        {!!order.items?.length && (
          <ul className="space-y-1 border-t border-[var(--kdc-border)] pt-3 text-sm">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {it.quantity}× {it.name}
                </span>
                <span className="text-muted">{formatPKR(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
        )}

        {!!order.workflowHistory?.length && (
          <div className="border-t border-[var(--kdc-border)] pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">History</p>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-muted">
              {[...order.workflowHistory].reverse().map((h, i) => (
                <li key={i}>
                  {new Date(h.at).toLocaleString('en-PK')} · {h.by} · {h.action}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {canManagerMarkDelivered(order) && (
            <button
              type="button"
              onClick={() => onConfirmDelivered(order.id)}
              className="kdc-button kdc-button-primary w-full !py-3"
            >
              Confirm food delivered
            </button>
          )}
          <Link
            href={`/admin/print-slip/${order.id}`}
            className="rounded-full border border-[var(--kdc-border)] px-4 py-2 text-center text-sm text-ink"
          >
            Print slip
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--kdc-border)] px-4 py-2 text-sm text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Manager board: Order · Preparing order · Ready for delivery */
export function ManagerStation({ role, actor }: { role: string; actor: string }) {
  const orders = useLiveOrders();
  const { notes, unread, reload } = useLiveNotifications(role);
  const [flash, setFlash] = useState('');
  const [msg, setMsg] = useState('');
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});

  const colOrder = orders.filter(
    (o) =>
      canManagerProceed(o) ||
      ((o.status === 'received' || o.status === 'accepted') && !o.stageLocks?.managerProceed)
  );

  const colPreparing = orders.filter((o) =>
    ['preparing', 'cooking'].includes(o.status)
  );

  // Only remain here until manager finishes ready-for-delivery action
  const colReady = orders.filter((o) => o.status === 'ready');

  useEffect(() => {
    if (unread > 0) {
      setFlash(`${unread} new notification${unread > 1 ? 's' : ''}`);
      const t = window.setTimeout(() => setFlash(''), 6000);
      return () => window.clearTimeout(t);
    }
  }, [unread]);

  function proceed(id: string) {
    const res = managerProceedToKitchen(id, actor);
    setMsg(res.message);
    reload();
  }

  function finishReadyStage(id: string) {
    const name = (driverNames[id] || '').trim() || 'Delivery driver';
    const res = arrangeDispatch(id, actor, name);
    setMsg(
      res.ok
        ? `${res.message} Cleared from Ready for delivery — see Order delivery page.`
        : res.message
    );
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Manager station</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-ink">
            Online orders monitor
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Boards: Order → Preparing order → Ready for delivery. When you finish the last board,
            the order moves to <strong className="text-ink">Order delivery</strong> for full status.
          </p>
        </div>
        <Link
          href="/admin?tab=order-delivery"
          className="kdc-button kdc-button-primary !px-4 !py-2 text-sm"
        >
          Order delivery →
        </Link>
      </div>

      {flash && (
        <div className="animate-pulse rounded-2xl border-2 border-gold bg-gold/15 px-4 py-3 text-sm font-semibold text-ink">
          🔔 {flash} — check the panel below
        </div>
      )}
      {msg && <p className="rounded-xl bg-crimson/10 px-3 py-2 text-sm text-crimson">{msg}</p>}

      <section className="rounded-2xl border border-[var(--kdc-border)] bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Notifications {unread > 0 && <span className="text-crimson">({unread} unread)</span>}
          </h2>
          <button
            type="button"
            className="text-xs text-crimson underline"
            onClick={() => {
              markAllNotificationsRead(role);
              reload();
            }}
          >
            Mark all read
          </button>
        </div>
        <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm">
          {notes.slice(0, 12).map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border px-3 py-2 ${
                n.readBy.includes(normalizeStaffRole(role))
                  ? 'border-[var(--kdc-border)] opacity-70'
                  : 'border-crimson/40 bg-crimson/5'
              }`}
            >
              <p className="font-medium">{n.title}</p>
              <p className="text-muted">{n.body}</p>
              <div className="mt-1 flex gap-3 text-xs">
                <span className="text-muted">{new Date(n.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  className="text-crimson underline"
                  onClick={() => {
                    markNotificationRead(n.id, role);
                    reload();
                  }}
                >
                  Mark read
                </button>
              </div>
            </li>
          ))}
          {!notes.length && <li className="text-muted">No notifications yet.</li>}
        </ul>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <BoardColumn
          title="Order"
          subtitle="New orders — send to kitchen for preparation."
          count={colOrder.length}
        >
          {colOrder.map((o) => (
            <OrderCard key={o.id} order={o} accent="border-crimson/40 bg-crimson/5">
              {canManagerProceed(o) ? (
                <button
                  type="button"
                  onClick={() => proceed(o.id)}
                  className="kdc-button kdc-button-primary w-full !py-3 text-base font-semibold"
                >
                  Proceed to kitchen
                </button>
              ) : (
                <p className="text-sm text-muted">Already sent or stage locked.</p>
              )}
            </OrderCard>
          ))}
          {!colOrder.length && <p className="text-sm text-muted">No new orders waiting.</p>}
        </BoardColumn>

        <BoardColumn
          title="Preparing order"
          subtitle="Kitchen is preparing these orders."
          count={colPreparing.length}
        >
          {colPreparing.map((o) => (
            <OrderCard key={o.id} order={o} accent="border-gold/40 bg-gold/10">
              <p className="text-xs font-medium text-ink">In kitchen preparation</p>
            </OrderCard>
          ))}
          {!colPreparing.length && (
            <p className="text-sm text-muted">Nothing preparing right now.</p>
          )}
        </BoardColumn>

        <BoardColumn
          title="Ready for delivery"
          subtitle="Kitchen finished. Assign driver — then order leaves this board."
          count={colReady.length}
        >
          {colReady.map((o) => {
            const isDelivery = (o.orderType || o.type) === 'delivery';
            return (
              <OrderCard key={o.id} order={o} accent="border-emerald-600/35 bg-emerald-500/10">
                <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Ready for delivery
                </p>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/admin/print-slip/${o.id}`}
                    className="rounded-full border border-[var(--kdc-border)] bg-white px-3 py-2 text-center text-sm font-medium text-ink"
                  >
                    Print slip + barcode
                  </Link>
                  {isDelivery && canDispatch(o) && (
                    <>
                      <input
                        type="text"
                        placeholder="Driver name"
                        value={driverNames[o.id] || ''}
                        onChange={(e) =>
                          setDriverNames((prev) => ({ ...prev, [o.id]: e.target.value }))
                        }
                        className="w-full rounded-xl border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                      />
                      <button
                        type="button"
                        onClick={() => finishReadyStage(o.id)}
                        className="kdc-button kdc-button-gold w-full !py-3 text-sm font-semibold"
                      >
                        Assign to driver
                      </button>
                    </>
                  )}
                  {!isDelivery && canDispatch(o) && (
                    <button
                      type="button"
                      onClick={() => finishReadyStage(o.id)}
                      className="kdc-button kdc-button-gold w-full !py-3 text-sm font-semibold"
                    >
                      Mark collection complete
                    </button>
                  )}
                  {!canDispatch(o) && (
                    <p className="text-xs text-muted">Dispatch locked (admin can unlock).</p>
                  )}
                </div>
              </OrderCard>
            );
          })}
          {!colReady.length && (
            <p className="text-sm text-muted">Waiting for kitchen to mark ready…</p>
          )}
        </BoardColumn>
      </div>
    </div>
  );
}

/** Manager page: full status for orders already left Ready for delivery. */
export function ManagerOrderDeliveryPage({ role, actor }: { role: string; actor: string }) {
  const orders = useLiveOrders();
  const [msg, setMsg] = useState('');
  const [statusOrder, setStatusOrder] = useState<OpsOrder | null>(null);

  const deliveryOrders = orders
    .filter((o) => o.status === 'out_for_delivery' || o.status === 'delivered')
    .sort((a, b) => {
      const ta = a.dispatchedAt || a.deliveredAt || a.createdAt || '';
      const tb = b.dispatchedAt || b.deliveredAt || b.createdAt || '';
      return tb.localeCompare(ta);
    });

  const onTheWay = deliveryOrders.filter((o) => o.status === 'out_for_delivery');
  const delivered = deliveryOrders.filter((o) => o.status === 'delivered');

  function openStatus(o: OpsOrder) {
    setStatusOrder(getOpsOrder(o.id) || o);
  }

  function confirmDelivered(id: string) {
    const res = managerConfirmDelivered(id, actor);
    setMsg(res.message);
    if (res.order) setStatusOrder(res.order);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Order delivery</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-ink">
            Delivery status
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Orders cleared from <strong className="text-ink">Ready for delivery</strong> appear
            here with full details — who is delivering, still on the way, or already delivered.
          </p>
        </div>
        <Link
          href="/admin?tab=manager-station"
          className="rounded-full border border-[var(--kdc-border)] px-4 py-2 text-sm text-ink"
        >
          ← Manager station
        </Link>
      </div>

      {msg && <p className="rounded-xl bg-crimson/10 px-3 py-2 text-sm text-crimson">{msg}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wide text-muted">On the way</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{onTheWay.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Delivered</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
            {delivered.length}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {deliveryOrders.map((o) => {
          const info = getDeliveryStatusInfo(o);
          return (
            <OrderCard
              key={o.id}
              order={o}
              accent={
                o.status === 'delivered'
                  ? 'border-emerald-600/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }
            >
              <p className="mb-1 text-sm font-semibold text-ink">{info.headline}</p>
              <p className="mb-3 text-xs text-muted">{info.detail}</p>
              {o.assignedDriver && (
                <p className="mb-2 text-xs text-muted">
                  Driver: <strong className="text-ink">{o.assignedDriver}</strong>
                </p>
              )}
              <button
                type="button"
                onClick={() => openStatus(o)}
                className="kdc-button kdc-button-primary w-full !py-2.5 text-sm font-semibold"
              >
                View full status
              </button>
            </OrderCard>
          );
        })}
        {!deliveryOrders.length && (
          <p className="text-sm text-muted md:col-span-2">
            No delivery records yet. Assign a driver from Ready for delivery on Manager station.
          </p>
        )}
      </div>

      {statusOrder && (
        <DeliveryStatusModal
          order={statusOrder}
          onClose={() => setStatusOrder(null)}
          onConfirmDelivered={confirmDelivered}
        />
      )}
    </div>
  );
}

/** Kitchen board: active prep only; completed updates move to Kitchen updates page. */
export function KitchenStation({ role, actor }: { role: string; actor: string }) {
  const orders = useLiveOrders();
  const { notes, unread, reload } = useLiveNotifications(role);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState('');

  const orderReceived = orders.filter(
    (o) =>
      ['preparing', 'cooking', 'accepted'].includes(o.status) ||
      (canKitchenReady(o) && o.status !== 'ready' && o.status !== 'out_for_delivery' && o.status !== 'delivered')
  );

  useEffect(() => {
    if (unread > 0) {
      setFlash(`${unread} kitchen alert${unread > 1 ? 's' : ''}`);
      const t = window.setTimeout(() => setFlash(''), 8000);
      return () => window.clearTimeout(t);
    }
  }, [unread]);

  function markReady(id: string) {
    const res = kitchenMarkReadyForDelivery(id, actor);
    setMsg(
      res.ok
        ? `${res.message} Cleared from this board — see Kitchen updates.`
        : res.message
    );
    if (res.ok) {
      window.open(`/admin/print-slip/${id}?auto=1`, '_blank', 'noopener,noreferrer');
    }
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Kitchen station</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-ink">
            Preparation board
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Kitchen view shows only food items and quantities to prepare. When you mark Ready for
            delivery, the ticket moves to <strong className="text-ink">Kitchen updates</strong>.
          </p>
        </div>
        <Link
          href="/admin?tab=kitchen-updates"
          className="kdc-button kdc-button-primary !px-4 !py-2 text-sm"
        >
          Kitchen updates →
        </Link>
      </div>

      {flash && (
        <div className="animate-pulse rounded-2xl border-2 border-gold bg-crimson-deep px-4 py-3 text-sm font-semibold text-white">
          🔔 {flash}
        </div>
      )}
      {msg && <p className="rounded-xl bg-crimson/10 px-3 py-2 text-sm text-crimson">{msg}</p>}

      <section className="rounded-2xl border border-[var(--kdc-border)] bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Kitchen notifications</h2>
          <button
            type="button"
            className="text-xs text-crimson underline"
            onClick={() => {
              markAllNotificationsRead(role);
              reload();
            }}
          >
            Mark all read
          </button>
        </div>
        <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm">
          {notes.slice(0, 10).map((n) => (
            <li key={n.id} className="rounded-xl border border-[var(--kdc-border)] px-3 py-2">
              <p className="font-medium">{n.title}</p>
              <p className="text-muted">{n.body}</p>
            </li>
          ))}
          {!notes.length && <li className="text-muted">Waiting for manager to send orders…</li>}
        </ul>
      </section>

      <BoardColumn
        title="Order"
        subtitle="Dishes to prepare (name + quantity only)."
        count={orderReceived.length}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orderReceived.map((o) => (
            <KitchenItemsTicket
              key={o.id}
              order={o}
              accent="border-2 border-gold bg-crimson-deep text-white"
            >
              {canKitchenReady(o) ? (
                <button
                  type="button"
                  onClick={() => markReady(o.id)}
                  className="kdc-button kdc-button-gold w-full !py-3 text-base font-semibold"
                >
                  Ready for delivery
                </button>
              ) : (
                <p className="text-sm text-white/70">Stage locked — ask admin to unlock if needed.</p>
              )}
            </KitchenItemsTicket>
          ))}
        </div>
        {!orderReceived.length && (
          <p className="text-sm text-muted">No tickets in preparation.</p>
        )}
      </BoardColumn>
    </div>
  );
}

/** Kitchen history: orders already marked ready for delivery (items + qty only). */
export function KitchenUpdatesPage({ role }: { role: string }) {
  const orders = useLiveOrders();

  const updated = orders
    .filter(
      (o) =>
        o.status === 'ready' ||
        o.status === 'out_for_delivery' ||
        o.status === 'delivered' ||
        o.stageLocks?.kitchenReady
    )
    .filter((o) => {
      return o.stageLocks?.kitchenReady || ['ready', 'out_for_delivery', 'delivered'].includes(o.status);
    })
    .sort((a, b) => {
      const ta = a.workflowHistory?.slice(-1)[0]?.at || a.createdAt || '';
      const tb = b.workflowHistory?.slice(-1)[0]?.at || b.createdAt || '';
      return tb.localeCompare(ta);
    });

  void role;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Kitchen updates</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-ink">
            Orders you prepared
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Food items and quantities only for tickets already marked ready for delivery.
          </p>
        </div>
        <Link
          href="/admin?tab=kitchen-station"
          className="rounded-full border border-[var(--kdc-border)] px-4 py-2 text-sm text-ink"
        >
          ← Kitchen station
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {updated.map((o) => (
          <KitchenItemsTicket
            key={o.id}
            order={o}
            accent="border-emerald-600/35 bg-emerald-500/10 text-ink"
          >
            <Link
              href={`/admin/print-slip/${o.id}`}
              className="inline-flex w-full items-center justify-center rounded-full border border-[var(--kdc-border)] bg-white px-3 py-2 text-sm font-medium text-ink"
            >
              Re-print slip
            </Link>
          </KitchenItemsTicket>
        ))}
        {!updated.length && (
          <p className="text-sm text-muted md:col-span-2">
            No kitchen updates yet. Mark tickets Ready for delivery on Kitchen station.
          </p>
        )}
      </div>
    </div>
  );
}

/** Admin unlocks locked stages on any order. */
export function AdminOrderUnlockPanel({ actor }: { actor: string }) {
  const orders = useLiveOrders();
  const [msg, setMsg] = useState('');
  const locked = orders.filter(
    (o) =>
      o.stageLocks?.managerProceed ||
      o.stageLocks?.kitchenReady ||
      o.stageLocks?.dispatch
  );

  function unlock(id: string, stage: StageKey) {
    const res = adminUnlockStage(id, stage, actor);
    setMsg(res.message);
  }

  return (
    <div className="mt-6 rounded-2xl border border-[var(--kdc-border)] p-4">
      <h2 className="font-semibold">Admin — unlock order stages</h2>
      <p className="mt-1 text-sm text-muted">
        After manager or kitchen acts, that stage is disabled. Unlock here only when a correction is
        needed.
      </p>
      {msg && <p className="mt-2 text-sm text-crimson">{msg}</p>}
      <ul className="mt-4 space-y-3">
        {locked.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--kdc-border)] px-3 py-2 text-sm"
          >
            <span>
              <span className="font-mono text-xs">{o.id}</span> · {o.customerName} ·{' '}
              {labelStatus(o.status)}
            </span>
            <span className="flex flex-wrap gap-2">
              {o.stageLocks?.managerProceed && (
                <button
                  type="button"
                  className="text-xs text-crimson underline"
                  onClick={() => unlock(o.id, 'managerProceed')}
                >
                  Unlock manager step
                </button>
              )}
              {o.stageLocks?.kitchenReady && (
                <button
                  type="button"
                  className="text-xs text-crimson underline"
                  onClick={() => unlock(o.id, 'kitchenReady')}
                >
                  Unlock kitchen step
                </button>
              )}
              {o.stageLocks?.dispatch && (
                <button
                  type="button"
                  className="text-xs text-crimson underline"
                  onClick={() => unlock(o.id, 'dispatch')}
                >
                  Unlock dispatch step
                </button>
              )}
            </span>
          </li>
        ))}
        {!locked.length && <li className="text-muted">No locked stages right now.</li>}
      </ul>
    </div>
  );
}

export function StaffNotificationBadge({ role }: { role: string }) {
  const { unread } = useLiveNotifications(role);
  if (!unread) return null;
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-ink">
      {unread > 9 ? '9+' : unread}
    </span>
  );
}

export function getOrderForSlip(id: string): OpsOrder | null {
  return getOpsOrder(id);
}
