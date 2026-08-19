'use client';

import Image from 'next/image';
import { use, useEffect, useState } from 'react';
import { formatGBP, itemPrice, type MenuItem } from '@/lib/data';
import { getLiveMenuItems, ensureMenuCatalogHydrated } from '@/lib/menu-catalog';
import { MenuImageFx } from '@/components/MenuImageFx';
import { AddToCartButton } from './AddToCartButton';
import Link from 'next/link';

export default function MenuItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [item, setItem] = useState<MenuItem | null | undefined>(undefined);

  useEffect(() => {
    void ensureMenuCatalogHydrated().then(() => {
      const found = getLiveMenuItems().find((i) => i.slug === slug) || null;
      setItem(found);
    });
    const onChange = () => {
      const found = getLiveMenuItems().find((i) => i.slug === slug) || null;
      setItem(found);
    };
    window.addEventListener('kdc-menu-extra-change', onChange);
    return () => window.removeEventListener('kdc-menu-extra-change', onChange);
  }, [slug]);

  if (item === undefined) {
    return <p className="px-4 py-16 text-center text-sm text-muted">Loading…</p>;
  }
  if (!item) {
    return (
      <p className="px-4 py-16 text-center text-sm text-muted">
        Dish not found.{' '}
        <Link href="/menu" className="text-crimson underline">
          Back to menu
        </Link>
      </p>
    );
  }

  const price = itemPrice(item);

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 md:grid-cols-2 md:px-6 md:py-14">
      <MenuImageFx
        categorySlug={item.categorySlug}
        className="relative aspect-square overflow-hidden rounded-3xl"
      >
        <Image src={item.imageUrl} alt={item.name} fill className="object-cover" priority sizes="50vw" />
      </MenuImageFx>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">{item.categoryName}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-5xl text-ink">{item.name}</h1>
        <p className="mt-4 text-muted">{item.description}</p>
        <p className="mt-6 text-3xl font-semibold text-crimson">{formatGBP(price)}</p>
        <ul className="mt-6 space-y-2 text-sm text-muted">
          {item.calories != null && (
            <li>
              <strong className="text-ink">Calories:</strong> {item.calories} kcal
            </li>
          )}
          <li>
            <strong className="text-ink">Ingredients:</strong>{' '}
            {item.ingredients.length ? item.ingredients.join(', ') : '—'}
          </li>
          <li>
            <strong className="text-ink">Allergens:</strong>{' '}
            {item.allergens.length ? item.allergens.join(', ') : 'None listed'}
          </li>
        </ul>
        <div className="mt-8">
          <AddToCartButton item={item} />
        </div>
      </div>
    </div>
  );
}
