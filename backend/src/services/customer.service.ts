import { pool, query } from '../config/db';
import { authFileStore, type FileCustomer } from './auth-file.store';
import {
  customerOrderStore,
  earnPointsFromTotal,
  loyaltyBenefits,
  loyaltyTier,
  redeemPointsDiscount,
  tierPercentDiscount,
  type FileCustomerOrder,
} from './customer-loyalty';
import { AppError } from '../utils/errors';

async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function ensureCustomerRow(userId: string): FileCustomer {
  const existing = authFileStore.findCustomerByUserId(userId);
  if (existing) return existing;
  const user = authFileStore.findUserById(userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return authFileStore.createCustomer({
    user_id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone,
  });
}

function formatAddress(c: FileCustomer): string {
  return [c.address_line1, c.address_line2, c.city, c.postcode, c.country]
    .filter(Boolean)
    .join(', ');
}

export async function getMyProfile(userId: string, email?: string) {
  if (await dbAvailable()) {
    try {
      const c = await query(`SELECT * FROM customers WHERE user_id = $1`, [userId]);
      if (c.rowCount) {
        const row = c.rows[0];
        const addresses = await query(`SELECT * FROM customer_addresses WHERE customer_id = $1`, [
          row.id,
        ]);
        const points = Number(row.loyalty_points || 0);
        const spent = Number(row.total_spent || 0);
        return {
          ...row,
          addresses: addresses.rows,
          loyalty: loyaltyBenefits(points, spent),
          storage: 'postgres' as const,
        };
      }
    } catch {
      /* file */
    }
  }

  const customer = ensureCustomerRow(userId);
  const user = authFileStore.findUserById(userId);
  return {
    id: customer.id,
    user_id: customer.user_id,
    first_name: customer.first_name || user?.first_name,
    last_name: customer.last_name || user?.last_name,
    email: customer.email || email || user?.email,
    phone: customer.phone || user?.phone,
    date_of_birth: customer.date_of_birth,
    loyalty_points: customer.loyalty_points,
    total_orders: customer.total_orders,
    total_spent: customer.total_spent,
    marketing_opt_in: customer.marketing_opt_in,
    address_line1: customer.address_line1,
    address_line2: customer.address_line2,
    city: customer.city,
    postcode: customer.postcode,
    country: customer.country,
    full_address: formatAddress(customer),
    addresses: customer.address_line1
      ? [
          {
            label: 'Home',
            address_line1: customer.address_line1,
            address_line2: customer.address_line2,
            city: customer.city,
            postcode: customer.postcode,
            country: customer.country,
            is_default: true,
          },
        ]
      : [],
    loyalty: loyaltyBenefits(customer.loyalty_points, Number(customer.total_spent || 0)),
    storage: 'file' as const,
  };
}

export async function updateMyProfile(
  userId: string,
  input: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postcode?: string;
    country?: string;
  }
) {
  if (await dbAvailable()) {
    try {
      const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [userId]);
      if (c.rowCount) {
        await query(
          `UPDATE customers SET
            first_name = COALESCE($2, first_name),
            last_name = COALESCE($3, last_name),
            phone = COALESCE($4, phone),
            updated_at = NOW()
           WHERE id = $1`,
          [c.rows[0].id, input.firstName ?? null, input.lastName ?? null, input.phone ?? null]
        );
        if (input.addressLine1 && input.city) {
          const existing = await query(
            `SELECT id FROM customer_addresses WHERE customer_id = $1 AND is_default = TRUE LIMIT 1`,
            [c.rows[0].id]
          );
          if (existing.rowCount) {
            await query(
              `UPDATE customer_addresses SET
                address_line1 = $2, address_line2 = $3, city = $4, postcode = $5, country = $6, updated_at = NOW()
               WHERE id = $1`,
              [
                existing.rows[0].id,
                input.addressLine1,
                input.addressLine2 ?? null,
                input.city,
                input.postcode ?? '',
                input.country ?? 'Pakistan',
              ]
            );
          } else {
            await query(
              `INSERT INTO customer_addresses
                (customer_id, label, address_line1, address_line2, city, postcode, country, is_default)
               VALUES ($1,'Home',$2,$3,$4,$5,$6,TRUE)`,
              [
                c.rows[0].id,
                input.addressLine1,
                input.addressLine2 ?? null,
                input.city,
                input.postcode ?? '',
                input.country ?? 'Pakistan',
              ]
            );
          }
        }
        return getMyProfile(userId);
      }
    } catch {
      /* file */
    }
  }

  const customer = ensureCustomerRow(userId);
  authFileStore.updateCustomer(customer.id, {
    first_name: input.firstName ?? customer.first_name,
    last_name: input.lastName ?? customer.last_name,
    phone: input.phone ?? customer.phone,
    address_line1: input.addressLine1 ?? customer.address_line1,
    address_line2: input.addressLine2 ?? customer.address_line2,
    city: input.city ?? customer.city,
    postcode: input.postcode ?? customer.postcode,
    country: input.country ?? customer.country,
  });
  if (input.firstName || input.lastName || input.phone) {
    authFileStore.updateUser(userId, {
      ...(input.firstName ? { first_name: input.firstName } : {}),
      ...(input.lastName ? { last_name: input.lastName } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
    });
  }
  return getMyProfile(userId);
}

export async function getMyOrders(userId: string) {
  if (await dbAvailable()) {
    try {
      const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [userId]);
      if (c.rowCount) {
        const orders = await query(
          `SELECT o.id, o.order_number, o.status, o.order_type, o.subtotal, o.discount_amount,
                  o.tax_amount, o.delivery_fee, o.total_amount, o.created_at, o.payment_status
           FROM orders o
           WHERE o.customer_id = $1
           ORDER BY o.created_at DESC
           LIMIT 50`,
          [c.rows[0].id]
        );
        if (orders.rowCount) {
          return {
            orders: orders.rows.map((o) => ({
              id: o.order_number || o.id,
              status: o.status,
              paymentStatus: o.payment_status,
              orderType: o.order_type,
              subtotal: Number(o.subtotal),
              discount: Number(o.discount_amount),
              tax: Number(o.tax_amount),
              deliveryFee: Number(o.delivery_fee),
              total: Number(o.total_amount),
              createdAt: o.created_at,
            })),
            storage: 'postgres' as const,
          };
        }
      }
    } catch {
      /* file */
    }
  }

  return {
    orders: customerOrderStore.listByUser(userId),
    storage: 'file' as const,
  };
}

export type PlaceStorefrontOrderInput = {
  userId: string;
  order: {
    id?: string;
    status: string;
    paymentStatus: string;
    orderType: string;
    subtotal: number;
    discount: number;
    tax: number;
    deliveryFee: number;
    total: number;
    couponCode?: string;
    specialInstructions?: string;
    items: FileCustomerOrder['items'];
    payment: string;
    paymentRef?: string;
    customerName: string;
    customerPhone: string;
    deliveryAddress?: string;
    tableNumber?: string;
    restaurant?: string;
    restaurantAddress?: string;
    restaurantPhone?: string;
  };
  redeemPoints?: number;
  saveProfile?: boolean;
};

export async function placeStorefrontOrder(input: PlaceStorefrontOrderInput) {
  const customer = ensureCustomerRow(input.userId);
  const user = authFileStore.findUserById(input.userId);

  if (input.saveProfile !== false) {
    const nameParts = input.order.customerName.trim().split(/\s+/);
    const first = nameParts[0] || customer.first_name;
    const last = nameParts.slice(1).join(' ') || customer.last_name;
    let line1 = customer.address_line1;
    let city = customer.city;
    let postcode = customer.postcode;
    if (input.order.deliveryAddress) {
      const parts = input.order.deliveryAddress.split(',').map((s) => s.trim()).filter(Boolean);
      line1 = parts[0] || line1;
      if (parts.length >= 2) city = parts[1];
      if (parts.length >= 3) postcode = parts[parts.length - 1];
    }
    authFileStore.updateCustomer(customer.id, {
      first_name: first,
      last_name: last,
      phone: input.order.customerPhone || customer.phone,
      address_line1: line1,
      city: city || 'Lahore',
      postcode: postcode,
      country: customer.country || 'Pakistan',
    });
    authFileStore.updateUser(input.userId, {
      first_name: first,
      last_name: last,
      phone: input.order.customerPhone || user?.phone || null,
    });
  }

  const refreshed = authFileStore.findCustomerById(customer.id) || customer;
  let pointsRedeemed = 0;
  let extraDiscount = 0;
  const code = (input.order.couponCode || '').trim().toUpperCase();

  if (code === 'REDEEM' || code === 'LOYALTY' || code === 'REDEEM100') {
    const want = input.redeemPoints ?? (code === 'REDEEM100' ? 100 : refreshed.loyalty_points);
    pointsRedeemed = redeemPointsDiscount(refreshed.loyalty_points, input.order.subtotal, want);
    extraDiscount = pointsRedeemed;
  } else if (code === 'LOYAL5' || code === 'LOYAL10') {
    const tier = loyaltyTier(refreshed.loyalty_points, Number(refreshed.total_spent || 0));
    const pct = tierPercentDiscount(code === 'LOYAL10' ? 'gold' : 'silver');
    const allowed =
      (code === 'LOYAL10' && tier === 'gold') ||
      (code === 'LOYAL5' && (tier === 'silver' || tier === 'gold'));
    if (allowed) {
      extraDiscount = Math.round(input.order.subtotal * pct);
    }
  }

  // Use checkout-calculated totals (already includes coupons) when no server-side loyalty tweak
  const discount = Math.max(Number(input.order.discount) || 0, extraDiscount);
  const finalTotal =
    pointsRedeemed > 0 || extraDiscount > Number(input.order.discount || 0)
      ? Math.max(
          0,
          Number(input.order.subtotal) -
            discount +
            Math.round(Math.max(0, input.order.subtotal - discount) * 0.05) +
            Number(input.order.deliveryFee || 0)
        )
      : Number(input.order.total);

  const pointsEarned = earnPointsFromTotal(finalTotal);
  const orderId = input.order.id || `KDC-${Date.now().toString().slice(-8)}`;

  const record: FileCustomerOrder = {
    id: orderId,
    user_id: input.userId,
    customer_id: refreshed.id,
    status: input.order.status || 'received',
    paymentStatus: input.order.paymentStatus || 'pending',
    orderType: input.order.orderType,
    subtotal: Number(input.order.subtotal),
    discount,
    tax:
      pointsRedeemed > 0 || extraDiscount > Number(input.order.discount || 0)
        ? Math.round(Math.max(0, input.order.subtotal - discount) * 0.05)
        : Number(input.order.tax),
    deliveryFee: Number(input.order.deliveryFee),
    total: finalTotal,
    couponCode: input.order.couponCode || null,
    loyaltyPointsEarned: pointsEarned,
    loyaltyPointsRedeemed: pointsRedeemed,
    specialInstructions: input.order.specialInstructions || null,
    items: input.order.items,
    createdAt: new Date().toISOString(),
    payment: input.order.payment,
    paymentRef: input.order.paymentRef || null,
    customerName: input.order.customerName,
    customerPhone: input.order.customerPhone,
    deliveryAddress: input.order.deliveryAddress || null,
    tableNumber: input.order.tableNumber || null,
    restaurant: input.order.restaurant,
    restaurantAddress: input.order.restaurantAddress,
    restaurantPhone: input.order.restaurantPhone,
  };

  customerOrderStore.saveOrder(record);
  const updatedCustomer = authFileStore.recordPurchase(
    refreshed.id,
    finalTotal,
    pointsEarned,
    pointsRedeemed
  );

  return {
    order: record,
    customer: updatedCustomer,
    loyalty: loyaltyBenefits(
      updatedCustomer?.loyalty_points || 0,
      Number(updatedCustomer?.total_spent || 0)
    ),
    storage: 'file' as const,
  };
}

export async function listCustomersForAdmin() {
  if (await dbAvailable()) {
    try {
      const rows = await query(
        `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.loyalty_points, c.total_orders, c.total_spent, c.created_at,
                (SELECT ca.address_line1 FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.is_default = TRUE LIMIT 1) AS address_line1,
                (SELECT ca.city FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.is_default = TRUE LIMIT 1) AS city
         FROM customers c ORDER BY c.created_at DESC LIMIT 200`
      );
      if (rows.rowCount) {
        return {
          customers: rows.rows.map((r) => ({
            ...r,
            full_address: [r.address_line1, r.city].filter(Boolean).join(', '),
            loyalty: loyaltyBenefits(Number(r.loyalty_points || 0), Number(r.total_spent || 0)),
          })),
          storage: 'postgres' as const,
        };
      }
    } catch {
      /* file */
    }
  }

  const customers = authFileStore.listCustomers().map((c) => ({
    ...c,
    full_address: formatAddress(c),
    loyalty: loyaltyBenefits(c.loyalty_points, Number(c.total_spent || 0)),
    orders_count: customerOrderStore.listByUser(c.user_id).length,
  }));

  return {
    customers: customers.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    recentOrders: customerOrderStore.listAll(30),
    storage: 'file' as const,
  };
}

/**
 * Save online order contact details into customers DB (file or postgres)
 * for future admin actions — works for guest and signed-in guests by phone/email.
 */
export async function upsertCustomerFromOnlineOrder(input: {
  fullName: string;
  phone: string;
  email?: string;
  address?: string;
  orderTotal?: number;
}) {
  const fullName = (input.fullName || '').trim();
  const phone = (input.phone || '').trim();
  if (!fullName || !phone) {
    throw new AppError(400, 'CUSTOMER_DETAILS_REQUIRED', 'Name and contact number are required');
  }

  const nameParts = fullName.split(/\s+/);
  const first_name = nameParts[0] || fullName;
  const last_name = nameParts.slice(1).join(' ') || '';
  const email =
    (input.email || '').trim().toLowerCase() ||
    `guest.${phone.replace(/\D/g, '')}@order.kashmiridaalchawal.local`;

  let address_line1: string | null = null;
  let city: string | null = 'Lahore';
  let postcode: string | null = null;
  if (input.address?.trim()) {
    const parts = input.address
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    address_line1 = parts[0] || input.address.trim();
    if (parts.length >= 2) city = parts[1];
    if (parts.length >= 3) postcode = parts[parts.length - 1];
  }

  // Postgres path
  if (await dbAvailable()) {
    try {
      const existing = await query(
        `SELECT id FROM customers
         WHERE (email IS NOT NULL AND lower(email) = $1)
            OR (phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') = $2)
         LIMIT 1`,
        [email, phone.replace(/\D/g, '')]
      );
      if (existing.rowCount) {
        const id = existing.rows[0].id;
        await query(
          `UPDATE customers SET
            first_name = $2, last_name = $3, email = COALESCE(NULLIF($4,''), email),
            phone = $5, updated_at = NOW()
           WHERE id = $1`,
          [id, first_name, last_name, email.endsWith('@order.kashmiridaalchawal.local') ? '' : email, phone]
        );
        if (address_line1) {
          const addr = await query(
            `SELECT id FROM customer_addresses WHERE customer_id = $1 AND is_default = TRUE LIMIT 1`,
            [id]
          );
          if (addr.rowCount) {
            await query(
              `UPDATE customer_addresses SET address_line1 = $2, city = $3, postcode = $4, updated_at = NOW() WHERE id = $1`,
              [addr.rows[0].id, address_line1, city, postcode ?? '']
            );
          } else {
            await query(
              `INSERT INTO customer_addresses (customer_id, label, address_line1, city, postcode, country, is_default)
               VALUES ($1,'Home',$2,$3,$4,'Pakistan',TRUE)`,
              [id, address_line1, city, postcode ?? '']
            );
          }
        }
        if (input.orderTotal && input.orderTotal > 0) {
          await query(
            `UPDATE customers SET
              total_orders = COALESCE(total_orders,0) + 1,
              total_spent = COALESCE(total_spent,0) + $2,
              updated_at = NOW()
             WHERE id = $1`,
            [id, input.orderTotal]
          ).catch(() => undefined);
        }
        return { customerId: id, created: false, storage: 'postgres' as const };
      }
    } catch {
      /* file */
    }
  }

  // File store
  let customer =
    authFileStore.findCustomerByPhone(phone) ||
    (input.email ? authFileStore.findCustomerByEmail(input.email) : undefined);

  if (customer) {
    authFileStore.updateCustomer(customer.id, {
      first_name,
      last_name,
      email: input.email?.trim() ? email : customer.email,
      phone,
      address_line1: address_line1 ?? customer.address_line1,
      city: city ?? customer.city,
      postcode: postcode ?? customer.postcode,
      country: customer.country || 'Pakistan',
    });
    if (input.orderTotal && input.orderTotal > 0) {
      authFileStore.recordPurchase(customer.id, input.orderTotal, 0, 0);
    }
    return { customerId: customer.id, created: false, storage: 'file' as const };
  }

  // Create guest-linked customer only (no password login unless they register later)
  let guestUser;
  try {
    guestUser = authFileStore.createUser({
      email,
      password_hash: '!', // not a valid bcrypt — guest cannot password-login
      first_name,
      last_name,
      phone,
      roles: ['customer'],
    });
  } catch {
    const existingUser = authFileStore.findUserByEmail(email);
    if (!existingUser) throw new AppError(500, 'CUSTOMER_CREATE_FAILED', 'Could not save customer');
    guestUser = existingUser;
    const existingCust = authFileStore.findCustomerByUserId(existingUser.id);
    if (existingCust) {
      authFileStore.updateCustomer(existingCust.id, {
        first_name,
        last_name,
        phone,
        address_line1: address_line1 ?? existingCust.address_line1,
        city: city ?? existingCust.city,
        postcode: postcode ?? existingCust.postcode,
      });
      if (input.orderTotal && input.orderTotal > 0) {
        authFileStore.recordPurchase(existingCust.id, input.orderTotal, 0, 0);
      }
      return { customerId: existingCust.id, created: false, storage: 'file' as const };
    }
  }

  customer = authFileStore.createCustomer({
    user_id: guestUser.id,
    first_name,
    last_name,
    email,
    phone,
    address_line1,
    city,
    postcode,
    country: 'Pakistan',
  });

  if (input.orderTotal && input.orderTotal > 0) {
    authFileStore.recordPurchase(customer.id, input.orderTotal, 0, 0);
  }

  return { customerId: customer.id, created: true, storage: 'file' as const };
}
