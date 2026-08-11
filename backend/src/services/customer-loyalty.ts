import fs from 'fs';
import path from 'path';

export type LoyaltyTier = 'bronze' | 'silver' | 'gold';

export type FileCustomerOrder = {
  id: string;
  user_id: string;
  customer_id: string;
  status: string;
  paymentStatus: string;
  orderType: string;
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  total: number;
  couponCode?: string | null;
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  specialInstructions?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    specialInstructions?: string;
    imageUrl?: string;
  }>;
  createdAt: string;
  payment: string;
  paymentRef?: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string | null;
  tableNumber?: string | null;
  restaurant?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
};

type OrderStore = {
  orders: FileCustomerOrder[];
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'customer-orders.json');

/** 1 loyalty point per Rs 100 spent. */
export function earnPointsFromTotal(total: number): number {
  return Math.max(0, Math.floor(Number(total) / 100));
}

/** Rs 1 off per point, max 30% of subtotal, requires at least 50 points. */
export function redeemPointsDiscount(points: number, subtotal: number, redeemPoints: number): number {
  if (redeemPoints <= 0 || points < 50) return 0;
  const use = Math.min(redeemPoints, points, Math.floor(subtotal * 0.3));
  return Math.max(0, use);
}

export function loyaltyTier(points: number, totalSpent: number): LoyaltyTier {
  if (points >= 500 || totalSpent >= 50000) return 'gold';
  if (points >= 150 || totalSpent >= 15000) return 'silver';
  return 'bronze';
}

export function tierPercentDiscount(tier: LoyaltyTier): number {
  if (tier === 'gold') return 0.1;
  if (tier === 'silver') return 0.05;
  return 0;
}

export function loyaltyBenefits(points: number, totalSpent: number) {
  const tier = loyaltyTier(points, totalSpent);
  const tierPct = tierPercentDiscount(tier);
  return {
    tier,
    tierLabel: tier === 'gold' ? 'Gold' : tier === 'silver' ? 'Silver' : 'Bronze',
    tierPercent: Math.round(tierPct * 100),
    points,
    totalSpent,
    earnRule: 'Earn 1 point for every Rs 100 spent',
    redeemRule: 'Redeem points: Rs 1 off per point (min 50 points, max 30% of subtotal)',
    codes: [
      {
        code: 'LOYAL5',
        label: '5% off (Silver+)',
        available: tier === 'silver' || tier === 'gold',
      },
      {
        code: 'LOYAL10',
        label: '10% off (Gold)',
        available: tier === 'gold',
      },
      {
        code: 'REDEEM',
        label: `Redeem points (Rs 1/pt, min 50 · balance ${points})`,
        available: points >= 50,
      },
    ],
    nextTierHint:
      tier === 'bronze'
        ? `Reach Silver at 150 points or Rs 15,000 lifetime spend (now: ${points} pts / Rs ${Math.round(totalSpent)})`
        : tier === 'silver'
          ? `Reach Gold at 500 points or Rs 50,000 lifetime spend (now: ${points} pts / Rs ${Math.round(totalSpent)})`
          : 'You are on our highest loyalty tier — use LOYAL10 when shopping.',
  };
}

function ensureOrders(): OrderStore {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const empty: OrderStore = { orders: [] };
    fs.writeFileSync(STORE_PATH, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as OrderStore;
  } catch {
    return { orders: [] };
  }
}

function saveOrders(store: OrderStore) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export const customerOrderStore = {
  listByUser(userId: string): FileCustomerOrder[] {
    return ensureOrders()
      .orders.filter((o) => o.user_id === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  listAll(limit = 200): FileCustomerOrder[] {
    return ensureOrders()
      .orders.slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  },

  getById(id: string): FileCustomerOrder | undefined {
    return ensureOrders().orders.find((o) => o.id === id);
  },

  saveOrder(order: FileCustomerOrder) {
    const store = ensureOrders();
    const idx = store.orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) store.orders[idx] = order;
    else store.orders.unshift(order);
    saveOrders(store);
    return order;
  },
};
