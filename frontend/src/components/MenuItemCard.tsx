'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { MenuItem, formatGBP, itemPrice } from '@/lib/data';
import { useCart } from '@/lib/cart';
import { MenuImageFx } from '@/components/MenuImageFx';

export function MenuItemCard({ item }: { item: MenuItem }) {
  const addItem = useCart((s) => s.addItem);
  const price = itemPrice(item);

  return (
    <article className="kdc-card-3d group overflow-hidden rounded-2xl border border-[var(--kdc-border)] bg-surface">
      <Link href={`/menu/${item.slug}`} className="relative block aspect-[4/3] overflow-hidden" data-tooltip="View" title="View">
        <MenuImageFx categorySlug={item.categorySlug} className="absolute inset-0">
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-cover transition duration-700 group-hover:scale-105"
            sizes="(max-width:768px) 100vw, 33vw"
          />
        </MenuImageFx>
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 z-[3] flex flex-wrap gap-2">
          {item.isBestSeller && (
            <span className="rounded-full bg-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
              Best Seller
            </span>
          )}
          {item.isNew && (
            <span className="rounded-full bg-crimson px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              New
            </span>
          )}
          {!!item.discountPercent && item.discountPercent > 0 && (
            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-crimson">
              -{item.discountPercent}%
            </span>
          )}
        </div>
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl text-ink">{item.name}</h3>
          </div>
          <div className="text-right">
            <p className="font-semibold text-crimson">{formatGBP(price)}</p>
            {item.discountPercent ? (
              <p className="text-xs text-muted line-through">{formatGBP(item.price)}</p>
            ) : null}
          </div>
        </div>
        <p className="line-clamp-2 text-sm text-muted">{item.description}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => addItem(item)}
            className="kdc-button kdc-button-primary !px-3 !py-2 text-sm"
            data-tooltip="Add"
            title="Add"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>
    </article>
  );
}
