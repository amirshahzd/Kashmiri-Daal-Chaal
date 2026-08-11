'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { formatGBP, itemPrice } from '@/lib/data';
import { MenuImageFx } from '@/components/MenuImageFx';

export default function CartPage() {
  const cart = useCart();

  if (!cart.lines.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Your cart is empty</h1>
        <p className="mt-3 text-muted">Add something fragrant from the menu.</p>
        <Link href="/menu" className="kdc-button kdc-button-primary mt-8 inline-flex">
          Browse menu
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[1.4fr_0.8fr] md:px-6 md:py-14">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Your cart</h1>
        <ul className="mt-8 space-y-4">
          {cart.lines.map((line) => (
            <li
              key={line.item.id}
              className="flex gap-4 rounded-2xl border border-[var(--kdc-border)] bg-surface p-4"
            >
              <div className="relative h-24 w-24 shrink-0 overflow-visible rounded-xl">
                <MenuImageFx
                  categorySlug={line.item.categorySlug}
                  variant="compact"
                  className="absolute inset-0 rounded-xl"
                >
                  <Image
                    src={line.item.imageUrl}
                    alt={line.item.name}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </MenuImageFx>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{line.item.name}</p>
                    <p className="text-sm text-crimson">{formatGBP(itemPrice(line.item))}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cart.removeItem(line.item.id)}
                    className="text-muted hover:text-crimson"
                    aria-label="Remove"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[var(--kdc-border)] p-1"
                    onClick={() => cart.setQuantity(line.item.id, line.quantity - 1)}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{line.quantity}</span>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--kdc-border)] p-1"
                    onClick={() => cart.setQuantity(line.item.id, line.quantity + 1)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <input
                  value={line.specialInstructions ?? ''}
                  onChange={(e) => cart.setLineNote(line.item.id, e.target.value)}
                  placeholder="Special instructions for this item…"
                  className="rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-crimson"
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="h-fit rounded-2xl border border-[var(--kdc-border)] bg-surface p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatGBP(cart.subtotal())}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Discount</dt>
            <dd>-{formatGBP(cart.discount())}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Sales tax (5%)</dt>
            <dd>{formatGBP(cart.tax())}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd>{formatGBP(cart.deliveryFee())}</dd>
          </div>
          <div className="flex justify-between border-t border-[var(--kdc-border)] pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="text-crimson">{formatGBP(cart.total())}</dd>
          </div>
        </dl>
        <Link href="/checkout" className="kdc-button kdc-button-primary mt-6 w-full">
          Checkout
        </Link>
      </aside>
    </div>
  );
}
