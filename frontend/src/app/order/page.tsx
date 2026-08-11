'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { CATEGORIES } from '@/lib/data';
import { useLiveMenuItems } from '@/lib/use-live-menu';
import { MenuItemCard } from '@/components/MenuItemCard';

const MENU_ORDER = ['boiled-rice', 'chicken-pulao', 'chicken-biryani', 'shami-kebab'];

export default function OrderPage() {
  const { items: liveItems } = useLiveMenuItems();

  const sections = useMemo(() => {
    const all = liveItems
      .filter((i) => i.isAvailable !== false)
      .sort((a, b) => {
        const ai = MENU_ORDER.indexOf(a.slug);
        const bi = MENU_ORDER.indexOf(b.slug);
        const ao = ai === -1 ? 1000 : ai;
        const bo = bi === -1 ? 1000 : bi;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });

    return CATEGORIES.map((cat) => ({
      ...cat,
      items: all.filter((i) => i.categorySlug === cat.slug),
    })).filter((s) => s.items.length > 0);
  }, [liveItems]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Online ordering</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-5xl text-ink">
        Order Kashmiri Daal Chawal
      </h1>
      <p className="mt-3 max-w-2xl text-muted">
        Full menu — mains, sides and drinks. Add items to your cart, then checkout for Take Away or
        Delivery. You can also order via Foodpanda, Bykea or Careem.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { href: '/menu', title: 'Browse full menu', desc: 'Search & filter every dish' },
          { href: '/cart', title: 'View cart', desc: 'Review quantities & notes' },
          { href: '/checkout', title: 'Checkout', desc: 'Take away or delivery' },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-[var(--kdc-border)] bg-surface p-5 transition hover:border-crimson"
          >
            <p className="font-semibold text-ink">{c.title}</p>
            <p className="mt-1 text-sm text-muted">{c.desc}</p>
          </Link>
        ))}
      </div>

      {sections.map((section) => (
        <section key={section.slug} className="mt-14" id={`order-${section.slug}`}>
          <div className="mb-6">
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-ink">
              {section.name}
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}

      {!sections.length && (
        <p className="mt-12 text-center text-muted">Menu is being updated. Please check back shortly.</p>
      )}
    </div>
  );
}
