import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  normalizeUnitLabel,
  resolveItemUnit,
  suggestCategoryFromName,
  suggestUnitFromName,
  toStoredQuantity,
  unitKind,
} from '../utils/inventory-units';

export type FileInventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  opening_stock: number;
  purchased: number;
  issued: number;
  returned: number;
  damaged: number;
  sold: number;
  current_stock: number;
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  supplier_name: string;
  is_active: boolean;
};

export type FileInventoryTx = {
  id: string;
  inventory_item_id: string;
  tx_type: string;
  quantity: number;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
  /** Snapshot at time of transaction (purchases / issue destination) */
  supplier_name?: string | null;
};

type Store = {
  items: FileInventoryItem[];
  transactions: FileInventoryTx[];
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'inventory-store.json');

function defaultStore(): Store {
  return {
    items: [
      {
        id: 'i1000000-0000-4000-8000-000000000001',
        sku: 'INV-RICE',
        name: 'Basmati Rice',
        category: 'Grains',
        unit: 'kg',
        opening_stock: 100,
        purchased: 50,
        issued: 60,
        returned: 5,
        damaged: 0,
        sold: 0,
        current_stock: 95,
        cost_price: 220,
        selling_price: 0,
        reorder_level: 20,
        supplier_name: 'Lahore Grain Co.',
        is_active: true,
      },
      {
        id: 'i1000000-0000-4000-8000-000000000002',
        sku: 'INV-PEPSI',
        name: 'Pepsi Bottles',
        category: 'Drinks',
        unit: 'bottle',
        opening_stock: 120,
        purchased: 0,
        issued: 0,
        returned: 2,
        damaged: 0,
        sold: 30,
        current_stock: 88,
        cost_price: 55,
        selling_price: 80,
        reorder_level: 24,
        supplier_name: 'Beverage Distributors',
        is_active: true,
      },
      {
        id: 'i1000000-0000-4000-8000-000000000003',
        sku: 'INV-DAAL',
        name: 'Yellow Lentils',
        category: 'Pulses',
        unit: 'kg',
        opening_stock: 50,
        purchased: 20,
        issued: 28,
        returned: 0,
        damaged: 0,
        sold: 0,
        current_stock: 42,
        cost_price: 180,
        selling_price: 0,
        reorder_level: 15,
        supplier_name: 'Punjab Pulses',
        is_active: true,
      },
      {
        id: 'i1000000-0000-4000-8000-000000000004',
        sku: 'INV-CHICKEN',
        name: 'Halal Chicken',
        category: 'Meat',
        unit: 'kg',
        opening_stock: 40,
        purchased: 15,
        issued: 27,
        returned: 0,
        damaged: 0,
        sold: 0,
        current_stock: 28,
        cost_price: 650,
        selling_price: 0,
        reorder_level: 10,
        supplier_name: 'Hall Road Meat',
        is_active: true,
      },
    ],
    transactions: [],
  };
}

function ensureStore(): Store {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Store;
}

function writeStore(store: Store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function applyTx(item: FileInventoryItem, txType: string, quantity: number) {
  const kind = unitKind(item.unit);
  const qty =
    kind === 'count' ? Math.round(Math.abs(quantity)) : Number(Math.abs(quantity).toFixed(3));
  switch (txType) {
    case 'purchase':
    case 'opening':
      item.purchased = Number((item.purchased + qty).toFixed(kind === 'count' ? 0 : 3));
      item.current_stock = Number((item.current_stock + qty).toFixed(kind === 'count' ? 0 : 3));
      break;
    case 'return':
      item.returned = Number((item.returned + qty).toFixed(kind === 'count' ? 0 : 3));
      item.current_stock = Number((item.current_stock + qty).toFixed(kind === 'count' ? 0 : 3));
      break;
    case 'issue':
      item.issued = Number((item.issued + qty).toFixed(kind === 'count' ? 0 : 3));
      item.current_stock = Math.max(
        0,
        Number((item.current_stock - qty).toFixed(kind === 'count' ? 0 : 3))
      );
      break;
    case 'damage':
      item.damaged = Number((item.damaged + qty).toFixed(kind === 'count' ? 0 : 3));
      item.current_stock = Math.max(
        0,
        Number((item.current_stock - qty).toFixed(kind === 'count' ? 0 : 3))
      );
      break;
    case 'sale_deduction':
      item.sold = Number((item.sold + qty).toFixed(kind === 'count' ? 0 : 3));
      item.current_stock = Math.max(
        0,
        Number((item.current_stock - qty).toFixed(kind === 'count' ? 0 : 3))
      );
      break;
    case 'adjustment':
      item.current_stock = Number(
        (item.current_stock + quantity).toFixed(kind === 'count' ? 0 : 3)
      );
      break;
    default:
      item.current_stock = Number(
        (item.current_stock + quantity).toFixed(kind === 'count' ? 0 : 3)
      );
  }
}

export const inventoryFileStore = {
  listItems() {
    return ensureStore().items.filter((i) => i.is_active);
  },

  report() {
    const store = ensureStore();
    let dirty = false;
    const rows = store.items
      .filter((i) => i.is_active)
      .map((i) => {
        const unit = resolveItemUnit(i.unit, i.name);
        const suggestedCategory = suggestCategoryFromName(i.name);
        const needsUnitFix = i.unit !== unit;
        const needsCategoryFix =
          suggestedCategory !== 'General' &&
          (!i.category || i.category === 'General' || i.category.toLowerCase() === 'general');

        // Total purchased = purchase txs only (never mixed with available stock)
        const purchasedTotal = store.transactions
          .filter((t) => t.inventory_item_id === i.id && t.tx_type === 'purchase')
          .reduce((s, t) => s + Number(t.quantity || 0), 0);
        const kind = unitKind(unit);
        const purchased =
          kind === 'count' ? Math.round(purchasedTotal) : Number(purchasedTotal.toFixed(3));

        if (needsUnitFix) {
          i.unit = unit;
          dirty = true;
        }
        if (needsCategoryFix) {
          i.category = suggestedCategory;
          dirty = true;
        }
        if (i.purchased !== purchased) {
          i.purchased = purchased;
          dirty = true;
        }

        return {
          id: i.id,
          sku: i.sku,
          name: i.name,
          category: i.category,
          unit,
          unit_kind: unitKind(unit),
          opening_stock: i.opening_stock,
          purchased,
          issued: i.issued,
          returned: i.returned,
          damaged: i.damaged,
          sold: i.sold,
          current_balance: i.current_stock,
          current_stock: i.current_stock,
          cost_price: i.cost_price,
          selling_price: i.selling_price,
          reorder_level: i.reorder_level,
          supplier_name: i.supplier_name,
          is_low_stock: i.current_stock <= i.reorder_level,
          storage: 'file' as const,
        };
      });
    if (dirty) writeStore(store);
    return rows;
  },

  createItem(input: {
    sku?: string;
    name: string;
    category?: string;
    unit?: string;
    openingStock?: number;
    costPrice?: number;
    sellingPrice?: number;
    reorderLevel?: number;
    supplierName?: string;
  }) {
    const store = ensureStore();
    const name = input.name.trim();
    const unit = resolveItemUnit(input.unit || suggestUnitFromName(name), name);
    const category = input.category || suggestCategoryFromName(name);
    const sku =
      input.sku?.trim() ||
      `INV-${name.replace(/\s+/g, '-').toUpperCase().slice(0, 12)}-${String(store.items.length + 1).padStart(2, '0')}`;
    if (store.items.some((i) => i.sku === sku && i.is_active)) {
      throw new Error('SKU already exists');
    }
    const rawOpening = Number(input.openingStock);
    // Keep first quantity as entered (same unit) — do not drop it
    const opening =
      Number.isFinite(rawOpening) && rawOpening > 0
        ? toStoredQuantity(rawOpening, unit, unit) || rawOpening
        : 0;
    const item: FileInventoryItem = {
      id: randomUUID(),
      sku,
      name,
      category,
      unit,
      opening_stock: opening,
      purchased: 0,
      issued: 0,
      returned: 0,
      damaged: 0,
      sold: 0,
      current_stock: opening,
      cost_price: input.costPrice ?? 0,
      selling_price: input.sellingPrice ?? 0,
      reorder_level: input.reorderLevel ?? (unitKind(unit) === 'count' ? 24 : 10),
      supplier_name: input.supplierName || '',
      is_active: true,
    };
    store.items.push(item);
    if (opening > 0) {
      store.transactions.push({
        id: randomUUID(),
        inventory_item_id: item.id,
        tx_type: 'opening',
        quantity: opening,
        unit_cost: item.cost_price,
        notes: `Opening stock: ${opening} ${unit}`,
        created_at: new Date().toISOString(),
      });
    }
    writeStore(store);
    return item;
  },

  /** Find by name or create catalog item, then return it. */
  ensureNamedItem(input: {
    name: string;
    category: string;
    unit: string;
    costPrice?: number;
  }) {
    const store = ensureStore();
    const name = input.name.trim();
    const existing = store.items.find(
      (i) => i.is_active && i.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      existing.unit = resolveItemUnit(existing.unit || input.unit, existing.name);
      existing.category = input.category || existing.category;
      writeStore(store);
      return existing;
    }
    return this.createItem({
      name,
      category: input.category,
      unit: input.unit,
      openingStock: 0,
      costPrice: input.costPrice ?? 0,
    });
  },

  buyStock(input: {
    inventoryItemId: string;
    quantity: number;
    entryUnit?: string;
    storeUnit?: string;
    unitCost?: number;
    notes?: string;
    supplierName?: string;
  }) {
    const store = ensureStore();
    const item = store.items.find((i) => i.id === input.inventoryItemId && i.is_active);
    if (!item) throw new Error('Inventory item not found');

    if (input.storeUnit) {
      item.unit = resolveItemUnit(input.storeUnit, item.name);
    } else {
      item.unit = resolveItemUnit(item.unit, item.name);
    }
    const qty = toStoredQuantity(input.quantity, item.unit, input.entryUnit || item.unit);
    if (!qty) throw new Error('Quantity must be greater than 0');

    if (input.unitCost != null) item.cost_price = input.unitCost;
    if (input.supplierName) item.supplier_name = input.supplierName;

    applyTx(item, 'purchase', qty);
    const tx: FileInventoryTx = {
      id: randomUUID(),
      inventory_item_id: item.id,
      tx_type: 'purchase',
      quantity: qty,
      unit_cost: input.unitCost ?? item.cost_price,
      notes:
        input.notes ||
        `Stock purchase (+${qty} ${item.unit}${
          input.entryUnit && input.entryUnit !== item.unit
            ? ` from ${input.quantity} ${input.entryUnit}`
            : ''
        })`,
      created_at: new Date().toISOString(),
      supplier_name: input.supplierName || item.supplier_name || null,
    };
    store.transactions.push(tx);
    writeStore(store);
    return { item, transaction: tx, storage: 'file' as const };
  },

  amendStock(input: {
    inventoryItemId: string;
    newBalance: number;
    notes?: string;
  }) {
    const store = ensureStore();
    const item = store.items.find((i) => i.id === input.inventoryItemId && i.is_active);
    if (!item) throw new Error('Inventory item not found');

    // Fix corrupted units like "10kg" → "kg" (chili powder etc.)
    item.unit = resolveItemUnit(item.unit, item.name);

    const kind = unitKind(item.unit);
    let newBalance = Math.max(0, Number(input.newBalance));
    if (!Number.isFinite(newBalance)) throw new Error('Invalid balance');
    newBalance =
      kind === 'count' ? Math.round(newBalance) : Number(newBalance.toFixed(3));

    const previous = item.current_stock;
    const delta = Number((newBalance - previous).toFixed(kind === 'count' ? 0 : 3));
    if (delta === 0) throw new Error('New balance is the same as current balance');

    // Set absolute correct balance only — do not add on top
    item.current_stock = newBalance;
    const tx: FileInventoryTx = {
      id: randomUUID(),
      inventory_item_id: item.id,
      tx_type: 'adjustment',
      quantity: delta,
      unit_cost: item.cost_price,
      notes: `Correct balance: ${newBalance} ${item.unit}${
        input.notes?.trim() ? ` — ${input.notes.trim()}` : ''
      }`,
      created_at: new Date().toISOString(),
    };
    store.transactions.push(tx);
    writeStore(store);
    return {
      item,
      transaction: tx,
      previousBalance: previous,
      newBalance,
      delta,
      storage: 'file' as const,
    };
  },

  deleteItem(inventoryItemId: string) {
    const store = ensureStore();
    const item = store.items.find((i) => i.id === inventoryItemId && i.is_active);
    if (!item) throw new Error('Inventory item not found');
    item.is_active = false;
    store.transactions.push({
      id: randomUUID(),
      inventory_item_id: item.id,
      tx_type: 'adjustment',
      quantity: 0,
      unit_cost: item.cost_price,
      notes: `Deleted item: ${item.name}`,
      created_at: new Date().toISOString(),
    });
    writeStore(store);
    return { id: item.id, name: item.name, sku: item.sku, deleted: true, storage: 'file' as const };
  },

  /** Fix spelling / rename a stock item. */
  renameItem(input: { inventoryItemId: string; name: string; notes?: string }) {
    const store = ensureStore();
    const item = store.items.find((i) => i.id === input.inventoryItemId && i.is_active);
    if (!item) throw new Error('Inventory item not found');
    const newName = input.name.trim();
    if (!newName) throw new Error('Name is required');
    if (newName.toLowerCase() === item.name.toLowerCase() && newName === item.name) {
      throw new Error('New name is the same as the current name');
    }
    const duplicate = store.items.find(
      (i) =>
        i.is_active &&
        i.id !== item.id &&
        i.name.toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) throw new Error(`Another item already uses the name "${newName}"`);

    const previous = item.name;
    item.name = newName;
    // Re-suggest category/unit from corrected spelling when still generic
    const suggested = suggestCategoryFromName(newName);
    if (!item.category || item.category === 'General') {
      item.category = suggested;
    }
    item.unit = resolveItemUnit(item.unit, newName);
    store.transactions.push({
      id: randomUUID(),
      inventory_item_id: item.id,
      tx_type: 'adjustment',
      quantity: 0,
      unit_cost: item.cost_price,
      notes: `Renamed: "${previous}" → "${newName}"${
        input.notes?.trim() ? ` — ${input.notes.trim()}` : ''
      }`,
      created_at: new Date().toISOString(),
    });
    writeStore(store);
    return {
      item,
      previousName: previous,
      newName,
      storage: 'file' as const,
    };
  },

  /** Issue stock to kitchen / prep (same activity log as purchases). */
  issueStock(input: {
    inventoryItemId: string;
    quantity: number;
    entryUnit?: string;
    notes?: string;
  }) {
    const store = ensureStore();
    const item = store.items.find((i) => i.id === input.inventoryItemId && i.is_active);
    if (!item) throw new Error('Inventory item not found');
    item.unit = resolveItemUnit(item.unit, item.name);
    const qty = toStoredQuantity(input.quantity, item.unit, input.entryUnit || item.unit);
    if (!qty) throw new Error('Quantity must be greater than 0');
    if (qty > item.current_stock) {
      throw new Error(`Not enough stock to issue (available ${item.current_stock} ${item.unit})`);
    }
    applyTx(item, 'issue', qty);
    const tx: FileInventoryTx = {
      id: randomUUID(),
      inventory_item_id: item.id,
      tx_type: 'issue',
      quantity: qty,
      unit_cost: item.cost_price,
      notes:
        input.notes?.trim() ||
        `Issued to kitchen (${qty} ${item.unit})`,
      created_at: new Date().toISOString(),
      supplier_name: item.supplier_name || null,
    };
    store.transactions.push(tx);
    writeStore(store);
    return { item, transaction: tx, storage: 'file' as const };
  },

  /** All stock movements for activity filters (buy, amend, kitchen issue, etc.). */
  recentPurchases(limit = 200) {
    const store = ensureStore();
    const types = new Set([
      'purchase',
      'opening',
      'adjustment',
      'issue',
      'return',
      'damage',
      'sale_deduction',
    ]);
    return store.transactions
      .filter((t) => types.has(t.tx_type))
      .slice()
      .reverse()
      .slice(0, limit)
      .map((t) => {
        const item = store.items.find((i) => i.id === t.inventory_item_id);
        const when = t.created_at || new Date().toISOString();
        return {
          ...t,
          sku: item?.sku,
          name: item?.name,
          unit: item?.unit,
          supplier_name: t.supplier_name || item?.supplier_name || null,
          activity_date: when.slice(0, 10),
        };
      });
  },
};
