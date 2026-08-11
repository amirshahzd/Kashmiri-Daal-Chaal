/** Smart unit helpers for inventory (weight, volume, count). */

export type UnitKind = 'weight' | 'volume' | 'count';

/** Full list for record-keeper dropdowns */
export const UNIT_OPTIONS: Array<{ value: string; label: string; kind: UnitKind }> = [
  { value: 'kg', label: 'kg (kilograms)', kind: 'weight' },
  { value: 'g', label: 'g (grams)', kind: 'weight' },
  { value: 'liter', label: 'liter (L)', kind: 'volume' },
  { value: 'ml', label: 'ml (milliliters)', kind: 'volume' },
  { value: 'bottle', label: 'bottle (count)', kind: 'count' },
  { value: 'pcs', label: 'pcs (pieces)', kind: 'count' },
  { value: 'pack', label: 'pack (count)', kind: 'count' },
  { value: 'can', label: 'can (count)', kind: 'count' },
  { value: 'box', label: 'box (count)', kind: 'count' },
  { value: 'bag', label: 'bag (count)', kind: 'count' },
];

const ALLOWED_UNITS = new Set(UNIT_OPTIONS.map((o) => o.value));

const COUNT_UNITS = new Set([
  'pcs',
  'pc',
  'piece',
  'pieces',
  'bottle',
  'bottles',
  'can',
  'cans',
  'pack',
  'packs',
  'box',
  'boxes',
  'bag',
  'bags',
  'tray',
  'trays',
  'dozen',
  'unit',
  'units',
  'number',
  'nos',
  'no',
]);

const WEIGHT_UNITS = new Set(['kg', 'g', 'gram', 'grams', 'kilogram', 'kilograms']);
const VOLUME_UNITS = new Set(['liter', 'litre', 'liters', 'litres', 'l', 'ml', 'milliliter', 'millilitre']);

/**
 * Clean bad units like "10kg", "5liter", "2 kg" → "kg" / "liter".
 * Never allow quantity to be embedded in the unit label.
 */
export function normalizeUnitLabel(unit: string): string {
  let u = (unit || '').trim().toLowerCase();
  if (!u) return 'pcs';

  // Strip leading numbers / spaces: "10kg", "10 kg", "2.5liter" → "kg" / "liter"
  u = u.replace(/^[\d.\s]+/, '').trim();
  // Strip trailing numbers accidentally pasted
  u = u.replace(/[\d.\s]+$/, '').trim();

  if (['pc', 'piece', 'pieces', 'number', 'nos', 'no', 'unit', 'units'].includes(u)) return 'pcs';
  if (u === 'bottles') return 'bottle';
  if (u === 'cans') return 'can';
  if (u === 'packs') return 'pack';
  if (u === 'boxes') return 'box';
  if (u === 'bags') return 'bag';
  if (['gram', 'grams'].includes(u)) return 'g';
  if (['kilogram', 'kilograms'].includes(u)) return 'kg';
  if (['litre', 'liters', 'litres', 'l'].includes(u)) return 'liter';
  if (['milliliter', 'millilitre'].includes(u)) return 'ml';

  if (ALLOWED_UNITS.has(u)) return u;
  // Unknown garbage (e.g. leftover text) — fall back later via suggestUnitFromName
  return u || 'pcs';
}

/** Resolve a safe unit for an item (fixes "10kg" and similar). */
export function resolveItemUnit(unit: string | undefined, name?: string): string {
  const cleaned = normalizeUnitLabel(unit || '');
  if (ALLOWED_UNITS.has(cleaned)) return cleaned;
  if (name) return suggestUnitFromName(name);
  return 'kg';
}

export function unitKind(unit: string): UnitKind {
  const u = normalizeUnitLabel(unit);
  if (WEIGHT_UNITS.has(u)) return 'weight';
  if (VOLUME_UNITS.has(u)) return 'volume';
  if (COUNT_UNITS.has(u)) return 'count';
  return 'count';
}

export function unitKindLabel(unit: string): string {
  const kind = unitKind(unit);
  if (kind === 'weight') return 'Weight';
  if (kind === 'volume') return 'Volume';
  return 'Count';
}

/**
 * Suggest unit from item name:
 * - oil → liter
 * - ghee → kg
 * - spices / chili powder → kg
 */
export function suggestUnitFromName(name: string): string {
  const n = name.toLowerCase();

  if (/\boil\b/.test(n) && !n.includes('ghee')) return 'liter';
  if (n.includes('ghee')) return 'kg';

  if (
    /(spice|masala|chili|chilli|powder|turmeric|haldi|cumin|zeera|pepper|garam|saffron|cardamom|clove|coriander|dhania)/i.test(
      n
    )
  ) {
    return 'kg';
  }

  if (
    /(rice|basmati|daal|dal|lentil|chicken|meat|mutton|beef|flour|atta|sugar|salt|onion|potato|tomato|pulao|biryani)/i.test(
      n
    )
  ) {
    return 'kg';
  }

  if (isSoftDrinkName(n)) return 'bottle';

  if (/(egg|roti|naan|kebab|shami|samosa|pack|box|can)/i.test(n)) return 'pcs';

  return 'pcs';
}

/** Soft drinks / beverages — includes common spellings (e.g. Marinda → Mirinda). */
export function isSoftDrinkName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return (
    /(pepsi|coke|cola|coca[\s-]?cola|sprite|fanta|7[\s-]?up|7up|tango|rubicon|mirinda|marinda|miranda|dew|mountain\s*dew|sting|pakola|slice|milo|nesvita|red\s*bull|monster|energy\s*drink|soft\s*drink|beverage|mineral\s*water|drinking\s*water|\bwater\b|\bbottle\b|drink)/i.test(
      n
    )
  );
}

export function suggestCategoryFromName(name: string): string {
  const n = name.toLowerCase();
  if (/\boil\b/.test(n) && !n.includes('ghee')) return 'Oils';
  if (n.includes('ghee')) return 'Dairy / Fats';
  if (
    /(spice|masala|chili|chilli|haldi|cumin|zeera|powder|garam|pepper|coriander|dhania|saffron|cardamom|clove)/i.test(
      n
    )
  ) {
    return 'Spices';
  }
  if (isSoftDrinkName(n)) return 'Drinks';
  if (/(rice|basmati|flour|atta)/i.test(n)) return 'Grains';
  if (/(daal|dal|dall|lentil|moong|masoor|urad|maash|chana)/i.test(n)) return 'Lentils';
  if (/(chicken|meat|mutton|beef)/i.test(n)) return 'Meat';
  return 'General';
}

export function toStoredQuantity(
  quantity: number,
  itemUnit: string,
  entryUnit?: string
): number {
  const qty = Math.abs(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) return 0;

  const stored = resolveItemUnit(itemUnit);
  const entry = resolveItemUnit(entryUnit || itemUnit);
  const kind = unitKind(stored);

  if (kind === 'count') {
    return Math.round(qty);
  }

  if (kind === 'volume') {
    let inMl = qty;
    if (entry === 'liter') inMl = qty * 1000;
    else if (entry === 'ml') inMl = qty;
    else inMl = stored === 'liter' ? qty * 1000 : qty;

    if (stored === 'ml') return Number(inMl.toFixed(0));
    return Number((inMl / 1000).toFixed(3));
  }

  let inGrams = qty;
  if (entry === 'kg') inGrams = qty * 1000;
  else if (entry === 'g') inGrams = qty;
  else inGrams = stored === 'kg' ? qty * 1000 : qty;

  if (stored === 'g') return Number(inGrams.toFixed(0));
  return Number((inGrams / 1000).toFixed(3));
}

export function formatQty(quantity: number, unit: string): string {
  const u = resolveItemUnit(unit);
  const kind = unitKind(u);
  const q = Number(quantity) || 0;
  if (kind === 'count') return `${Math.round(q)} ${u}`;
  if (u === 'g') return `${Math.round(q)} g`;
  if (u === 'ml') return `${Math.round(q)} ml`;
  if (u === 'liter') {
    const s = Number(q.toFixed(3)).toString();
    return `${s} L`;
  }
  const s = Number(q.toFixed(3)).toString();
  return `${s} kg`;
}

export function entryUnitsForItem(itemUnit: string): Array<{ value: string; label: string }> {
  const stored = resolveItemUnit(itemUnit);
  const kind = unitKind(stored);

  if (kind === 'volume') {
    if (stored === 'ml') {
      return [
        { value: 'ml', label: 'milliliters (ml)' },
        { value: 'liter', label: 'liters (L)' },
      ];
    }
    return [
      { value: 'liter', label: 'liters (L)' },
      { value: 'ml', label: 'milliliters (ml)' },
    ];
  }

  if (kind === 'weight') {
    if (stored === 'g') {
      return [
        { value: 'kg', label: 'kilograms (kg)' },
        { value: 'g', label: 'grams (g)' },
      ];
    }
    return [
      { value: 'kg', label: 'kilograms (kg)' },
      { value: 'g', label: 'grams (g)' },
    ];
  }

  return [{ value: stored, label: `count (${stored})` }];
}
