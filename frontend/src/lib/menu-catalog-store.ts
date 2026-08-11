/** Server-only menu catalog file store (shared for all browsers / customers). */

import fs from 'fs';
import path from 'path';
import type { MenuItem } from '@/lib/data';
import type { MenuItemPatch, MenuCatalogState } from '@/lib/menu-catalog-types';

const FILE = path.join(process.cwd(), 'data', 'menu-catalog.json');

export function emptyMenuCatalogState(): MenuCatalogState {
  return { extras: [], overrides: {}, removedIds: [] };
}

export function readMenuCatalogState(): MenuCatalogState {
  try {
    if (!fs.existsSync(FILE)) return emptyMenuCatalogState();
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw) as Partial<MenuCatalogState>;
    return {
      extras: Array.isArray(data.extras) ? (data.extras as MenuItem[]) : [],
      overrides:
        data.overrides && typeof data.overrides === 'object'
          ? (data.overrides as Record<string, MenuItemPatch>)
          : {},
      removedIds: Array.isArray(data.removedIds) ? data.removedIds : [],
    };
  } catch {
    return emptyMenuCatalogState();
  }
}

export function writeMenuCatalogState(state: MenuCatalogState): MenuCatalogState {
  const clean: MenuCatalogState = {
    extras: Array.isArray(state.extras) ? state.extras : [],
    overrides: state.overrides && typeof state.overrides === 'object' ? state.overrides : {},
    removedIds: Array.isArray(state.removedIds) ? state.removedIds : [],
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}

export function isMenuCatalogEmpty(state: MenuCatalogState) {
  return (
    !state.extras.length &&
    !state.removedIds.length &&
    Object.keys(state.overrides || {}).length === 0
  );
}
