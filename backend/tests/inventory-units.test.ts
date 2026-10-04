
import { describe, expect, it } from 'vitest';
import {
  normalizeUnitLabel,
  resolveItemUnit,
  unitKind,
  suggestUnitFromName,
  isSoftDrinkName,
  suggestCategoryFromName,
  toStoredQuantity,
} from '../src/utils/inventory-units';

describe('normalizeUnitLabel', () => {
  it('returns "pcs" for empty / whitespace input', () => {
    expect(normalizeUnitLabel('')).toBe('pcs');
    expect(normalizeUnitLabel('   ')).toBe('pcs');
    // @ts-expect-error runtime guard for undefined
    expect(normalizeUnitLabel(undefined)).toBe('pcs');
  });

  it('lowercases and trims', () => {
    expect(normalizeUnitLabel('  KG  ')).toBe('kg');
    expect(normalizeUnitLabel('Liter')).toBe('liter');
  });

  it('strips leading and trailing numbers with optional spaces', () => {
    expect(normalizeUnitLabel('10kg')).toBe('kg');
    expect(normalizeUnitLabel('10 kg')).toBe('kg');
    expect(normalizeUnitLabel('kg10')).toBe('kg');
    expect(normalizeUnitLabel('2.5 liter')).toBe('liter');
    expect(normalizeUnitLabel('1.5kg ')).toBe('kg');
  });

  it('collapses count synonyms to "pcs"', () => {
    for (const u of ['pc', 'piece', 'pieces', 'number', 'nos', 'no', 'unit', 'units']) {
      expect(normalizeUnitLabel(u)).toBe('pcs');
    }
  });

  it('canonicalizes plural count units', () => {
    expect(normalizeUnitLabel('bottles')).toBe('bottle');
    expect(normalizeUnitLabel('cans')).toBe('can');
    expect(normalizeUnitLabel('packs')).toBe('pack');
    expect(normalizeUnitLabel('boxes')).toBe('box');
    expect(normalizeUnitLabel('bags')).toBe('bag');
  });

  it('canonicalizes weight synonyms', () => {
    expect(normalizeUnitLabel('gram')).toBe('g');
    expect(normalizeUnitLabel('grams')).toBe('g');
    expect(normalizeUnitLabel('kilogram')).toBe('kg');
    expect(normalizeUnitLabel('kilograms')).toBe('kg');
  });

  it('canonicalizes volume synonyms', () => {
    expect(normalizeUnitLabel('litre')).toBe('liter');
    expect(normalizeUnitLabel('liters')).toBe('liter');
    expect(normalizeUnitLabel('litres')).toBe('liter');
    expect(normalizeUnitLabel('l')).toBe('liter');
    expect(normalizeUnitLabel('milliliter')).toBe('ml');
    expect(normalizeUnitLabel('millilitre')).toBe('ml');
  });

  it('passes through allowed units unchanged', () => {
    for (const u of ['kg', 'g', 'liter', 'ml', 'bottle', 'pcs', 'pack', 'can', 'box', 'bag']) {
      expect(normalizeUnitLabel(u)).toBe(u);
    }
  });

  it('returns unknown-but-nonempty units as-is', () => {
    expect(normalizeUnitLabel('tray')).toBe('tray');
    expect(normalizeUnitLabel('dozen')).toBe('dozen');
    expect(normalizeUnitLabel('widget')).toBe('widget');
  });
});

describe('resolveItemUnit', () => {
  it('returns the allowed unit when valid', () => {
    expect(resolveItemUnit('kg')).toBe('kg');
    expect(resolveItemUnit('bottle')).toBe('bottle');
    expect(resolveItemUnit('10kg')).toBe('kg');
  });

  it('falls back to name-based suggestion when the normalized unit is not allowed', () => {
    // 'tray' normalizes to 'tray' which is not in ALLOWED_UNITS → uses name
    expect(resolveItemUnit('tray', 'Basmati Rice')).toBe('kg');
    expect(resolveItemUnit('widget', 'Pepsi 1.5L')).toBe('bottle');
  });

  it('returns "pcs" when unit is empty/undefined (normalizeUnitLabel short-circuits)', () => {
    // normalizeUnitLabel('') === 'pcs', which IS an allowed unit — so it returns
    // immediately without ever consulting the name or the 'kg' fallback.
    expect(resolveItemUnit('')).toBe('pcs');
    expect(resolveItemUnit(undefined)).toBe('pcs');
    // Even with a name hint, the short-circuit wins.
    expect(resolveItemUnit('', 'Pepsi 1.5L')).toBe('pcs');
  });

  it('falls back to "kg" when the unit is unrecognized and no name is given', () => {
    expect(resolveItemUnit('tray')).toBe('kg');
    expect(resolveItemUnit('widget')).toBe('kg');
  });
});

describe('unitKind', () => {
  it('classifies weight units', () => {
    expect(unitKind('kg')).toBe('weight');
    expect(unitKind('g')).toBe('weight');
    expect(unitKind('kilograms')).toBe('weight');
  });

  it('classifies volume units', () => {
    expect(unitKind('liter')).toBe('volume');
    expect(unitKind('ml')).toBe('volume');
    expect(unitKind('litre')).toBe('volume');
  });

  it('classifies count units', () => {
    expect(unitKind('pcs')).toBe('count');
    expect(unitKind('bottle')).toBe('count');
    expect(unitKind('pack')).toBe('count');
    expect(unitKind('box')).toBe('count');
    expect(unitKind('bag')).toBe('count');
  });

  it('defaults unknown units to "count"', () => {
    expect(unitKind('widget')).toBe('count');
    expect(unitKind('')).toBe('count');
  });
});

describe('suggestUnitFromName', () => {
  it('suggests "liter" for oils', () => {
    expect(suggestUnitFromName('Sunflower Oil')).toBe('liter');
    expect(suggestUnitFromName('cooking oil')).toBe('liter');
  });

  it('suggests "kg" for ghee', () => {
    expect(suggestUnitFromName('Desi Ghee')).toBe('kg');
    expect(suggestUnitFromName('ghee 1kg')).toBe('kg');
  });

  it('suggests "kg" for spices', () => {
    for (const name of [
      'Red Chili Powder', 'Turmeric', 'Haldi', 'Cumin Seeds', 'Zeera',
      'Black Pepper', 'Garam Masala', 'Saffron', 'Cardamom', 'Cloves',
      'Coriander', 'Dhania',
    ]) {
      expect(suggestUnitFromName(name)).toBe('kg');
    }
  });

  it('suggests "kg" for staples / proteins', () => {
    for (const name of [
      'Basmati Rice', 'Daal', 'Dal', 'Lentils', 'Chicken', 'Mutton',
      'Beef', 'Flour', 'Atta', 'Sugar', 'Salt', 'Onion', 'Potato',
      'Tomato', 'Pulao', 'Biryani',
    ]) {
      expect(suggestUnitFromName(name)).toBe('kg');
    }
  });

  it('suggests "bottle" for soft drinks', () => {
    expect(suggestUnitFromName('Pepsi 1.5L')).toBe('bottle');
    expect(suggestUnitFromName('Coca Cola')).toBe('bottle');
    expect(suggestUnitFromName('Mineral Water')).toBe('bottle');
  });

  it('suggests "pcs" for eggs, breads, and packaged items', () => {
    expect(suggestUnitFromName('Egg')).toBe('pcs');
    expect(suggestUnitFromName('Roti')).toBe('pcs');
    expect(suggestUnitFromName('Naan')).toBe('pcs');
    expect(suggestUnitFromName('Kebab')).toBe('pcs');
    expect(suggestUnitFromName('Shami')).toBe('pcs');
    expect(suggestUnitFromName('Samosa')).toBe('pcs');
    expect(suggestUnitFromName('Pack of napkins')).toBe('pcs');
    expect(suggestUnitFromName('Box of tea')).toBe('pcs');
    expect(suggestUnitFromName('Can of beans')).toBe('pcs');
  });

  it('defaults unknown items to "pcs"', () => {
    expect(suggestUnitFromName('Mystery Item')).toBe('pcs');
    expect(suggestUnitFromName('')).toBe('pcs');
  });
});

describe('isSoftDrinkName', () => {
  it('returns true for known soda / beverage brands', () => {
    for (const name of [
      'Pepsi', 'Coke', 'Cola', 'Coca-Cola', 'Coca Cola', 'Sprite',
      'Fanta', '7up', '7-up', 'Tango', 'Rubicon', 'Mirinda', 'Marinda',
      'Miranda', 'Mountain Dew', 'Sting', 'Pakola', 'Slice', 'Milo',
      'Nesvita', 'Red Bull', 'Monster', 'Energy Drink', 'Soft Drink',
      'Beverage', 'Mineral Water', 'Drinking Water', 'Water', 'Bottle',
    ]) {
      expect(isSoftDrinkName(name)).toBe(true);
    }
  });

  it('returns false for non-beverages', () => {
    expect(isSoftDrinkName('Basmati Rice')).toBe(false);
    expect(isSoftDrinkName('Chicken')).toBe(false);
    expect(isSoftDrinkName('')).toBe(false);
  });
});

describe('suggestCategoryFromName', () => {
  it('categorizes oils', () => {
    expect(suggestCategoryFromName('Sunflower Oil')).toBe('Oils');
  });

  it('categorizes ghee', () => {
    expect(suggestCategoryFromName('Desi Ghee')).toBe('Dairy / Fats');
  });

  it('categorizes spices', () => {
    expect(suggestCategoryFromName('Red Chili Powder')).toBe('Spices');
    expect(suggestCategoryFromName('Garam Masala')).toBe('Spices');
    expect(suggestCategoryFromName('Haldi')).toBe('Spices');
    expect(suggestCategoryFromName('Dhania')).toBe('Spices');
  });

  it('categorizes drinks', () => {
    expect(suggestCategoryFromName('Pepsi 1.5L')).toBe('Drinks');
  });

  it('categorizes grains', () => {
    expect(suggestCategoryFromName('Basmati Rice')).toBe('Grains');
    expect(suggestCategoryFromName('Atta')).toBe('Grains');
    expect(suggestCategoryFromName('Flour')).toBe('Grains');
  });

  it('categorizes lentils', () => {
    expect(suggestCategoryFromName('Daal')).toBe('Lentils');
    expect(suggestCategoryFromName('Moong Dal')).toBe('Lentils');
    expect(suggestCategoryFromName('Masoor')).toBe('Lentils');
    expect(suggestCategoryFromName('Chana')).toBe('Lentils');
  });

  it('categorizes meat', () => {
    expect(suggestCategoryFromName('Chicken')).toBe('Meat');
    expect(suggestCategoryFromName('Mutton')).toBe('Meat');
    expect(suggestCategoryFromName('Beef')).toBe('Meat');
  });

  it('falls back to General', () => {
    expect(suggestCategoryFromName('Mystery Item')).toBe('General');
    expect(suggestCategoryFromName('')).toBe('General');
  });
});

describe('toStoredQuantity', () => {
  it('returns 0 for zero, NaN, or Infinity input', () => {
    expect(toStoredQuantity(0, 'kg')).toBe(0);
    expect(toStoredQuantity(NaN, 'kg')).toBe(0);
    expect(toStoredQuantity(Infinity, 'kg')).toBe(0);
  });

  it('takes the absolute value of negative input', () => {
    // Math.abs(-5) = 5 > 0, so it does NOT return 0 — it proceeds with 5.
    expect(toStoredQuantity(-5, 'kg')).toBe(5);
    expect(toStoredQuantity(-2, 'kg')).toBe(2);
  });

  it('rounds count quantities to the nearest integer', () => {
    expect(toStoredQuantity(2.4, 'pcs')).toBe(2);
    expect(toStoredQuantity(2.6, 'pcs')).toBe(3);
    expect(toStoredQuantity(5, 'bottle')).toBe(5);
  });

  it('converts liters into ml when stored unit is ml', () => {
    expect(toStoredQuantity(2, 'ml', 'liter')).toBe(2000);
    expect(toStoredQuantity(0.5, 'ml', 'liter')).toBe(500);
  });

  it('converts ml into liters when stored unit is liter', () => {
    expect(toStoredQuantity(1500, 'liter', 'ml')).toBe(1.5);
    expect(toStoredQuantity(250, 'liter', 'ml')).toBe(0.25);
  });

  it('passes ml through unchanged when both are ml', () => {
    expect(toStoredQuantity(750, 'ml', 'ml')).toBe(750);
  });

  it('passes liters through unchanged when both are liter', () => {
    expect(toStoredQuantity(2, 'liter', 'liter')).toBe(2);
  });

  it('assumes entry matches stored unit when entryUnit is omitted', () => {
    expect(toStoredQuantity(1.5, 'liter')).toBe(1.5);
    expect(toStoredQuantity(500, 'ml')).toBe(500);
  });

  it('converts kg into grams when stored unit is g', () => {
    expect(toStoredQuantity(2, 'g', 'kg')).toBe(2000);
    expect(toStoredQuantity(0.25, 'g', 'kg')).toBe(250);
  });

  it('converts grams into kg when stored unit is kg', () => {
    expect(toStoredQuantity(1500, 'kg', 'g')).toBe(1.5);
    expect(toStoredQuantity(250, 'kg', 'g')).toBe(0.25);
  });

  it('passes grams through unchanged when both are g', () => {
    expect(toStoredQuantity(750, 'g', 'g')).toBe(750);
  });

  it('passes kg through unchanged when both are kg', () => {
    expect(toStoredQuantity(2, 'kg', 'kg')).toBe(2);
  });

  it('assumes entry matches stored unit when entryUnit is omitted', () => {
    expect(toStoredQuantity(1.5, 'kg')).toBe(1.5);
    expect(toStoredQuantity(500, 'g')).toBe(500);
  });

  it('rounds gram results to integers', () => {
    expect(toStoredQuantity(0.0005, 'g', 'kg')).toBe(1);
  });

  it('keeps kg results at up to 3 decimal places', () => {
    expect(toStoredQuantity(1, 'kg', 'g')).toBe(0.001);
  });

  it('falls back to kg when the stored unit is unrecognized (no name given)', () => {
    // resolveItemUnit('widget') → 'kg', so kind='weight' and the value is
    // treated as kg → kg, i.e. returned unchanged.
    expect(toStoredQuantity(2.7, 'widget')).toBe(2.7);
  });

  it('falls back to stored-based scaling when entry unit is unrecognised', () => {
    // entry='widget' → resolveItemUnit → 'kg' (fallback), stored='kg' → 2
    // entry='widget' → resolveItemUnit → 'kg' (fallback), stored='liter' →
    //   volume branch, entry !== 'liter'/'ml', stored==='liter' → inMl = 2000 → 2
    expect(toStoredQuantity(2, 'kg', 'widget')).toBe(2);
    expect(toStoredQuantity(2, 'liter', 'widget')).toBe(2);
  });
   it('covers the weight ternary fallback when entry is not kg or g', () => {
    // stored='g' (weight), entry='liter' → the else-else branch runs
    // `stored === 'kg' ? qty * 1000 : qty`, and the falsy side (qty) is taken.
    expect(toStoredQuantity(500, 'g', 'liter')).toBe(500);
  });
});
