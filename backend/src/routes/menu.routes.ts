import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, optionalAuth, requirePermission, validate } from '../middleware';
import * as menuService from '../services/menu.service';
import { ok, created } from '../utils/errors';
import { param } from '../utils/params';

const router = Router();

router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    return ok(res, await menuService.listCategories(req.query.branchId as string | undefined));
  })
);

router.get(
  '/items',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const items = await menuService.listMenuItems({
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
      popular: req.query.popular === 'true',
      isNew: req.query.new === 'true',
      offers: req.query.offers === 'true',
      branchId: req.query.branchId as string | undefined,
    });
    return ok(res, items);
  })
);

router.get(
  '/items/:slugOrId',
  asyncHandler(async (req, res) => {
    return ok(res, await menuService.getMenuItem(param(req.params.slugOrId)));
  })
);

router.post(
  '/items',
  authenticate,
  requirePermission('menu.manage'),
  validate(
    z.object({
      categoryId: z.string().uuid(),
      name: z.string().min(1),
      price: z.number().nonnegative(),
      description: z.string().optional(),
      ingredients: z.array(z.string()).optional(),
      allergens: z.array(z.string()).optional(),
      calories: z.number().int().optional(),
      prepTimeMinutes: z.number().int().optional(),
      imageUrl: z.string().optional(),
      isAvailable: z.boolean().optional(),
      isBestSeller: z.boolean().optional(),
      discountPercent: z.number().min(0).max(100).optional(),
      sku: z.string().optional(),
      nameUr: z.string().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    return created(res, await menuService.upsertMenuItem(req.body));
  })
);

router.patch(
  '/items/:id',
  authenticate,
  requirePermission('menu.manage'),
  asyncHandler(async (req, res) => {
    return ok(res, await menuService.upsertMenuItem(req.body, param(req.params.id)));
  })
);

export default router;
