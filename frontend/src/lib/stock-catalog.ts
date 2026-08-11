/** Catalogs for category buy menus (Lentils, Spices, Drinks). */

export type StockCatalog = {
  id: string;
  label: string;
  category: string;
  unit: string;
  defaultCost: number;
  names: string[];
};

export const STOCK_CATALOGS: StockCatalog[] = [
  {
    id: 'lentils',
    label: 'Lentils',
    category: 'Lentils',
    unit: 'kg',
    defaultCost: 250,
    names: [
      'Yellow Lentils (Moong Dal)',
      'Chana Dal',
      'Masoor Dal',
      'Urad Dal',
      'Maash Dal',
      'Mix Dal',
    ],
  },
  {
    id: 'spices',
    label: 'Spices',
    category: 'Spices',
    unit: 'kg',
    defaultCost: 800,
    names: [
      'Red chili powder',
      'Turmeric (Haldi)',
      'Cumin (Zeera)',
      'Garam masala',
      'Black pepper',
      'Coriander powder',
      'Salt',
    ],
  },
  {
    id: 'drinks',
    label: 'Drinks',
    category: 'Drinks',
    unit: 'bottle',
    defaultCost: 60,
    names: [
      'Pepsi',
      'Coca-Cola',
      '7UP',
      'Sprite',
      'Fanta',
      'Mirinda',
      'Diet Coke',
      'Mountain Dew',
      'Mineral Water',
      'Tango',
      'Rubicon',
      'Sting',
    ],
  },
];

const CUSTOM_KEY = 'kdc-stock-catalog-custom';

type CustomMap = Record<string, string[]>;

function readCustomMap(): CustomMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CustomMap;
  } catch {
    return {};
  }
}

function writeCustomMap(map: CustomMap) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(map));
}

/** Names admin added via "Add new stock" that stay in the dropdown. */
export function getCustomCatalogNames(catalogId: string): string[] {
  const map = readCustomMap();
  return map[catalogId] || [];
}

export function addCustomCatalogName(catalogId: string, name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return getCustomCatalogNames(catalogId);
  const map = readCustomMap();
  const list = map[catalogId] || [];
  const exists = list.some((n) => stockNamesMatch(n, trimmed));
  if (!exists) {
    map[catalogId] = [...list, trimmed].sort((a, b) => a.localeCompare(b));
    writeCustomMap(map);
  }
  return map[catalogId] || [];
}

export function catalogById(id: string) {
  return STOCK_CATALOGS.find((c) => c.id === id);
}

/** Categories that belong to a catalog menu (includes legacy labels). */
export function categoriesForCatalog(catalogId: string): string[] {
  if (catalogId === 'lentils') return ['Lentils', 'Pulses', 'Daal'];
  if (catalogId === 'spices') return ['Spices'];
  if (catalogId === 'drinks') return ['Drinks', 'Soft Drinks', 'Beverages'];
  return [];
}

function nameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Same product under different spellings (Mirinda / Marinda) or "Pepsi" vs "Pepsi Bottles". */
export function stockNamesMatch(a: string, b: string): boolean {
  const na = nameKey(a);
  const nb = nameKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const aliasGroups = [
    ['mirinda', 'marinda', 'miranda'],
    ['cocacola', 'coke', 'dietcoke'],
    ['7up', 'sevenup'],
    ['mountaindew', 'dew'],
  ];
  for (const group of aliasGroups) {
    const aHit = group.some((g) => na.includes(g));
    const bHit = group.some((g) => nb.includes(g));
    if (aHit && bHit) return true;
  }
  return false;
}

export function findStockByName<T extends { name: string }>(
  items: T[],
  name: string
): T | undefined {
  return items.find((i) => stockNamesMatch(i.name, name));
}
