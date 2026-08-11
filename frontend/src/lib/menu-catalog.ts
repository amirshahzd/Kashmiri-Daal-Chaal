/** Admin menu catalog: extras + edits shared via server file store for all users. */

import { CATEGORIES, MENU_ITEMS, type MenuItem } from '@/lib/data';
import type { MenuCatalogState, MenuItemPatch } from '@/lib/menu-catalog-types';

export type { MenuCatalogState, MenuItemPatch } from '@/lib/menu-catalog-types';

export const MENU_EXTRA_KEY = 'kdc-menu-extra';
export const MENU_OVERRIDE_KEY = 'kdc-menu-overrides';
export const MENU_REMOVED_KEY = 'kdc-menu-removed';
export const MENU_EXTRA_EVENT = 'kdc-menu-extra-change';

const emptyState = (): MenuCatalogState => ({
  extras: [],
  overrides: {},
  removedIds: [],
});

/** In-memory cache after first hydrate / admin write (browser only). */
let memoryState: MenuCatalogState | null = null;
let hydratePromise: Promise<void> | null = null;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function readLocalState(): MenuCatalogState {
  if (typeof window === 'undefined') return emptyState();
  try {
    const extras = JSON.parse(localStorage.getItem(MENU_EXTRA_KEY) || '[]') as MenuItem[];
    const overrides = JSON.parse(localStorage.getItem(MENU_OVERRIDE_KEY) || '{}') as Record<
      string,
      MenuItemPatch
    >;
    const removedIds = JSON.parse(localStorage.getItem(MENU_REMOVED_KEY) || '[]') as string[];
    return {
      extras: Array.isArray(extras) ? extras : [],
      overrides: overrides && typeof overrides === 'object' ? overrides : {},
      removedIds: Array.isArray(removedIds) ? removedIds : [],
    };
  } catch {
    return emptyState();
  }
}

function writeLocalState(state: MenuCatalogState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MENU_EXTRA_KEY, JSON.stringify(state.extras));
  localStorage.setItem(MENU_OVERRIDE_KEY, JSON.stringify(state.overrides));
  localStorage.setItem(MENU_REMOVED_KEY, JSON.stringify(state.removedIds));
}

function applyState(state: MenuCatalogState) {
  memoryState = {
    extras: Array.isArray(state.extras) ? state.extras : [],
    overrides: state.overrides && typeof state.overrides === 'object' ? state.overrides : {},
    removedIds: Array.isArray(state.removedIds) ? state.removedIds : [],
  };
  writeLocalState(memoryState);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MENU_EXTRA_EVENT));
  }
}

function getState(): MenuCatalogState {
  if (memoryState) return memoryState;
  if (typeof window !== 'undefined') {
    memoryState = readLocalState();
    return memoryState;
  }
  return emptyState();
}

function isEmpty(state: MenuCatalogState) {
  return (
    !state.extras.length &&
    !state.removedIds.length &&
    Object.keys(state.overrides || {}).length === 0
  );
}

function applyPatch(item: MenuItem, patch?: MenuItemPatch): MenuItem {
  if (!patch) return item;
  const next = { ...item, ...patch };
  if (patch.price != null && patch.effectivePrice == null && patch.discountPercent == null) {
    next.effectivePrice = undefined;
  } else if (next.discountPercent && next.discountPercent > 0 && next.effectivePrice == null) {
    next.effectivePrice = Math.round(next.price * (1 - next.discountPercent / 100));
  }
  if (patch.categorySlug) {
    const cat = CATEGORIES.find((c) => c.slug === patch.categorySlug);
    if (cat) next.categoryName = cat.name;
  }
  return next;
}

export function mergeMenuCatalog(state: MenuCatalogState): MenuItem[] {
  const removed = new Set(state.removedIds || []);
  const overrides = state.overrides || {};
  const base = MENU_ITEMS.filter((i) => !removed.has(i.id)).map((i) =>
    applyPatch(i, overrides[i.id])
  );
  const byId = new Set(base.map((i) => i.id));
  const extras = (state.extras || [])
    .filter((e) => !byId.has(e.id) && !removed.has(e.id))
    .map((e) => applyPatch(e, overrides[e.id]));
  return [...base, ...extras].filter((i) => i.isAvailable !== false);
}

/** Built-in + shared catalog (client cache; SSR returns built-in only until hydrate). */
export function getLiveMenuItems(): MenuItem[] {
  if (typeof window === 'undefined') return MENU_ITEMS.filter((i) => i.isAvailable !== false);
  return mergeMenuCatalog(getState());
}

export function listAdminMenuItems(): MenuItem[] {
  if (typeof window === 'undefined') return MENU_ITEMS;
  // Admin list includes unavailable items for editing
  const state = getState();
  const removed = new Set(state.removedIds || []);
  const overrides = state.overrides || {};
  const base = MENU_ITEMS.filter((i) => !removed.has(i.id)).map((i) =>
    applyPatch(i, overrides[i.id])
  );
  const byId = new Set(base.map((i) => i.id));
  const extras = (state.extras || [])
    .filter((e) => !byId.has(e.id) && !removed.has(e.id))
    .map((e) => applyPatch(e, overrides[e.id]));
  return [...base, ...extras];
}

async function saveStateToServer(state: MenuCatalogState): Promise<MenuCatalogState> {
  const res = await fetch('/api/menu-catalog', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error('Could not save menu to server');
  const data = (await res.json()) as MenuCatalogState;
  applyState({
    extras: data.extras || [],
    overrides: data.overrides || {},
    removedIds: data.removedIds || [],
  });
  return getState();
}

/** Load shared catalog so admin changes appear for all customers. */
export async function refreshMenuCatalogFromServer(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/menu-catalog', { cache: 'no-store' });
    if (!res.ok) return;
    const server = (await res.json()) as MenuCatalogState;
    const normalized: MenuCatalogState = {
      extras: Array.isArray(server.extras) ? server.extras : [],
      overrides:
        server.overrides && typeof server.overrides === 'object' ? server.overrides : {},
      removedIds: Array.isArray(server.removedIds) ? server.removedIds : [],
    };

    // One-time migrate previous localStorage-only admin menu to shared store
    if (isEmpty(normalized)) {
      const local = readLocalState();
      if (!isEmpty(local)) {
        await fetch('/api/menu-catalog', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...local, mergeIfEmpty: true }),
        });
        applyState(local);
        return;
      }
    }

    applyState(normalized);
  } catch {
    // Offline / API down: keep local cache
    if (!memoryState) memoryState = readLocalState();
  }
}

/** Ensure catalog is loaded once (safe to call from many pages). */
export function ensureMenuCatalogHydrated(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = refreshMenuCatalogFromServer().finally(() => {
      /* allow later re-hydrate via refreshMenuCatalogFromServer */
    });
  }
  return hydratePromise;
}

export async function addMenuItemFromAdmin(input: {
  name: string;
  description: string;
  price: number;
  categorySlug: string;
  prepTimeMinutes?: number;
  imageUrl?: string;
}): Promise<MenuItem> {
  await ensureMenuCatalogHydrated();
  const name = input.name.trim();
  const cat = CATEGORIES.find((c) => c.slug === input.categorySlug) || CATEGORIES[0];
  let slug = slugify(name) || `item-${Date.now()}`;
  const all = listAdminMenuItems();
  if (all.some((i) => i.slug === slug)) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }
  const item: MenuItem = {
    id: `admin-${crypto.randomUUID()}`,
    name,
    slug,
    description: input.description.trim() || name,
    ingredients: [],
    allergens: [],
    price: Math.max(0, Math.round(input.price)),
    prepTimeMinutes: input.prepTimeMinutes || 15,
    imageUrl:
      input.imageUrl?.trim() ||
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1200&q=80',
    categorySlug: cat.slug,
    categoryName: cat.name,
    isHalal: true,
    isAvailable: true,
    isNew: true,
  };
  const state = { ...getState(), extras: [item, ...getState().extras] };
  await saveStateToServer(state);
  return item;
}

/** Update price or other details for one menu item (built-in or admin-added). */
export async function updateMenuItemFromAdmin(
  id: string,
  patch: MenuItemPatch
): Promise<MenuItem | null> {
  await ensureMenuCatalogHydrated();
  const all = listAdminMenuItems();
  const current = all.find((i) => i.id === id);
  if (!current) return null;

  const cleaned: MenuItemPatch = { ...patch };
  if (cleaned.price != null) cleaned.price = Math.max(0, Math.round(Number(cleaned.price)));
  if (cleaned.prepTimeMinutes != null) {
    cleaned.prepTimeMinutes = Math.max(1, Math.round(Number(cleaned.prepTimeMinutes)));
  }
  if (cleaned.discountPercent != null) {
    const d = Math.max(0, Math.min(90, Math.round(Number(cleaned.discountPercent))));
    cleaned.discountPercent = d;
    cleaned.effectivePrice =
      d > 0 ? Math.round((cleaned.price ?? current.price) * (1 - d / 100)) : undefined;
  }
  if (cleaned.name != null) cleaned.name = String(cleaned.name).trim() || current.name;
  if (cleaned.description != null) cleaned.description = String(cleaned.description).trim();
  if (cleaned.imageUrl != null) cleaned.imageUrl = String(cleaned.imageUrl).trim() || current.imageUrl;

  const state = getState();
  const extras = [...state.extras];
  const exIdx = extras.findIndex((e) => e.id === id);
  if (exIdx >= 0) {
    extras[exIdx] = applyPatch(extras[exIdx], cleaned);
  }

  const overrides = { ...state.overrides };
  overrides[id] = { ...(overrides[id] || {}), ...cleaned };

  await saveStateToServer({ ...state, extras, overrides });
  return applyPatch(current, cleaned);
}

/** Remove a dish from the customer-facing menu (discontinued). */
export async function deleteMenuItemFromAdmin(id: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  await ensureMenuCatalogHydrated();

  const state = getState();
  const extras = state.extras.filter((e) => e.id !== id);
  const overrides = { ...state.overrides };
  delete overrides[id];
  const removedIds = state.removedIds.includes(id)
    ? state.removedIds
    : [...state.removedIds, id];

  await saveStateToServer({ extras, overrides, removedIds });
  return true;
}
