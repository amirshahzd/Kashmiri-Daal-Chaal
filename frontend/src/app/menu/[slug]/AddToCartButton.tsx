'use client';

import { MenuItem } from '@/lib/data';
import { useCart } from '@/lib/cart';

export function AddToCartButton({ item }: { item: MenuItem }) {
  const addItem = useCart((s) => s.addItem);
  return (
    <button type="button" onClick={() => addItem(item)} className="kdc-button kdc-button-primary">
      Add to cart
    </button>
  );
}
