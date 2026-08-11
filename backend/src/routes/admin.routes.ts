import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validate } from '../middleware';
import * as paymentService from '../services/payment.service';
import * as inventoryService from '../services/inventory.service';
import * as dashboardService from '../services/dashboard.service';
import * as hrService from '../services/hr.service';
import { ok, created, AppError } from '../utils/errors';
import { AuthedRequest } from '../types';
import { query } from '../config/db';
import { env } from '../config/env';
import { param } from '../utils/params';

const payments = Router();
const inventory = Router();
const dashboard = Router();
const hr = Router();
const customers = Router();
const suppliers = Router();
const reports = Router();
const reviews = Router();
const branch = Router();

// ---- Payments ----
payments.post(
  '/intent',
  authenticate,
  validate(z.object({ orderId: z.string().uuid(), method: z.string() })),
  asyncHandler(async (req, res) => {
    return created(res, await paymentService.createPaymentIntent(req.body.orderId, req.body.method));
  })
);

payments.post(
  '/:id/confirm',
  authenticate,
  asyncHandler(async (req, res) => {
    return ok(res, await paymentService.confirmPayment(param(req.params.id), req.body.providerPayload));
  })
);

payments.post(
  '/:id/refund',
  authenticate,
  requirePermission('orders.refund'),
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, await paymentService.refundPayment(param(req.params.id), req.body.amount, req.user?.id));
  })
);

// ---- Inventory ----
/** Admin UI is demo-login; allow stock APIs without JWT in non-prod. */
function inventoryAccess(req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  if (!env.isProd) return next();
  return authenticate(req, res, next);
}

inventory.get(
  '/',
  inventoryAccess,
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(
      res,
      await inventoryService.listInventory(
        (req.query.branchId as string) || req.user?.branchId || env.defaultBranchId,
        req.query.category as string | undefined
      )
    );
  })
);

inventory.get(
  '/summary',
  inventoryAccess,
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, await inventoryService.inventorySummary(req.user?.branchId ?? env.defaultBranchId));
  })
);

inventory.get(
  '/report',
  inventoryAccess,
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, await inventoryService.inventoryReport(req.user?.branchId ?? env.defaultBranchId));
  })
);

inventory.get(
  '/purchases',
  inventoryAccess,
  asyncHandler(async (_req, res) => {
    return ok(res, await inventoryService.recentPurchases(200));
  })
);

inventory.post(
  '/items',
  inventoryAccess,
  validate(
    z.object({
      sku: z.string().optional(),
      name: z.string().min(1),
      category: z.string().optional(),
      unit: z.string().optional(),
      openingStock: z.number().min(0).optional(),
      costPrice: z.number().min(0).optional(),
      sellingPrice: z.number().min(0).optional(),
      reorderLevel: z.number().min(0).optional(),
      supplierName: z.string().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return created(
      res,
      await inventoryService.createInventoryItem({
        ...req.body,
        branchId: req.user?.branchId,
      })
    );
  })
);

inventory.post(
  '/buy',
  inventoryAccess,
  validate(
    z.object({
      inventoryItemId: z.string().min(1),
      quantity: z.number().positive(),
      entryUnit: z.string().optional(),
      storeUnit: z.string().optional(),
      unitCost: z.number().min(0).optional(),
      notes: z.string().optional(),
      supplierName: z.string().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return created(
      res,
      await inventoryService.buyStock({
        ...req.body,
        performedBy: req.user?.id,
        branchId: req.user?.branchId,
      })
    );
  })
);

inventory.post(
  '/buy-named',
  inventoryAccess,
  validate(
    z.object({
      name: z.string().min(1),
      category: z.string().min(1),
      unit: z.string().min(1),
      quantity: z.number().positive(),
      entryUnit: z.string().optional(),
      unitCost: z.number().min(0).optional(),
      notes: z.string().optional(),
      supplierName: z.string().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return created(
      res,
      await inventoryService.buyNamedStock({
        ...req.body,
        performedBy: req.user?.id,
        branchId: req.user?.branchId,
      })
    );
  })
);

inventory.post(
  '/amend',
  inventoryAccess,
  validate(
    z.object({
      inventoryItemId: z.string().min(1),
      newBalance: z.number().min(0),
      notes: z.string().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(
      res,
      await inventoryService.amendStock({
        ...req.body,
        performedBy: req.user?.id,
        branchId: req.user?.branchId,
      })
    );
  })
);

inventory.delete(
  '/items/:id',
  inventoryAccess,
  asyncHandler(async (req, res) => {
    return ok(res, await inventoryService.deleteInventoryItem(param(req.params.id)));
  })
);

inventory.patch(
  '/items/:id',
  inventoryAccess,
  validate(
    z.object({
      name: z.string().min(1),
      notes: z.string().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    return ok(
      res,
      await inventoryService.renameInventoryItem({
        inventoryItemId: param(req.params.id),
        name: req.body.name,
        notes: req.body.notes,
      })
    );
  })
);

inventory.get(
  '/:id',
  inventoryAccess,
  asyncHandler(async (req, res) => {
    return ok(res, await inventoryService.getInventoryItem(param(req.params.id)));
  })
);

inventory.post(
  '/transactions',
  inventoryAccess,
  validate(
    z.object({
      inventoryItemId: z.string().min(1),
      txType: z.enum(['opening', 'purchase', 'issue', 'return', 'damage', 'adjustment', 'sale_deduction']),
      quantity: z.number(),
      unitCost: z.number().optional(),
      notes: z.string().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return created(
      res,
      await inventoryService.recordTransaction({ ...req.body, performedBy: req.user?.id })
    );
  })
);

// ---- Dashboard ----
dashboard.get(
  '/',
  authenticate,
  requirePermission('dashboard.view'),
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, await dashboardService.getDashboardStats(req.user?.branchId));
  })
);

// ---- HR ----
/** Admin UI is demo-login; allow register APIs without JWT in non-prod. */
function hrRegisterAccess(req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  if (!env.isProd) return next();
  return authenticate(req, res, next);
}

hr.get(
  '/employees',
  hrRegisterAccess,
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, await hrService.listEmployees(req.user?.branchId ?? env.defaultBranchId));
  })
);

hr.post(
  '/employees',
  hrRegisterAccess,
  validate(
    z.object({
      employeeCode: z.string().optional(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      address: z.string().optional(),
      photoUrl: z.string().url().optional().or(z.literal('')).optional(),
      roleTitle: z.string().optional(),
      departmentName: z.string().optional(),
      hourlyRate: z.number().positive().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return created(
      res,
      await hrService.createEmployee({
        ...req.body,
        photoUrl: req.body.photoUrl || undefined,
        branchId: req.user?.branchId,
      })
    );
  })
);

hr.delete(
  '/employees/:id',
  hrRegisterAccess,
  asyncHandler(async (req, res) => {
    return ok(res, await hrService.deleteEmployee(param(req.params.id)));
  })
);

hr.patch(
  '/employees/:id',
  hrRegisterAccess,
  validate(
    z.object({
      employeeCode: z.string().min(1).optional(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      address: z.string().optional(),
      photoUrl: z.string().url().optional().or(z.literal('')).optional(),
      roleTitle: z.string().optional(),
      departmentName: z.string().optional(),
      hourlyRate: z.number().positive().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(
      res,
      await hrService.updateEmployee(param(req.params.id), {
        ...req.body,
        photoUrl: req.body.photoUrl === '' ? '' : req.body.photoUrl,
        branchId: req.user?.branchId,
      })
    );
  })
);

hr.get(
  '/attendance/week',
  hrRegisterAccess,
  asyncHandler(async (req: AuthedRequest, res) => {
    const weekStart = String(req.query.weekStart || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'weekStart must be YYYY-MM-DD (Monday)');
    }
    return ok(res, await hrService.getWeeklyRegister(weekStart, req.user?.branchId ?? env.defaultBranchId));
  })
);

hr.post(
  '/attendance/week',
  hrRegisterAccess,
  validate(
    z.object({
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      entries: z.array(
        z.object({
          employeeId: z.string().min(1),
          workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          mark: z.enum(['P', 'A', '']),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
        })
      ),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(
      res,
      await hrService.saveWeeklyRegister({
        weekStart: req.body.weekStart,
        entries: req.body.entries,
        branchId: req.user?.branchId,
        approvedBy: req.user?.id,
      })
    );
  })
);

hr.post(
  '/attendance/clock-in',
  authenticate,
  validate(z.object({ employeeId: z.string().uuid() })),
  asyncHandler(async (req: AuthedRequest, res) => {
    return created(res, await hrService.clockIn(req.body.employeeId, req.user?.branchId));
  })
);

hr.post(
  '/attendance/clock-out',
  authenticate,
  validate(z.object({ employeeId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    return ok(res, await hrService.clockOut(req.body.employeeId));
  })
);

hr.get(
  '/payroll/preview',
  authenticate,
  requirePermission('payroll.manage'),
  asyncHandler(async (req, res) => {
    return ok(
      res,
      await hrService.calculateWeeklyPayroll(req.query.employeeId as string, req.query.weekStart as string)
    );
  })
);

hr.post(
  '/payroll/generate',
  authenticate,
  requirePermission('payroll.manage'),
  validate(
    z.object({
      weekStart: z.string(),
      weekEnd: z.string(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    return created(
      res,
      await hrService.generatePayslip(
        req.user?.branchId ?? env.defaultBranchId,
        req.body.weekStart,
        req.body.weekEnd
      )
    );
  })
);

// ---- Customers ----
customers.get(
  '/',
  asyncHandler(async (_req, res) => {
    const customerService = await import('../services/customer.service');
    return ok(res, await customerService.listCustomersForAdmin());
  })
);

customers.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const customerService = await import('../services/customer.service');
    return ok(res, await customerService.getMyProfile(req.user!.id, req.user!.email));
  })
);

customers.patch(
  '/me',
  authenticate,
  validate(
    z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      phone: z.string().max(30).optional(),
      addressLine1: z.string().max(255).optional(),
      addressLine2: z.string().max(255).optional(),
      city: z.string().max(100).optional(),
      postcode: z.string().max(20).optional(),
      country: z.string().max(100).optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const customerService = await import('../services/customer.service');
    return ok(res, await customerService.updateMyProfile(req.user!.id, req.body));
  })
);

customers.get(
  '/me/orders',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const customerService = await import('../services/customer.service');
    return ok(res, await customerService.getMyOrders(req.user!.id));
  })
);

customers.post(
  '/me/orders',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const customerService = await import('../services/customer.service');
    return created(
      res,
      await customerService.placeStorefrontOrder({
        userId: req.user!.id,
        order: req.body.order,
        redeemPoints: req.body.redeemPoints,
        saveProfile: req.body.saveProfile !== false,
      })
    );
  })
);

/** Save contact details from any online order into customers database (guest or signed-in). */
customers.post(
  '/from-order',
  validate(
    z.object({
      fullName: z.string().min(1).max(200),
      phone: z.string().min(7).max(30),
      email: z.string().email().optional().or(z.literal('')),
      address: z.string().max(500).optional().or(z.literal('')),
      orderTotal: z.number().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const customerService = await import('../services/customer.service');
    return created(
      res,
      await customerService.upsertCustomerFromOnlineOrder({
        fullName: req.body.fullName,
        phone: req.body.phone,
        email: req.body.email || undefined,
        address: req.body.address || undefined,
        orderTotal: req.body.orderTotal,
      })
    );
  })
);

customers.post(
  '/me/addresses',
  authenticate,
  validate(
    z.object({
      label: z.string().default('Home'),
      addressLine1: z.string(),
      addressLine2: z.string().optional(),
      city: z.string(),
      postcode: z.string(),
      isDefault: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const customerService = await import('../services/customer.service');
    const profile = await customerService.updateMyProfile(req.user!.id, {
      addressLine1: req.body.addressLine1,
      addressLine2: req.body.addressLine2,
      city: req.body.city,
      postcode: req.body.postcode,
    });
    return created(res, profile);
  })
);

customers.post(
  '/me/favourites/:menuItemId',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    try {
      const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user!.id]);
      if (c.rowCount) {
        await query(
          `INSERT INTO customer_favourites (customer_id, menu_item_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [c.rows[0].id, req.params.menuItemId]
        );
      }
    } catch {
      /* offline ok */
    }
    return ok(res, { favourited: true });
  })
);

// ---- Suppliers ----
suppliers.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      if (await (await import('../config/db')).pool.query('SELECT 1').then(() => true).catch(() => false)) {
        try {
          const rows = await query(`SELECT * FROM suppliers ORDER BY name`);
          if (rows.rowCount) return ok(res, { suppliers: rows.rows, storage: 'postgres' });
        } catch {
          /* file */
        }
      }
    } catch {
      /* file */
    }
    const { supplierFileStore } = await import('../services/supplier-file.store');
    return ok(res, { suppliers: supplierFileStore.list(), storage: 'file' });
  })
);

suppliers.post(
  '/',
  validate(
    z.object({
      name: z.string().min(1).max(200),
      contactName: z.string().max(200).optional().or(z.literal('')),
      email: z.string().email().optional().or(z.literal('')),
      phone: z.string().max(40).optional().or(z.literal('')),
      city: z.string().max(100).optional().or(z.literal('')),
      postcode: z.string().max(20).optional().or(z.literal('')),
      notes: z.string().max(500).optional().or(z.literal('')),
    })
  ),
  asyncHandler(async (req, res) => {
    const body = {
      name: req.body.name,
      contactName: req.body.contactName || undefined,
      email: req.body.email || undefined,
      phone: req.body.phone || undefined,
      city: req.body.city || undefined,
      postcode: req.body.postcode || undefined,
      notes: req.body.notes || undefined,
    };
    try {
      if (await (await import('../config/db')).pool.query('SELECT 1').then(() => true).catch(() => false)) {
        try {
          const row = await query(
            `INSERT INTO suppliers (name, contact_name, email, phone, city, postcode)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [
              body.name,
              body.contactName ?? null,
              body.email ?? null,
              body.phone ?? null,
              body.city ?? null,
              body.postcode ?? null,
            ]
          );
          return created(res, { supplier: row.rows[0], storage: 'postgres' });
        } catch {
          /* file */
        }
      }
    } catch {
      /* file */
    }
    const { supplierFileStore } = await import('../services/supplier-file.store');
    const supplier = supplierFileStore.create(body);
    return created(res, { supplier, storage: 'file' });
  })
);

// ---- Reviews ----
reviews.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT r.*, c.first_name FROM reviews r
       LEFT JOIN customers c ON c.id = r.customer_id
       WHERE r.is_published = TRUE
         AND ($1::uuid IS NULL OR r.branch_id = $1)
       ORDER BY r.created_at DESC LIMIT 50`,
      [req.query.branchId ?? env.defaultBranchId]
    );
    return ok(res, rows.rows);
  })
);

reviews.post(
  '/',
  authenticate,
  validate(
    z.object({
      rating: z.number().int().min(1).max(5),
      title: z.string().optional(),
      comment: z.string().optional(),
      orderId: z.string().uuid().optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user!.id]);
    const row = await query(
      `INSERT INTO reviews (customer_id, order_id, branch_id, rating, title, comment, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING *`,
      [
        c.rows[0]?.id ?? null,
        req.body.orderId ?? null,
        req.user?.branchId ?? env.defaultBranchId,
        req.body.rating,
        req.body.title ?? null,
        req.body.comment ?? null,
      ]
    );
    return created(res, row.rows[0]);
  })
);

// ---- Reports ----
reports.get(
  '/sales',
  authenticate,
  requirePermission('reports.view'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const period = (req.query.period as string) || 'daily';
    const trunc =
      period === 'yearly'
        ? 'year'
        : period === 'monthly'
          ? 'month'
          : period === 'weekly'
            ? 'week'
            : 'day';
    const rows = await query(
      `SELECT date_trunc($2, created_at) AS period,
        ROUND(SUM(total_amount)::numeric,2) AS sales,
        COUNT(*)::int AS orders
       FROM orders
       WHERE branch_id = $1 AND status NOT IN ('cancelled','rejected')
       GROUP BY 1 ORDER BY 1 DESC LIMIT 60`,
      [req.user?.branchId ?? env.defaultBranchId, trunc]
    );
    return ok(res, rows.rows);
  })
);

// ---- Branch / public ----
branch.get(
  '/info',
  asyncHandler(async (_req, res) => {
    const b = await query(`SELECT * FROM branches WHERE id = $1`, [env.defaultBranchId]);
    return ok(res, b.rows[0]);
  })
);

export {
  payments as paymentRoutes,
  inventory as inventoryRoutes,
  dashboard as dashboardRoutes,
  hr as hrRoutes,
  customers as customerRoutes,
  suppliers as supplierRoutes,
  reports as reportRoutes,
  reviews as reviewRoutes,
  branch as branchRoutes,
};
