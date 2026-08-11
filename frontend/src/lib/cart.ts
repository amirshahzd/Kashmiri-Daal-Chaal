import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BRANCH, MenuItem, itemPrice } from './data';

export type OrderType = 'eat_in' | 'takeaway' | 'delivery';

export type CartLine = {
  item: MenuItem;
  quantity: number;
  specialInstructions?: string;
};

type CartState = {
  lines: CartLine[];
  orderType: OrderType;
  couponCode: string;
  /** Points to redeem when coupon is REDEEM (Rs 1 per point). */
  loyaltyRedeemPoints: number;
  specialInstructions: string;
  addItem: (item: MenuItem, qty?: number) => void;
  removeItem: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  setLineNote: (id: string, note: string) => void;
  setOrderType: (t: OrderType) => void;
  setCoupon: (code: string) => void;
  setLoyaltyRedeemPoints: (points: number) => void;
  setInstructions: (note: string) => void;
  clear: () => void;
  subtotal: () => number;
  discount: () => number;
  deliveryFee: () => number;
  tax: () => number;
  total: () => number;
  count: () => number;
};

function discountFromCoupon(code: string, subtotal: number) {
  const c = code.trim().toUpperCase();
  if (c === 'WELCOME10' && subtotal >= 1000) return Math.round(subtotal * 0.1);
  if (c === 'BIRYANI200' && subtotal >= 1000) return 200;
  if (c === 'BIRYANI2' && subtotal >= 1000) return 200; // legacy code alias
  // Loyalty tier codes (eligibility checked on account / checkout)
  if (c === 'LOYAL5' && subtotal >= 500) return Math.round(subtotal * 0.05);
  if (c === 'LOYAL10' && subtotal >= 500) return Math.round(subtotal * 0.1);
  // Redeem points: amount set by cart.loyaltyRedeemAmount (Rs 1 per pt)
  return 0;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      orderType: 'takeaway',
      couponCode: '',
      loyaltyRedeemPoints: 0,
      specialInstructions: '',
      addItem: (item, qty = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.item.id === item.id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.item.id === item.id ? { ...l, quantity: l.quantity + qty } : l
              ),
            };
          }
          return { lines: [...state.lines, { item, quantity: qty }] };
        }),
      removeItem: (id) => set((s) => ({ lines: s.lines.filter((l) => l.item.id !== id) })),
      setQuantity: (id, quantity) =>
        set((s) => ({
          lines:
            quantity <= 0
              ? s.lines.filter((l) => l.item.id !== id)
              : s.lines.map((l) => (l.item.id === id ? { ...l, quantity } : l)),
        })),
      setLineNote: (id, note) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.item.id === id ? { ...l, specialInstructions: note } : l)),
        })),
      setOrderType: (orderType) => set({ orderType }),
      setCoupon: (couponCode) => set({ couponCode }),
      setLoyaltyRedeemPoints: (loyaltyRedeemPoints) => set({ loyaltyRedeemPoints }),
      setInstructions: (specialInstructions) => set({ specialInstructions }),
      clear: () => set({ lines: [], couponCode: '', specialInstructions: '', loyaltyRedeemPoints: 0 }),
      subtotal: () => get().lines.reduce((sum, l) => sum + itemPrice(l.item) * l.quantity, 0),
      discount: () => {
        const sub = get().subtotal();
        const code = get().couponCode.trim().toUpperCase();
        if (code === 'REDEEM' || code === 'LOYALTY' || code === 'REDEEM100') {
          const points = code === 'REDEEM100' ? 100 : get().loyaltyRedeemPoints || 0;
          return Math.min(Math.max(0, points), Math.floor(sub * 0.3));
        }
        return discountFromCoupon(get().couponCode, sub);
      },
      deliveryFee: () => {
        if (get().orderType !== 'delivery') return 0;
        const after = get().subtotal() - get().discount();
        return after >= BRANCH.freeDeliveryAbove ? 0 : BRANCH.deliveryFee;
      },
      tax: () => {
        const taxable = Math.max(0, get().subtotal() - get().discount());
        return Math.round(taxable * BRANCH.taxRate);
      },
      total: () =>
        Math.round(
          Math.max(0, get().subtotal() - get().discount()) + get().tax() + get().deliveryFee()
        ),
      count: () => get().lines.reduce((n, l) => n + l.quantity, 0),
    }),
    { name: 'kdc-cart-pkr-v1' }
  )
);
