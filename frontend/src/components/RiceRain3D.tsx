'use client';

import { useMemo } from 'react';

type Grain = {
  id: number;
  left: string;
  delay: string;
  duration: string;
  size: string;
  rotate: string;
  depth: string;
  opacity: number;
};

/** 3D-style rice grains falling like rain (homepage hero). */
export function RiceRain3D({ density = 42 }: { density?: number }) {
  const grains = useMemo<Grain[]>(() => {
    return Array.from({ length: density }, (_, i) => {
      const depth = 0.35 + (i % 5) * 0.12;
      // Larger grains (12–22px) so rice is clearly visible on the hero
      const sizePx = 12 + (i % 5) * 2.5;
      return {
        id: i,
        left: `${(i * 17 + 7) % 100}%`,
        delay: `${(i % 12) * 0.35}s`,
        duration: `${4.5 + (i % 7) * 0.55}s`,
        size: `${sizePx}px`,
        rotate: `${(i * 37) % 360}deg`,
        depth: depth.toFixed(2),
        opacity: 0.72 + (i % 4) * 0.07,
      };
    });
  }, [density]);

  return (
    <div className="kdc-rice-rain pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="kdc-rice-stage absolute inset-0">
        {grains.map((g) => (
          <span
            key={g.id}
            className="kdc-rice-grain"
            style={{
              left: g.left,
              width: g.size,
              height: `calc(${g.size} * 0.5)`,
              animationDelay: g.delay,
              animationDuration: g.duration,
              ['--rice-rot' as string]: g.rotate,
              ['--rice-depth' as string]: g.depth,
              opacity: g.opacity,
            }}
          />
        ))}
      </div>
    </div>
  );
}
