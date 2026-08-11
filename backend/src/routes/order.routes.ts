import { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  authenticate,
  optionalAuth,
  requirePermission,
  validate,
} from '../middleware';
import * as orderService from '../services/order.service';
import { ok, created } from '../utils/errors';
import { AuthedRequest } from '../types';
import { query } from '../config/db';
import { param } from '../utils/params';

const router = Router();

const createOrderSchema = z.object({
  orderType: z.enum(['eat_in', 'takeaway', 'delivery', 'uber_eats', 'deliveroo', 'just_eat']),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
        specialInstructions: z.string().max(500).optional(),
      })
    )
    .min(1),
  couponCode: z.string().optional(),
  specialInstructions: z.string().max(1000).optional(),
  deliveryAddressId: z.string().uuid().optional(),
  tableNumber: z.string().optional(),
  tipAmount: z.number().nonnegative().optional(),
});

router.post(
  '/',
  optionalAuth,
  validate(createOrderSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    let customerId: string | undefined;
    if (req.user) {
      const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user.id]);
      customerId = c.rows[0]?.id;
    }
    const order = await orderService.createOrder({
      ...req.body,
      customerId,
      userId: req.user?.id,
      branchId: req.user?.branchId,
    });
    return created(res, order);
  })
);

router.get(
  '/',
  authenticate,
  requirePermission('orders.view'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const orders = await orderService.listOrders({
      branchId: (req.query.branchId as string) || req.user?.branchId,
      status: req.query.status as string | undefined,
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    });
    return ok(res, orders);
  })
);

router.get(
  '/my',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user!.id]);
    if (!c.rowCount) return ok(res, []);
    return ok(res, await orderService.listOrders({ customerId: c.rows[0].id }));
  })
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    return ok(res, await orderService.getOrderById(param(req.params.id)));
  })
);

router.patch(
  '/:id/status',
  authenticate,
  requirePermission('orders.manage'),
  validate(z.object({ status: z.string(), note: z.string().optional() })),
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(
      res,
      await orderService.updateOrderStatus(param(req.params.id), req.body.status, req.user?.id, req.body.note)
    );
  })
);

router.post(
  '/:id/assign-driver',
  authenticate,
  requirePermission('delivery.manage'),
  validate(z.object({ driverId: z.string().uuid() })),
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, await orderService.assignDriver(param(req.params.id), req.body.driverId, req.user?.id));
  })
);

router.post(
  '/:id/reorder',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await orderService.getOrderById(param(req.params.id));
    const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user!.id]);
    const order = await orderService.createOrder({
      orderType: existing.order_type,
      items: existing.items.map((i: { menu_item_id: string; quantity: number; special_instructions?: string }) => ({
        menuItemId: i.menu_item_id,
        quantity: i.quantity,
        specialInstructions: i.special_instructions,
      })),
      customerId: c.rows[0]?.id,
      userId: req.user!.id,
      specialInstructions: existing.special_instructions,
    });
    return created(res, order);
  })
);

export default router;
