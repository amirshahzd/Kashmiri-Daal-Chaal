'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveMenuItems } from '@/lib/use-live-menu';
import { MenuItemCard } from '@/components/MenuItemCard';

const FEATURED_ORDER = ['boiled-rice', 'chicken-pulao', 'chicken-biryani', 'shami-kebab'];

/** Featured plates on home — live menu so admin-added dishes can appear app-wide. */
export function FeaturedPlates() {
  const { items: liveItems } = useLiveMenuItems();

  const featured = useMemo(() => {
    const bySlug = FEATURED_ORDER.map((slug) => liveItems.find((i) => i.slug === slug)).filter(
      Boolean
    ) as typeof liveItems;
    if (bySlug.length >= 4) return bySlug.slice(0, 4);
    // Fill with other live items (including admin-added “New” dishes)
    const rest = liveItems.filter((i) => !FEATURED_ORDER.includes(i.slug) && i.isAvailable !== false);
    const combined = [...bySlug, ...rest];
    return combined.slice(0, 4);
  }, [liveItems]);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 md:px-6">
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Featured</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
            Plates we are known for
          </h2>
        </div>
        <Link
          href="/menu"
          className="text-sm font-medium text-crimson hover:underline"
          data-tooltip="Menu"
          title="Menu"
        >
          Full menu →
        </Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
