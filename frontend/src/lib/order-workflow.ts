/** Online order workflow: manager → kitchen → ready/dispatch, with stage locks + notifications. */

export const ORDERS_KEY = 'kdc-orders';
export const ORDERS_EVENT = 'kdc-orders-change';
export const NOTIFY_KEY = 'kdc-order-notifications';
export const NOTIFY_EVENT = 'kdc-order-notifications-change';

export type StageKey = 'managerProceed' | 'kitchenReady' | 'dispatch';

export type StageLocks = {
  managerProceed?: boolean;
  kitchenReady?: boolean;
  dispatch?: boolean;
  /** When true, the next stage action for a locked step is allowed once (admin unlock). */
  adminUnlocked?: StageKey | true;
};

export type WorkflowNote = {
  at: string;
  by: string;
  action: string;
  status: string;
};

export type OpsOrder = {
  id: string;
  status: string;
  paymentStatus?: 'pending' | 'paid' | 'cod' | string;
  orderType?: string;
  type?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  deliveryFee?: number;
  total: number;
  payment?: string;
  paymentRef?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  specialInstructions?: string;
  createdAt?: string;
  restaurant?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    specialInstructions?: string;
  }>;
  stageLocks?: StageLocks;
  workflowHistory?: WorkflowNote[];
  /** Unique code for driver scan / manual entry → mark delivered */
  deliveryBarcode?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  /** Driver name / id when manager assigns delivery */
  assignedDriver?: string;
  dispatchedAt?: string;
};

export type OrderNotification = {
  id: string;
  orderId: string;
  title: string;
  body: string;
  /** Roles that should see this notification */
  roles: string[];
  createdAt: string;
  readBy: string[];
};

export type StaffRole = 'admin' | 'manager' | 'kitchen' | 'cashier' | 'delivery' | 'employee';

export function normalizeStaffRole(role: string): StaffRole | string {
  if (role === 'owner' || role === 'admin') return 'admin';
  return role;
}

export function isAdminRole(role: string) {
  const r = normalizeStaffRole(role);
  return r === 'admin';
}

/** Nav tab ids allowed for each staff role (read-only stations for manager/kitchen). */
export function tabsAllowedForRole(role: string): string[] | 'all' {
  const r = normalizeStaffRole(role);
  if (r === 'admin') return 'all';
  if (r === 'manager') {
    return ['manager-station', 'order-delivery', 'orders', 'overview'];
  }
  if (r === 'kitchen') return ['kitchen-station', 'kitchen-updates', 'kds'];
  if (r === 'cashier') return ['orders', 'overview'];
  if (r === 'delivery') return ['manager-station', 'order-delivery', 'orders'];
  return ['overview'];
}

export function defaultTabForRole(role: string): string {
  const r = normalizeStaffRole(role);
  if (r === 'manager') return 'manager-station';
  if (r === 'kitchen') return 'kitchen-station';
  if (r === 'delivery') return 'manager-station';
  return 'overview';
}

/** Generate a driver-facing delivery barcode (once per order). */
export function generateDeliveryBarcode(orderId: string): string {
  const core = String(orderId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-8);
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KDC${core}${rnd}`;
}

export function findOrderByBarcode(code: string): OpsOrder | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const list = readOpsOrders();
  return (
    list.find((o) => (o.deliveryBarcode || '').toUpperCase() === c) ||
    list.find((o) => String(o.id).toUpperCase() === c) ||
    null
  );
}

/**
 * Driver marks food delivered successfully after scanning / entering barcode.
 * Updates order status online (local order store + events for track/admin).
 */
export function markDeliveredByBarcode(
  code: string,
  actor = 'delivery-driver'
): { ok: boolean; message: string; order?: OpsOrder } {
  const current = findOrderByBarcode(code);
  if (!current) {
    return { ok: false, message: 'No order found for this barcode. Check the number and try again.' };
  }
  if (current.status === 'delivered') {
    return {
      ok: true,
      message: 'This order was already marked delivered.',
      order: current,
    };
  }
  if (!['ready', 'out_for_delivery', 'preparing', 'cooking'].includes(current.status)) {
    return {
      ok: false,
      message: `Order is still “${labelStatus(current.status)}” and cannot be marked delivered yet.`,
      order: current,
    };
  }

  const next = patchOrderInStore(current.id, (o) => ({
    ...o,
    status: 'delivered',
    deliveredAt: new Date().toISOString(),
    deliveredBy: actor,
    stageLocks: {
      ...(o.stageLocks || {}),
      managerProceed: true,
      kitchenReady: true,
      dispatch: true,
      adminUnlocked: undefined,
    },
    workflowHistory: appendHistory(
      o,
      actor,
      'Driver confirmed: food delivered successfully',
      'delivered'
    ),
  }));

  if (!next) return { ok: false, message: 'Could not update delivery status.' };

  pushOrderNotification({
    orderId: next.id,
    title: 'Delivered successfully',
    body: `${next.customerName || 'Customer'} · ${next.id} marked delivered by driver (barcode ${next.deliveryBarcode || code}).`,
    roles: ['manager', 'admin', 'kitchen'],
  });

  return {
    ok: true,
    message: 'Food has been delivered successfully. Status updated online.',
    order: next,
  };
}

function emitOrders() {
  try {
    window.dispatchEvent(new Event(ORDERS_EVENT));
    window.dispatchEvent(new Event('storage'));
  } catch {
    /* ignore */
  }
}

function emitNotify() {
  try {
    window.dispatchEvent(new Event(NOTIFY_EVENT));
  } catch {
    /* ignore */
  }
}

export function readOpsOrders(): OpsOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]') as OpsOrder[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeOpsOrders(list: OpsOrder[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 50)));
  emitOrders();
}

export function getOpsOrder(id: string): OpsOrder | null {
  const found = readOpsOrders().find((o) => o.id === id);
  if (found) return found;
  try {
    const raw = localStorage.getItem('kdc-last-order');
    if (!raw) return null;
    const last = JSON.parse(raw) as OpsOrder;
    return last?.id === id ? last : null;
  } catch {
    return null;
  }
}

function patchOrderInStore(id: string, updater: (o: OpsOrder) => OpsOrder): OpsOrder | null {
  const history = readOpsOrders();
  let next: OpsOrder | null = null;
  let found = false;
  const updated = history.map((o) => {
    if (o.id !== id) return o;
    found = true;
    next = updater(o);
    return next;
  });
  if (!found) {
    const last = getOpsOrder(id);
    if (!last) return null;
    next = updater(last);
    updated.unshift(next);
  }
  writeOpsOrders(updated);
  try {
    const lastRaw = localStorage.getItem('kdc-last-order');
    if (lastRaw) {
      const last = JSON.parse(lastRaw) as OpsOrder;
      if (last.id === id && next) {
        localStorage.setItem('kdc-last-order', JSON.stringify(next));
      }
    }
  } catch {
    /* ignore */
  }
  return next;
}

export function readNotifications(): OrderNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]') as OrderNotification[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushOrderNotification(input: {
  orderId: string;
  title: string;
  body: string;
  roles: string[];
}) {
  const note: OrderNotification = {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    orderId: input.orderId,
    title: input.title,
    body: input.body,
    roles: input.roles.map(normalizeStaffRole),
    createdAt: new Date().toISOString(),
    readBy: [],
  };
  const list = [note, ...readNotifications()].slice(0, 80);
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(list));
  emitNotify();
  return note;
}

export function notificationsForRole(role: string): OrderNotification[] {
  const r = normalizeStaffRole(role);
  return readNotifications().filter((n) => n.roles.includes(r));
}

export function unreadNotificationsForRole(role: string): OrderNotification[] {
  const r = normalizeStaffRole(role);
  return notificationsForRole(r).filter((n) => !n.readBy.includes(r));
}

export function markNotificationRead(id: string, role: string) {
  const r = normalizeStaffRole(role);
  const list = readNotifications().map((n) => {
    if (n.id !== id) return n;
    if (n.readBy.includes(r)) return n;
    return { ...n, readBy: [...n.readBy, r] };
  });
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(list));
  emitNotify();
}

export function markAllNotificationsRead(role: string) {
  const r = normalizeStaffRole(role);
  const fixed = readNotifications().map((n) => {
    if (!n.roles.includes(r)) return n;
    if (n.readBy.includes(r)) return n;
    return { ...n, readBy: [...n.readBy, r] };
  });
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(fixed));
  emitNotify();
}

function appendHistory(o: OpsOrder, by: string, action: string, status: string): WorkflowNote[] {
  const note: WorkflowNote = { at: new Date().toISOString(), by, action, status };
  return [...(o.workflowHistory || []), note].slice(-40);
}

function stageLocked(o: OpsOrder, stage: StageKey): boolean {
  const locks = o.stageLocks || {};
  if (!locks[stage]) return false;
  const unlock = locks.adminUnlocked;
  if (unlock === true || unlock === stage) return false;
  return true;
}

export function canManagerProceed(o: OpsOrder): boolean {
  const locks = o.stageLocks || {};
  if (locks.adminUnlocked === 'managerProceed' || locks.adminUnlocked === true) return true;
  if (o.status !== 'received' && o.status !== 'accepted') return false;
  return !stageLocked(o, 'managerProceed');
}

export function canKitchenReady(o: OpsOrder): boolean {
  const locks = o.stageLocks || {};
  if (locks.adminUnlocked === 'kitchenReady' || locks.adminUnlocked === true) {
    return ['preparing', 'cooking', 'accepted', 'ready'].includes(o.status);
  }
  if (!['preparing', 'cooking', 'accepted'].includes(o.status)) return false;
  return !stageLocked(o, 'kitchenReady');
}

export function canDispatch(o: OpsOrder): boolean {
  const locks = o.stageLocks || {};
  if (locks.adminUnlocked === 'dispatch' || locks.adminUnlocked === true) {
    return o.status === 'ready' || o.status === 'out_for_delivery';
  }
  if (o.status !== 'ready') return false;
  return !stageLocked(o, 'dispatch');
}

/** Manager can confirm delivered when driver is already on the way (or takeaway ready). */
export function canManagerMarkDelivered(o: OpsOrder): boolean {
  if (o.status === 'delivered') return false;
  if (o.status === 'out_for_delivery') return true;
  // Takeaway collection: ready and dispatch already done as local collection
  if (o.status === 'ready' && (o.orderType || o.type) !== 'delivery') return true;
  return false;
}

/**
 * Snapshot of delivery status for manager "Delivered" review:
 * who delivered / when, or still on the way.
 */
export function getDeliveryStatusInfo(o: OpsOrder): {
  phase: 'not_ready' | 'awaiting_dispatch' | 'on_the_way' | 'delivered';
  headline: string;
  detail: string;
  assignedDriver?: string;
  deliveredBy?: string;
  deliveredAt?: string;
  dispatchedAt?: string;
} {
  if (o.status === 'delivered') {
    return {
      phase: 'delivered',
      headline: 'Delivered',
      detail: `Handed over${o.deliveredBy ? ` by ${o.deliveredBy}` : ''}${
        o.deliveredAt ? ` · ${new Date(o.deliveredAt).toLocaleString('en-PK')}` : ''
      }.`,
      assignedDriver: o.assignedDriver,
      deliveredBy: o.deliveredBy,
      deliveredAt: o.deliveredAt,
      dispatchedAt: o.dispatchedAt,
    };
  }
  if (o.status === 'out_for_delivery') {
    return {
      phase: 'on_the_way',
      headline: 'Driver on the way',
      detail: `${o.assignedDriver || 'Driver'} is en route to ${
        o.deliveryAddress || 'the delivery address'
      }${o.dispatchedAt ? ` · left ${new Date(o.dispatchedAt).toLocaleString('en-PK')}` : ''}.`,
      assignedDriver: o.assignedDriver,
      dispatchedAt: o.dispatchedAt,
    };
  }
  if (o.status === 'ready') {
    return {
      phase: 'awaiting_dispatch',
      headline: 'Ready to deliver',
      detail:
        (o.orderType || o.type) === 'delivery'
          ? 'Kitchen finished. Assign a driver to start delivery.'
          : 'Food is ready for collection.',
    };
  }
  return {
    phase: 'not_ready',
    headline: labelStatus(o.status),
    detail: 'Not ready for delivery yet.',
  };
}

/** Call when customer places order online. */
export function notifyOrderPlaced(order: OpsOrder) {
  // Ensure locks start clean for pipeline
  patchOrderInStore(order.id, (o) => ({
    ...o,
    ...order,
    status: o.status || order.status || 'received',
    stageLocks: o.stageLocks || {},
    workflowHistory: appendHistory(
      o,
      'customer',
      'Online order placed',
      order.status || 'received'
    ),
  }));

  pushOrderNotification({
    orderId: order.id,
    title: 'New online order',
    body: `${order.customerName || 'Customer'} · ${formatType(order)} · ${order.payment || 'payment'} · verify payment then send to kitchen.`,
    roles: ['manager', 'admin'],
  });
}

export function formatType(o: OpsOrder) {
  const t = o.orderType || o.type || 'takeaway';
  if (t === 'delivery') return 'Delivery';
  if (t === 'takeaway') return 'Take away';
  return t.replace(/_/g, ' ');
}

export function paymentLabel(o: OpsOrder) {
  const method = o.payment || '—';
  const st = o.paymentStatus || 'pending';
  if (st === 'cod') return `${method} · Cash to collect`;
  if (st === 'paid') return `${method} · Paid`;
  return `${method} · ${st}`;
}

/**
 * Manager verifies payment / confirmation and sends order to kitchen for preparation.
 * Locks manager stage so it cannot be repeated unless admin unlocks.
 */
export function managerProceedToKitchen(orderId: string, actor: string): { ok: boolean; message: string } {
  const current = getOpsOrder(orderId);
  if (!current) return { ok: false, message: 'Order not found.' };
  if (!canManagerProceed(current)) {
    return {
      ok: false,
      message: stageLocked(current, 'managerProceed')
        ? 'This stage is locked. Only an admin can unlock it to update again.'
        : 'Order is not waiting for manager verification.',
    };
  }

  const next = patchOrderInStore(orderId, (o) => {
    const locks: StageLocks = {
      ...(o.stageLocks || {}),
      managerProceed: true,
      adminUnlocked: undefined,
    };
    return {
      ...o,
      status: 'preparing',
      stageLocks: locks,
      workflowHistory: appendHistory(
        o,
        actor,
        'Proceeded for preparation — sent to kitchen',
        'preparing'
      ),
    };
  });

  if (!next) return { ok: false, message: 'Could not update order.' };

  pushOrderNotification({
    orderId,
    title: 'Order received in kitchen',
    body: `${next.customerName || 'Customer'} · ${next.id} — manager pressed Proceed to kitchen. Status: proceeded for preparation.`,
    roles: ['kitchen', 'admin'],
  });

  return {
    ok: true,
    message: 'Status updated: proceeded for preparation. Kitchen has been notified.',
  };
}

/**
 * Kitchen marks order prepared / ready to deliver (or collect). Locks stage. Notifies manager & admin.
 */
export function kitchenMarkReadyForDelivery(
  orderId: string,
  actor: string
): { ok: boolean; message: string } {
  const current = getOpsOrder(orderId);
  if (!current) return { ok: false, message: 'Order not found.' };
  if (!canKitchenReady(current)) {
    return {
      ok: false,
      message: stageLocked(current, 'kitchenReady')
        ? 'This stage is locked. Only an admin can unlock it to update again.'
        : 'Order is not in kitchen preparation.',
    };
  }

  const next = patchOrderInStore(orderId, (o) => {
    const locks: StageLocks = {
      ...(o.stageLocks || {}),
      kitchenReady: true,
      adminUnlocked: undefined,
    };
    const barcode = o.deliveryBarcode || generateDeliveryBarcode(o.id);
    return {
      ...o,
      status: 'ready',
      deliveryBarcode: barcode,
      stageLocks: locks,
      workflowHistory: appendHistory(
        o,
        actor,
        'Kitchen finished — ready for delivery / collection (slip + barcode issued)',
        'ready'
      ),
    };
  });

  if (!next) return { ok: false, message: 'Could not update order.' };

  const deliveryHint =
    (next.orderType || next.type) === 'delivery'
      ? 'Arrange rider delivery. Scan slip barcode when delivered.'
      : 'Customer will collect as take away.';

  pushOrderNotification({
    orderId,
    title: 'Food is ready to deliver',
    body: `${next.customerName || 'Customer'} · ${next.id} is READY TO DELIVER. Barcode ${next.deliveryBarcode}. ${deliveryHint}`,
    roles: ['manager', 'admin', 'delivery'],
  });

  return {
    ok: true,
    message: 'Status updated: ready to deliver. Manager notified.',
  };
}

/** Manager assigns delivery driver (stage 3) — status out for delivery. */
export function arrangeDispatch(
  orderId: string,
  actor: string,
  driverName?: string
): { ok: boolean; message: string } {
  const current = getOpsOrder(orderId);
  if (!current) return { ok: false, message: 'Order not found.' };
  if (!canDispatch(current)) {
    return {
      ok: false,
      message: stageLocked(current, 'dispatch')
        ? 'This stage is locked. Only an admin can unlock it to update again.'
        : 'Order is not marked ready by kitchen yet.',
    };
  }

  const isDelivery = (current.orderType || current.type) === 'delivery';
  const status = isDelivery ? 'out_for_delivery' : 'delivered';
  const driver = (driverName || '').trim() || (isDelivery ? 'Delivery driver' : actor);

  const next = patchOrderInStore(orderId, (o) => {
    const locks: StageLocks = {
      ...(o.stageLocks || {}),
      dispatch: true,
      adminUnlocked: undefined,
    };
    const barcode = o.deliveryBarcode || generateDeliveryBarcode(o.id);
    const now = new Date().toISOString();
    return {
      ...o,
      status,
      deliveryBarcode: barcode,
      assignedDriver: isDelivery ? driver : o.assignedDriver,
      dispatchedAt: now,
      deliveredAt: isDelivery ? o.deliveredAt : now,
      deliveredBy: isDelivery ? o.deliveredBy : actor,
      stageLocks: locks,
      workflowHistory: appendHistory(
        o,
        actor,
        isDelivery
          ? `Assigned to driver: ${driver} — on the way to delivery address`
          : 'Collection completed / handed over',
        status
      ),
    };
  });

  if (!next) return { ok: false, message: 'Could not update order.' };

  if (isDelivery) {
    pushOrderNotification({
      orderId,
      title: 'Driver on the way',
      body: `${driver} assigned · barcode ${next.deliveryBarcode}. Scan on phone when delivered.`,
      roles: ['admin', 'manager', 'delivery'],
    });
  }

  return {
    ok: true,
    message: isDelivery
      ? `Assigned to ${driver}. Status: driver on the way.`
      : 'Status updated: delivered / collection complete.',
  };
}

/** Manager confirms food delivered (after driver is on the way). */
export function managerConfirmDelivered(
  orderId: string,
  actor: string
): { ok: boolean; message: string; order?: OpsOrder } {
  const current = getOpsOrder(orderId);
  if (!current) return { ok: false, message: 'Order not found.' };
  if (current.status === 'delivered') {
    return {
      ok: true,
      message: `Already delivered${current.deliveredBy ? ` by ${current.deliveredBy}` : ''}${
        current.deliveredAt ? ` at ${new Date(current.deliveredAt).toLocaleString('en-PK')}` : ''
      }.`,
      order: current,
    };
  }
  if (!canManagerMarkDelivered(current)) {
    return {
      ok: false,
      message: 'Order is not out for delivery yet. Assign a driver first (ready-to-deliver stage).',
      order: current,
    };
  }

  const who = current.assignedDriver || actor || 'manager';
  const next = patchOrderInStore(orderId, (o) => ({
    ...o,
    status: 'delivered',
    deliveredAt: new Date().toISOString(),
    deliveredBy: who,
    stageLocks: {
      ...(o.stageLocks || {}),
      managerProceed: true,
      kitchenReady: true,
      dispatch: true,
      adminUnlocked: undefined,
    },
    workflowHistory: appendHistory(
      o,
      actor,
      `Manager confirmed delivered — by ${who}`,
      'delivered'
    ),
  }));

  if (!next) return { ok: false, message: 'Could not update delivery status.' };

  pushOrderNotification({
    orderId: next.id,
    title: 'Delivered',
    body: `${next.customerName || 'Customer'} · ${next.id} delivered by ${who}.`,
    roles: ['manager', 'admin', 'kitchen', 'delivery'],
  });

  return {
    ok: true,
    message: `Delivered by ${who}${
      next.deliveredAt ? ` at ${new Date(next.deliveredAt).toLocaleString('en-PK')}` : ''
    }.`,
    order: next,
  };
}

/** Admin unlocks a completed stage so it can be re-actioned once. */
export function adminUnlockStage(
  orderId: string,
  stage: StageKey,
  actor: string
): { ok: boolean; message: string } {
  const next = patchOrderInStore(orderId, (o) => ({
    ...o,
    stageLocks: {
      ...(o.stageLocks || {}),
      [stage]: false,
      adminUnlocked: stage,
    },
    workflowHistory: appendHistory(o, actor, `Admin unlocked stage: ${stage}`, o.status),
  }));
  if (!next) return { ok: false, message: 'Order not found.' };
  return { ok: true, message: `Stage unlocked. Staff can update that step once.` };
}

export function labelStatus(s: string) {
  const map: Record<string, string> = {
    received: 'Order received',
    accepted: 'Order received',
    preparing: 'Proceeded for preparation',
    cooking: 'Proceeded for preparation',
    ready: 'Ready to deliver',
    out_for_delivery: 'Driver on the way',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  if (map[s]) return map[s];
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
