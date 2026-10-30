import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { inventoryFileStore } from '../src/services/inventory-file.store';

const storePath = path.resolve(process.cwd(), 'data', 'inventory-store.json');

describe('inventory file store', () => {
  beforeEach(() => {
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
  });

  it('creates an item, buys stock, and amends the balance', () => {
    const item = inventoryFileStore.createItem({
      name: 'Basmati Rice',
      unit: 'kg',
      openingStock: 2,
      costPrice: 200,
    });
    expect(item.current_stock).toBe(2);
    const bought = inventoryFileStore.buyStock({
      inventoryItemId: item.id,
      quantity: 3,
      entryUnit: 'kg',
      unitCost: 210,
    });
    expect(bought.item.current_stock).toBe(5);
    const amended = inventoryFileStore.amendStock({ inventoryItemId: item.id, newBalance: 4, notes: 'count' });
    expect(amended.newBalance).toBe(4);
    expect(amended.delta).toBe(-1);
  });

  it('rejects a missing item, a zero quantity, and an unchanged balance', () => {
    expect(() => inventoryFileStore.buyStock({ inventoryItemId: 'missing', quantity: 1 })).toThrow(
      'Inventory item not found'
    );
    const item = inventoryFileStore.createItem({ name: 'Eggs', unit: 'pcs', openingStock: 12 });
    expect(() => inventoryFileStore.buyStock({ inventoryItemId: item.id, quantity: 0 })).toThrow(
      'Quantity must be greater than 0'
    );
    expect(() => inventoryFileStore.amendStock({ inventoryItemId: item.id, newBalance: item.current_stock })).toThrow(
      'same as current balance'
    );
  });

  it('renames and deletes an item so it drops off the active list', () => {
    const item = inventoryFileStore.createItem({ name: 'Chili Powder', unit: 'kg' });
    const renamed = inventoryFileStore.renameItem({ inventoryItemId: item.id, name: 'Chilli Powder' });
    expect(renamed.item.name).toBe('Chilli Powder');
    expect(inventoryFileStore.deleteItem(item.id).deleted).toBe(true);
    expect(inventoryFileStore.listItems().some((row) => row.id === item.id)).toBe(false);
  });
});
