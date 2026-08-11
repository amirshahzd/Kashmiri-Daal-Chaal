/** Smart unit helpers for inventory (weight, volume, count). */

export type UnitKind = 'weight' | 'volume' | 'count';

const ALLOWED_UNITS = new Set([
  'kg',
  'g',
  'liter',
  'ml',
  'bottle',
  'pcs',
  'pack',
  'can',
  'box',
  'bag',
]);

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

export function normalizeUnitLabel(unit: string): string {
  let u = (unit || '').trim().toLowerCase();
  if (!u) return 'pcs';

  // Strip leading/trailing numbers: "10kg", "10 kg" → "kg"
  u = u.replace(/^[\d.\s]+/, '').trim();
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
  return u || 'pcs';
}

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
