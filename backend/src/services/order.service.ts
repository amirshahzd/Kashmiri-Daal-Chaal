import { query, pool } from '../config/db';
import { AppError } from '../utils/errors';
import { env } from '../config/env';

export type OrderType = 'eat_in' | 'takeaway' | 'delivery' | 'uber_eats' | 'deliveroo' | 'just_eat';

interface CartItem {
  menuItemId: string;
  quantity: number;
  specialInstructions?: string;
}

function generateOrderNumber(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `KDC-${stamp}-${rand}`;
}

export async function createOrder(input: {
  customerId?: string;
  userId?: string;
  orderType: OrderType;
  items: CartItem[];
  couponCode?: string;
  specialInstructions?: string;
  deliveryAddressId?: string;
  tableNumber?: string;
  tipAmount?: number;
  branchId?: string;
}) {
  if (!input.items?.length) throw new AppError(400, 'EMPTY_CART', 'Cart is empty');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const branchId = input.branchId ?? env.defaultBranchId;

    let subtotal = 0;
    const lines: Array<{
      menuItemId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      specialInstructions?: string;
    }> = [];

    for (const item of input.items) {
      const menuRes = await client.query(
        `SELECT id, name, price, discount_percent, is_available
         FROM menu_items WHERE id = $1`,
        [item.menuItemId]
      );
      const menu = menuRes.rows[0];
      if (!menu || !menu.is_available) {
        throw new AppError(400, 'ITEM_UNAVAILABLE', `Item unavailable: ${item.menuItemId}`);
      }
      const unitPrice = Number(
        (Number(menu.price) * (1 - Number(menu.discount_percent || 0) / 100)).toFixed(2)
      );
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
      subtotal += lineTotal;
      lines.push({
        menuItemId: menu.id,
        name: menu.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
        specialInstructions: item.specialInstructions,
      });
    }

    let discountAmount = 0;
    let couponId: string | null = null;
    if (input.couponCode) {
      const couponRes = await client.query(
        `SELECT * FROM coupons
         WHERE UPPER(code) = UPPER($1) AND is_active = TRUE
           AND starts_at <= NOW() AND ends_at >= NOW()
           AND (usage_limit IS NULL OR used_count < usage_limit)`,
        [input.couponCode]
      );
      const coupon = couponRes.rows[0];
      if (!coupon) throw new AppError(400, 'COUPON_INVALID', 'Coupon is invalid or expired');
      if (subtotal < Number(coupon.min_order_amount)) {
        throw new AppError(400, 'COUPON_MIN', `Minimum order Rs ${coupon.min_order_amount}`);
      }
      discountAmount =
        coupon.discount_type === 'percentage'
          ? Number(((subtotal * Number(coupon.discount_value)) / 100).toFixed(2))
          : Number(coupon.discount_value);
      if (coupon.max_discount) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount));
      }
      couponId = coupon.id;
      await client.query(`UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`, [coupon.id]);
    }

    const deliveryFee =
      input.orderType === 'delivery' ? (subtotal - discountAmount >= 2000 ? 0 : 150) : 0;
    const tipAmount = input.tipAmount ?? 0;
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxAmount = Number((taxable * 0.05).toFixed(2));
    const totalAmount = Number((taxable + taxAmount + deliveryFee + tipAmount).toFixed(2));

    let addressSnapshot = null;
    if (input.deliveryAddressId) {
      const addr = await client.query(`SELECT * FROM customer_addresses WHERE id = $1`, [
        input.deliveryAddressId,
      ]);
      addressSnapshot = addr.rows[0] ?? null;
    }

    const orderNumber = generateOrderNumber();
    const orderRes = await client.query(
      `INSERT INTO orders (
        order_number, branch_id, customer_id, user_id, order_type, status, table_number,
        subtotal, discount_amount, tax_amount, delivery_fee, tip_amount, total_amount,
        coupon_id, special_instructions, delivery_address_id, delivery_address_snapshot, source
      ) VALUES (
        $1,$2,$3,$4,$5,'received',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'web'
      ) RETURNING *`,
      [
        orderNumber,
        branchId,
        input.customerId ?? null,
        input.userId ?? null,
        input.orderType,
        input.tableNumber ?? null,
        subtotal,
        discountAmount,
        taxAmount,
        deliveryFee,
        tipAmount,
        totalAmount,
        couponId,
        input.specialInstructions ?? null,
        input.deliveryAddressId ?? null,
        addressSnapshot ? JSON.stringify(addressSnapshot) : null,
      ]
    );
    const order = orderRes.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price, quantity, line_total, special_instructions)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          order.id,
          line.menuItemId,
          line.name,
          line.unitPrice,
          line.quantity,
          line.lineTotal,
          line.specialInstructions ?? null,
        ]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note)
       VALUES ($1, NULL, 'received', 'Order placed')`,
      [order.id]
    );

    await client.query('COMMIT');
    return getOrderById(order.id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getOrderById(id: string): Promise<Record<string, any>> {
  const orderRes = await query(`SELECT * FROM orders WHERE id = $1 OR order_number = $1`, [id]);
  if (!orderRes.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
  const order = orderRes.rows[0];
  const items = await query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
  const history = await query(
    `SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at`,
    [order.id]
  );
  const payments = await query(`SELECT * FROM payments WHERE order_id = $1`, [order.id]);
  return { ...order, items: items.rows, statusHistory: history.rows, payments: payments.rows };
}

export async function listOrders(filters: {
  branchId?: string;
  status?: string;
  customerId?: string;
  limit?: number;
  offset?: number;
}) {
  const params: unknown[] = [];
  const where: string[] = ['1=1'];
  if (filters.branchId) {
    params.push(filters.branchId);
    where.push(`branch_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    where.push(`customer_id = $${params.length}`);
  }
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  params.push(limit, offset);

  const res = await query(
    `SELECT * FROM orders
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

const STATUS_FLOW = [
  'received',
  'accepted',
  'preparing',
  'cooking',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
] as const;

export async function updateOrderStatus(
  orderId: string,
  toStatus: string,
  userId?: string,
  note?: string
) {
  const order = await getOrderById(orderId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE orders SET status = $2::order_status, updated_at = NOW(),
      completed_at = CASE WHEN $2 IN ('delivered','completed') THEN NOW() ELSE completed_at END,
      cancelled_at = CASE WHEN $2 IN ('cancelled','rejected') THEN NOW() ELSE cancelled_at END
      WHERE id = $1`, [order.id, toStatus]);

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2::order_status, $3::order_status, $4, $5)`,
      [order.id, order.status, toStatus, userId ?? null, note ?? null]
    );

    // Auto stock deduction on completion
    if (toStatus === 'completed' || toStatus === 'delivered') {
      const items = await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
      for (const item of items.rows) {
        if (!item.menu_item_id) continue;
        const ingredients = await client.query(
          `SELECT inventory_item_id, quantity_used FROM menu_item_ingredients WHERE menu_item_id = $1`,
          [item.menu_item_id]
        );
        for (const ing of ingredients.rows) {
          const qty = Number(ing.quantity_used) * Number(item.quantity);
          await client.query(
            `INSERT INTO inventory_transactions
              (inventory_item_id, branch_id, tx_type, quantity, reference_type, reference_id, notes, performed_by)
             VALUES ($1, $2, 'sale_deduction', $3, 'order', $4, 'Auto deduction on sale', $5)`,
            [ing.inventory_item_id, order.branch_id, qty, order.id, userId ?? null]
          );
        }
      }

      if (order.customer_id) {
        const points = Math.floor(Number(order.total_amount));
        await client.query(
          `UPDATE customers SET loyalty_points = loyalty_points + $2, total_orders = total_orders + 1,
           total_spent = total_spent + $3 WHERE id = $1`,
          [order.customer_id, points, order.total_amount]
        );
        await client.query(
          `INSERT INTO loyalty_transactions (customer_id, points, reason, order_id)
           VALUES ($1, $2, 'order_complete', $3)`,
          [order.customer_id, points, order.id]
        );
      }
    }

    await client.query('COMMIT');
    return getOrderById(order.id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function assignDriver(orderId: string, driverId: string, userId?: string) {
  await query(`UPDATE orders SET driver_id = $2 WHERE id = $1`, [orderId, driverId]);
  return updateOrderStatus(orderId, 'out_for_delivery', userId, 'Driver assigned');
}

export { STATUS_FLOW };
