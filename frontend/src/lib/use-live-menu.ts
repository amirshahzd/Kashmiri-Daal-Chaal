'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ensureMenuCatalogHydrated,
  getLiveMenuItems,
  listAdminMenuItems,
  MENU_EXTRA_EVENT,
  refreshMenuCatalogFromServer,
} from '@/lib/menu-catalog';
import type { MenuItem } from '@/lib/data';

/**
 * Live menu for customers + admin UI.
 * Hydrates shared server catalog, listens for local changes, polls so other devices stay in sync.
 */
export function useLiveMenuItems(options?: {
  admin?: boolean;
  pollMs?: number;
}): { items: MenuItem[]; ready: boolean; refresh: () => Promise<void> } {
  const admin = options?.admin === true;
  const pollMs = options?.pollMs ?? 20_000;
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureMenuCatalogHydrated().finally(() => {
      if (!cancelled) {
        setReady(true);
        setTick((n) => n + 1);
      }
    });

    const bump = () => setTick((n) => n + 1);
    window.addEventListener(MENU_EXTRA_EVENT, bump);
    window.addEventListener('storage', bump);

    const poll = window.setInterval(() => {
      void refreshMenuCatalogFromServer().then(() => {
        if (!cancelled) setTick((n) => n + 1);
      });
    }, pollMs);

    return () => {
      cancelled = true;
      window.removeEventListener(MENU_EXTRA_EVENT, bump);
      window.removeEventListener('storage', bump);
      window.clearInterval(poll);
    };
  }, [pollMs]);

  const items = useMemo(() => {
    void tick;
    return admin ? listAdminMenuItems() : getLiveMenuItems();
  }, [tick, admin]);

  async function refresh() {
    await refreshMenuCatalogFromServer();
    setTick((n) => n + 1);
  }

  return { items, ready, refresh };
}
