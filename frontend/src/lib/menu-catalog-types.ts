/** Shared menu catalog types (client + server). */

import type { MenuItem } from '@/lib/data';

export type MenuItemPatch = Partial<
  Pick<
    MenuItem,
    | 'name'
    | 'description'
    | 'price'
    | 'categorySlug'
    | 'categoryName'
    | 'prepTimeMinutes'
    | 'imageUrl'
    | 'discountPercent'
    | 'effectivePrice'
    | 'isAvailable'
    | 'isBestSeller'
    | 'isNew'
    | 'calories'
  >
>;

export type MenuCatalogState = {
  extras: MenuItem[];
  overrides: Record<string, MenuItemPatch>;
  removedIds: string[];
};
