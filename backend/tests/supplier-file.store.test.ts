import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { supplierFileStore } from '../src/services/supplier-file.store';

const storePath = path.resolve(process.cwd(), 'data', 'suppliers-store.json');

function resetStore() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, '[]');
}

describe('supplier file store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('lists an empty store', () => {
    expect(supplierFileStore.list()).toEqual([]);
  });

  it('creates a supplier and lists it by name', () => {
    const created = supplierFileStore.create({
      name: '  Spice House  ',
      contactName: ' Ali ',
      email: ' Buyer@Spice.test ',
      phone: ' 03001234567 ',
      city: ' Lahore ',
      postcode: ' 54000 ',
      notes: ' weekly ',
    });

    expect(created.name).toBe('Spice House');
    expect(created.email).toBe('buyer@spice.test');
    expect(created.phone).toBe('03001234567');
    expect(supplierFileStore.list().map((row) => row.id)).toEqual([created.id]);
  });

  it('deletes a supplier and rejects an unknown id', () => {
    const created = supplierFileStore.create({ name: 'Mill' });
    expect(supplierFileStore.delete(created.id).id).toBe(created.id);
    expect(supplierFileStore.list()).toEqual([]);
    expect(() => supplierFileStore.delete(created.id)).toThrow('SUPPLIER_NOT_FOUND');
  });

  it('treats a corrupt file as empty', () => {
    fs.writeFileSync(storePath, '{not json');
    expect(supplierFileStore.list()).toEqual([]);
  });
});
