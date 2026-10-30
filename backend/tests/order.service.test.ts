import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockConnect, mockClient } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  return {
    mockQuery: vi.fn(),
    mockConnect: vi.fn().mockResolvedValue(mockClient),
    mockClient,
  };
});

vi.mock('../src/config/db', () => ({
  query: mockQuery,
  pool: {
    connect: mockConnect,
  },
}));

vi.mock('../src/config/env', () => ({
  env: {
    defaultBranchId: 'branch-1',
  },
}));

import {
  createOrder,
  getOrderById,
  listOrders,
  updateOrderStatus,
  assignDriver,
  STATUS_FLOW,
} from '../src/services/order.service';

describe('order service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  describe('STATUS_FLOW', () => {
    it('contains the expected order status sequence', () => {
      expect(STATUS_FLOW).toEqual([
        'received',
        'accepted',
        'preparing',
        'cooking',
        'ready',
        'out_for_delivery',
        'delivered',
        'completed',
      ]);
    });
  });

  describe('createOrder', () => {
    it('rejects an empty cart before opening a database connection', async () => {
      await expect(
        createOrder({
          orderType: 'eat_in',
          items: [],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'EMPTY_CART',
        message: 'Cart is empty',
      });

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('rejects an unavailable menu item and rolls back', async () => {
      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            name: 'Daal Chawal',
            price: 8,
            discount_percent: 0,
            is_available: false,
          },
        ],
        rowCount: 1,
      });

      await expect(
        createOrder({
          orderType: 'takeaway',
          items: [{ menuItemId: 'item-1', quantity: 1 }],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'ITEM_UNAVAILABLE',
      });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('creates an order with discounted item pricing, tax and tip', async () => {
      const createdOrder = {
        id: 'order-1',
        order_number: 'KDC-20260929-1234',
        branch_id: 'branch-1',
        order_type: 'eat_in',
        status: 'received',
        subtotal: 18,
        discount_amount: 0,
        tax_amount: 0.9,
        delivery_fee: 0,
        tip_amount: 2,
        total_amount: 20.9,
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-1',
              name: 'Chicken Pulao',
              price: '10.00',
              discount_percent: '10',
              is_available: true,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-2',
              name: 'Daal Chawal',
              price: '8.00',
              discount_percent: '0',
              is_available: true,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [createdOrder],
          rowCount: 1,
        })
        .mockResolvedValueOnce(undefined) // order item 1
        .mockResolvedValueOnce(undefined) // order item 2
        .mockResolvedValueOnce(undefined) // status history
        .mockResolvedValueOnce(undefined); // COMMIT

      mockQuery.mockResolvedValueOnce({
        rows: [createdOrder],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await createOrder({
        customerId: 'customer-1',
        orderType: 'eat_in',
        tableNumber: 'T5',
        tipAmount: 2,
        items: [
          { menuItemId: 'item-1', quantity: 2 },
          {
            menuItemId: 'item-2',
            quantity: 1,
            specialInstructions: 'Less spicy',
          },
        ],
      });

      expect(result).toEqual({
        ...createdOrder,
        items: [],
        statusHistory: [],
        payments: [],
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

      const orderInsert = mockClient.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO orders'),
      );

      expect(orderInsert).toBeTruthy();

      const params = orderInsert[1];
      expect(params[1]).toBe('branch-1');
      expect(params[2]).toBe('customer-1');
      expect(params[4]).toBe('eat_in');
      expect(params[5]).toBe('T5');
      expect(params[6]).toBe(26);
      expect(params[7]).toBe(0);
      expect(params[8]).toBe(1.3);
      expect(params[9]).toBe(0);
      expect(params[10]).toBe(2);
      expect(params[11]).toBe(29.3);
    });

    it('applies a percentage coupon and free delivery over the threshold', async () => {
      const createdOrder = {
        id: 'order-2',
        branch_id: 'branch-1',
        order_type: 'delivery',
        status: 'received',
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-1',
              name: 'Large Order',
              price: '2300',
              discount_percent: '0',
              is_available: true,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'coupon-1',
              discount_type: 'percentage',
              discount_value: '10',
              min_order_amount: '1000',
              max_discount: null,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce(undefined) // coupon usage update
        .mockResolvedValueOnce({
          rows: [createdOrder],
          rowCount: 1,
        })
        .mockResolvedValueOnce(undefined) // order item
        .mockResolvedValueOnce(undefined) // status history
        .mockResolvedValueOnce(undefined); // COMMIT

            mockQuery
        .mockResolvedValueOnce({ rows: [createdOrder], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await createOrder({
        orderType: 'delivery',
        couponCode: 'SAVE10',
        items: [{ menuItemId: 'item-1', quantity: 1 }],
      });

      const orderInsert = mockClient.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO orders'),
      );

      expect(orderInsert).toBeTruthy();

      const params = orderInsert[1];
      expect(params[6]).toBe(2300);
expect(params[7]).toBe(230);
expect(params[9]).toBe(0);
expect(params[11]).toBe(2173.5);  
    });

    it('rejects an invalid coupon', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-1',
              name: 'Daal Chawal',
              price: 100,
              discount_percent: 0,
              is_available: true,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        });

      await expect(
        createOrder({
          orderType: 'eat_in',
          couponCode: 'BADCODE',
          items: [{ menuItemId: 'item-1', quantity: 1 }],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'COUPON_INVALID',
      });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects a coupon when the minimum order amount is not met', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-1',
              name: 'Daal Chawal',
              price: 100,
              discount_percent: 0,
              is_available: true,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'coupon-1',
              discount_type: 'percentage',
              discount_value: 10,
              min_order_amount: 500,
            },
          ],
          rowCount: 1,
        });

      await expect(
        createOrder({
          orderType: 'eat_in',
          couponCode: 'SAVE10',
          items: [{ menuItemId: 'item-1', quantity: 1 }],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'COUPON_MIN',
      });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getOrderById', () => {
    it('returns an order with items, status history and payments', async () => {
      const order = {
        id: 'order-1',
        order_number: 'KDC-20260929-1234',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [order], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: 'line-1', quantity: 2 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ to_status: 'received' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ amount: 20 }],
          rowCount: 1,
        });

      const result = await getOrderById('order-1');

      expect(result).toEqual({
        ...order,
        items: [{ id: 'line-1', quantity: 2 }],
        statusHistory: [{ to_status: 'received' }],
        payments: [{ amount: 20 }],
      });
    });

    it('throws when the order does not exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      await expect(getOrderById('missing-order')).rejects.toMatchObject({
        statusCode: 404,
        code: 'ORDER_NOT_FOUND',
      });
    });
  });

  describe('listOrders', () => {
    it('lists orders using filters and pagination', async () => {
      const rows = [{ id: 'order-1' }];
      mockQuery.mockResolvedValueOnce({
        rows,
        rowCount: rows.length,
      });

      const result = await listOrders({
        branchId: 'branch-2',
        status: 'received',
        customerId: 'customer-1',
        limit: 10,
        offset: 20,
      });

      expect(result).toEqual(rows);

      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('branch_id = $1');
      expect(sql).toContain('status = $2');
      expect(sql).toContain('customer_id = $3');
      expect(sql).toContain('LIMIT $4 OFFSET $5');
      expect(params).toEqual(['branch-2', 'received', 'customer-1', 10, 20]);
    });

    it('uses default pagination when no filters are supplied', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      await listOrders({});

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([50, 0]);
    });
  });

  describe('updateOrderStatus', () => {
    it('updates status and commits for a normal status transition', async () => {
      const order = {
        id: 'order-1',
        status: 'received',
        branch_id: 'branch-1',
        customer_id: null,
      };

      mockQuery
        // Initial getOrderById(): order + items + history + payments
        .mockResolvedValueOnce({ rows: [order], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // Final getOrderById() after update
        .mockResolvedValueOnce({ rows: [order], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined) // history
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await updateOrderStatus(
        'order-1',
        'accepted',
        'user-1',
        'Accepted by staff',
      );

      expect(result).toEqual({
        ...order,
        items: [],
        statusHistory: [],
        payments: [],
      });

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('deducts inventory and awards loyalty points when completed', async () => {
      const order = {
        id: 'order-2',
        status: 'ready',
        branch_id: 'branch-1',
        customer_id: 'customer-1',
        total_amount: '1250.50',
      };

     mockQuery
        // 1st getOrderById() — before the update
        .mockResolvedValueOnce({ rows: [order], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 2nd getOrderById() — after COMMIT
        .mockResolvedValueOnce({ rows: [{ ...order, status: 'completed' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // UPDATE order
        .mockResolvedValueOnce(undefined) // status history
        .mockResolvedValueOnce({
          rows: [
            {
              menu_item_id: 'menu-1',
              quantity: 2,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              inventory_item_id: 'inv-1',
              quantity_used: 0.5,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce(undefined) // inventory transaction
        .mockResolvedValueOnce(undefined) // customer update
        .mockResolvedValueOnce(undefined) // loyalty transaction
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await updateOrderStatus(
        'order-2',
        'completed',
        'user-1',
      );

      expect(result).toEqual({
        ...order,
        status: 'completed',   
        items: [],
        statusHistory: [],
        payments: [],
      });

      const inventoryInsert = mockClient.query.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO inventory_transactions'),
      );

      expect(inventoryInsert).toBeTruthy();
      expect(inventoryInsert[1]).toEqual([
        'inv-1',
        'branch-1',
        1,
        'order-2',
        'user-1',
      ]);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers SET loyalty_points'),
        ['customer-1', 1250, '1250.50'],
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO loyalty_transactions'),
        ['customer-1', 1250, 'order-2'],
      );
    });
  });

  describe('assignDriver', () => {
    it('assigns the driver and moves the order to out_for_delivery', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // driver assignment
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-3',
              status: 'ready',
              branch_id: 'branch-1',
              customer_id: null,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-3',
              status: 'out_for_delivery',
              branch_id: 'branch-1',
              customer_id: null,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // UPDATE status
        .mockResolvedValueOnce(undefined) // history
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await assignDriver('order-3', 'driver-1', 'user-1');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE orders SET driver_id = $2 WHERE id = $1',
        ['order-3', 'driver-1'],
      );

      expect(result).toEqual({
        id: 'order-3',
        status: 'out_for_delivery', 
        branch_id: 'branch-1',
        customer_id: null,
        items: [],

        statusHistory: [],
        payments: [],
      });
    });
  });
});



