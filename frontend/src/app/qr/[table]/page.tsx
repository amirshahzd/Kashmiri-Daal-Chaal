'use client';

import Link from 'next/link';
import { use } from 'react';
import { MenuItemCard } from '@/components/MenuItemCard';
import { useLiveMenuItems } from '@/lib/use-live-menu';

export default function QrTablePage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = use(params);
  const tableLabel = table.toUpperCase();
  const { items: liveItems } = useLiveMenuItems();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">QR table ordering</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
        Table {tableLabel} · Kashmiri Daal Chawal
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Order from your seat. Items go to the kitchen display with your table number attached.
      </p>
      <Link href="/cart" className="kdc-button kdc-button-primary mt-6 inline-flex">
        View cart & checkout as Eat In
      </Link>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {liveItems.slice(0, 12).map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
