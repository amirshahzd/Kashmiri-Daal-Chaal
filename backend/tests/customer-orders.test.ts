import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { customerOrderStore, type FileCustomerOrder } from '../src/services/customer-loyalty';

const storePath = path.resolve(process.cwd(), 'data', 'customer-orders.json');

function order(partial: Partial<FileCustomerOrder> & Pick<FileCustomerOrder, 'id' | 'user_id' | 'createdAt'>): FileCustomerOrder {
  return {
    customer_id: 'cust-1',
    status: 'placed',
    paymentStatus: 'pending',
    orderType: 'takeaway',
    subtotal: 1000,
    discount: 0,
    tax: 0,
    deliveryFee: 0,
    total: 1000,
    loyaltyPointsEarned: 10,
    loyaltyPointsRedeemed: 0,
    items: [{ name: 'Daal', quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
    payment: 'cash',
    customerName: 'Amina',
    customerPhone: '03001234567',
    ...partial,
  };
}

describe('customer order store', () => {
  beforeEach(() => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({ orders: [] }));
  });

  it('saves, updates, and reads orders by user and id', () => {
    const first = order({ id: 'o1', user_id: 'u1', createdAt: '2026-01-01T00:00:00.000Z' });
    const second = order({ id: 'o2', user_id: 'u1', createdAt: '2026-02-01T00:00:00.000Z' });
    const other = order({ id: 'o3', user_id: 'u2', createdAt: '2026-03-01T00:00:00.000Z' });

    customerOrderStore.saveOrder(first);
    customerOrderStore.saveOrder(second);
    customerOrderStore.saveOrder(other);
    customerOrderStore.saveOrder({ ...first, status: 'completed' });

    expect(customerOrderStore.getById('o1')?.status).toBe('completed');
    expect(customerOrderStore.listByUser('u1').map((row) => row.id)).toEqual(['o2', 'o1']);
    expect(customerOrderStore.listAll(2).map((row) => row.id)).toEqual(['o3', 'o2']);
  });

  it('recovers from a corrupt orders file', () => {
    fs.writeFileSync(storePath, 'nope');
    expect(customerOrderStore.listAll()).toEqual([]);
  });
});
