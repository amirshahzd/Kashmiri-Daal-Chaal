'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Image3DVariant = 'default' | 'compact' | 'hero' | 'avatar';

/**
 * Universal 3D presentation for every photo in the app.
 * New admin image URLs go through the same frame when used with MenuImageFx / Image3D.
 */
export function Image3D({
  children,
  className,
  variant = 'default',
  overlays,
}: {
  children: ReactNode;
  className?: string;
  variant?: Image3DVariant;
  /** Layers above the photo (smoke, drips, badges, etc.). */
  overlays?: ReactNode;
}) {
  return (
    <div className={cn('kdc-img-3d', `kdc-img-3d--${variant}`, className)}>
      <div className="kdc-img-3d-stage">
        <div className="kdc-img-3d-plane">
          {children}
          <span className="kdc-img-3d-shine" aria-hidden />
          <span className="kdc-img-3d-depth" aria-hidden />
          {overlays}
        </div>
      </div>
    </div>
  );
}
