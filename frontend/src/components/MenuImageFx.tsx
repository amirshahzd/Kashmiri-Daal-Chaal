'use client';

import type { ReactNode } from 'react';
import { Image3D, type Image3DVariant } from '@/components/Image3D';

/** Continuous 3D image frame + effects: smoke from food, condensation drips from drink. */
export function MenuImageFx({
  categorySlug,
  className,
  children,
  variant = 'default',
}: {
  categorySlug: string;
  className?: string;
  children: ReactNode;
  variant?: Image3DVariant;
}) {
  const isDrink = categorySlug === 'drinks';

  const fx = isDrink ? (
    <div className="kdc-drink-drips pointer-events-none absolute inset-0 z-[2]" aria-hidden>
      {/* Drips only on the drink body (glass / bottle area), not full sky */}
      <div className="kdc-drink-body">
        <span className="kdc-drip kdc-drip-1" />
        <span className="kdc-drip kdc-drip-2" />
        <span className="kdc-drip kdc-drip-3" />
        <span className="kdc-drip kdc-drip-4" />
        <span className="kdc-drip kdc-drip-5" />
        <span className="kdc-drip kdc-drip-6" />
        <span className="kdc-drip kdc-drip-7" />
        <span className="kdc-drip kdc-drip-8" />
      </div>
    </div>
  ) : (
    <div className="kdc-food-smoke pointer-events-none absolute inset-0 z-[2]" aria-hidden>
      {/* Smoke rises from plate/food zone only (center of photo) */}
      <div className="kdc-plate-zone">
        <span className="kdc-smoke-bank" />
        <span className="kdc-smoke kdc-smoke-1" />
        <span className="kdc-smoke kdc-smoke-2" />
        <span className="kdc-smoke kdc-smoke-3" />
        <span className="kdc-smoke kdc-smoke-4" />
        <span className="kdc-smoke kdc-smoke-5" />
        <span className="kdc-smoke kdc-smoke-6" />
        <span className="kdc-smoke kdc-smoke-thick kdc-smoke-7" />
        <span className="kdc-smoke kdc-smoke-thick kdc-smoke-8" />
      </div>
    </div>
  );

  return (
    <Image3D className={className} variant={variant} overlays={fx}>
      {children}
    </Image3D>
  );
}
