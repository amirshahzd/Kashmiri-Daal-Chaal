'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CATEGORIES } from '@/lib/data';
import { useLiveMenuItems } from '@/lib/use-live-menu';
import { MenuItemCard } from '@/components/MenuItemCard';

export default function MenuPage() {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'popular' | 'new' | 'offers'>('all');
  const { items: liveItems } = useLiveMenuItems();

  /** Preferred plate order: rice, pulao, biryani, shami kebab, then the rest. */
  const MENU_ORDER = [
    'boiled-rice',
    'chicken-pulao',
    'chicken-biryani',
    'shami-kebab',
  ];

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = liveItems.filter((item) => {
      if (!q && category !== 'all' && item.categorySlug !== category) return false;
      if (q) {
        const haystack = [
          item.name,
          item.nameUr,
          item.description,
          item.categoryName,
          item.categorySlug,
          item.slug,
          ...(item.ingredients || []),
          ...(item.allergens || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filter === 'popular' && !item.isBestSeller) return false;
      if (filter === 'new' && !item.isNew) return false;
      if (filter === 'offers' && !(item.discountPercent && item.discountPercent > 0)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const ai = MENU_ORDER.indexOf(a.slug);
      const bi = MENU_ORDER.indexOf(b.slug);
      const ao = ai === -1 ? 1000 : ai;
      const bo = bi === -1 ? 1000 : bi;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }, [category, search, filter, liveItems]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Digital menu</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-5xl text-ink">
          Kashmiri Daal Chawal Menu
        </h1>
        <p className="mt-3 text-muted">
          Browse mains, sides and drinks. Filter by favourites, new plates, or live offers.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes…"
            className="w-full rounded-full border border-[var(--kdc-border)] bg-surface py-3 pl-10 pr-4 text-sm outline-none ring-crimson focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['popular', 'Popular'],
              ['new', 'New'],
              ['offers', 'Offers'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-2 text-sm ${
                filter === key ? 'bg-crimson text-white' : 'border border-[var(--kdc-border)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`rounded-full px-4 py-2 text-sm ${
            category === 'all' ? 'bg-gold text-ink' : 'border border-[var(--kdc-border)]'
          }`}
        >
          All categories
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setCategory(c.slug)}
            className={`rounded-full px-4 py-2 text-sm ${
              category === c.slug ? 'bg-gold text-ink' : 'border border-[var(--kdc-border)]'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </div>
      {!items.length && (
        <p className="mt-12 text-center text-muted">No dishes match your filters.</p>
      )}
    </div>
  );
}
