'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CATEGORIES, formatPKR } from '@/lib/data';
import { MenuImageFx } from '@/components/MenuImageFx';
import { useLiveMenuItems } from '@/lib/use-live-menu';

/** Full-bleed menu banner with switchable category views (3D tilt cards). */
export function MenuBanner() {
  const [active, setActive] = useState(CATEGORIES[0]?.slug || 'mains');
  const { items: liveItems } = useLiveMenuItems();

  const MENU_ORDER = [
    'boiled-rice',
    'chicken-pulao',
    'chicken-biryani',
    'shami-kebab',
  ];

  const items = useMemo(() => {
    const list = liveItems
      .filter((i) => i.categorySlug === active && i.isAvailable !== false)
      .sort((a, b) => {
        const ai = MENU_ORDER.indexOf(a.slug);
        const bi = MENU_ORDER.indexOf(b.slug);
        const ao = ai === -1 ? 1000 : ai;
        const bo = bi === -1 ? 1000 : bi;
        return ao - bo;
      });
    // Drinks: show every available drink; other categories keep the 4-item preview
    if (active === 'drinks') return list;
    return list.slice(0, 4);
  }, [active, liveItems]);

  const activeLabel = CATEGORIES.find((c) => c.slug === active)?.name || 'Menu';
  const isDrinks = active === 'drinks';

  return (
    <section className="relative overflow-hidden border-y border-[var(--kdc-border)] bg-crimson-deep py-16 text-white md:py-20">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
        <div className="kdc-menu-banner-glow absolute -left-20 top-0 h-64 w-64 rounded-full bg-gold/30 blur-3xl" />
        <div className="kdc-menu-banner-glow absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-crimson/50 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Menu views</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl md:text-5xl">
          Explore the plate
        </h2>
        <p className="mt-3 max-w-xl text-sm text-white/75">
          Switch between Mains, Sides, and Drinks — each view shows signature dishes ready to order.
        </p>

        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Menu categories">
          {CATEGORIES.map((c) => {
            const on = c.slug === active;
            return (
              <button
                key={c.slug}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(c.slug)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  on
                    ? 'bg-gold text-ink shadow-lg shadow-black/20'
                    : 'border border-white/25 bg-white/5 text-white/90 hover:bg-white/10'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        <div
          key={active}
          className="kdc-menu-view-enter mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          role="tabpanel"
          aria-label={`${activeLabel} dishes`}
        >
          {items.map((item, idx) => (
            <Link
              key={item.id}
              href={`/menu/${item.slug}`}
              className="kdc-card-3d group relative block overflow-hidden rounded-2xl border border-white/15 bg-white/5"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <MenuImageFx categorySlug={item.categorySlug} className="absolute inset-0">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    className="object-cover transition duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 25vw"
                  />
                </MenuImageFx>
                <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 z-[3] p-4">
                  <p className="font-[family-name:var(--font-display)] text-xl leading-tight">
                    {item.name}
                  </p>
                  <p className="mt-1 text-sm text-gold">{formatPKR(item.effectivePrice ?? item.price)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {!isDrinks && (
          <div className="mt-8">
            <Link href="/menu" className="kdc-button kdc-button-gold" data-tooltip="Menu" title="Menu">
              Open full {activeLabel.toLowerCase()} menu
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
