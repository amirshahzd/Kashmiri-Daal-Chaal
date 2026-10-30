import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultTabForRole,
  generateDeliveryBarcode,
  isAdminRole,
  markDeliveredByBarcode,
  normalizeStaffRole,
  tabsAllowedForRole,
  writeOpsOrders,
} from './order-workflow';

describe('order workflow roles', () => {
  it('treats owner as admin and limits other stations', () => {
    expect(normalizeStaffRole('owner')).toBe('admin');
    expect(isAdminRole('admin')).toBe(true);
    expect(tabsAllowedForRole('kitchen')).toContain('kitchen-station');
    expect(tabsAllowedForRole('employee')).toEqual(['overview']);
    expect(defaultTabForRole('manager')).toBe('manager-station');
    expect(defaultTabForRole('cashier')).toBe('overview');
  });

  it('builds a KDC barcode from the order id', () => {
    const code = generateDeliveryBarcode('order-abc12345');
    expect(code.startsWith('KDC')).toBe(true);
    expect(code).toMatch(/^KDC[A-Z0-9]+$/);
  });
});

describe('barcode delivery', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rejects an unknown barcode and delivers a ready order', () => {
    expect(markDeliveredByBarcode('MISSING').ok).toBe(false);
    writeOpsOrders([
      {
        id: 'ord-1',
        status: 'ready',
        total: 500,
        deliveryBarcode: 'KDCREADY01',
      },
    ]);
    const result = markDeliveredByBarcode('kdcready01', 'driver-1');
    expect(result.ok).toBe(true);
    expect(result.order?.status).toBe('delivered');
    expect(markDeliveredByBarcode('KDCREADY01').message).toMatch(/already/i);
  });
});
