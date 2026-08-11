import { query } from '../config/db';
import { AppError } from '../utils/errors';
import { env } from '../config/env';

export interface MenuFilters {
  category?: string;
  search?: string;
  popular?: boolean;
  isNew?: boolean;
  offers?: boolean;
  availableOnly?: boolean;
  branchId?: string;
}

export async function listCategories(branchId = env.defaultBranchId) {
  const res = await query(
    `SELECT id, name, name_ur, slug, description, image_url, sort_order
     FROM menu_categories
     WHERE (branch_id = $1 OR branch_id IS NULL) AND is_active = TRUE
     ORDER BY sort_order, name`,
    [branchId]
  );
  return res.rows;
}

export async function listMenuItems(filters: MenuFilters = {}) {
  const branchId = filters.branchId ?? env.defaultBranchId;
  const params: unknown[] = [branchId];
  const where: string[] = ['(m.branch_id = $1 OR m.branch_id IS NULL)'];

  if (filters.availableOnly !== false) {
    where.push('m.is_available = TRUE');
  }
  if (filters.category) {
    params.push(filters.category);
    where.push(`(c.slug = $${params.length} OR c.id::text = $${params.length})`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(m.name ILIKE $${params.length} OR m.description ILIKE $${params.length})`);
  }
  if (filters.popular) where.push('m.is_best_seller = TRUE');
  if (filters.isNew) where.push('m.is_new = TRUE');
  if (filters.offers) where.push('m.discount_percent > 0');

  const res = await query(
    `SELECT m.*, c.name AS category_name, c.slug AS category_slug,
      ROUND(m.price * (1 - COALESCE(m.discount_percent,0)/100), 2) AS effective_price
     FROM menu_items m
     JOIN menu_categories c ON c.id = m.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY m.sort_order, m.name`,
    params
  );
  return res.rows;
}

export async function getMenuItem(slugOrId: string) {
  const res = await query(
    `SELECT m.*, c.name AS category_name, c.slug AS category_slug,
      ROUND(m.price * (1 - COALESCE(m.discount_percent,0)/100), 2) AS effective_price
     FROM menu_items m
     JOIN menu_categories c ON c.id = m.category_id
     WHERE m.slug = $1 OR m.id::text = $1`,
    [slugOrId]
  );
  if (!res.rowCount) throw new AppError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
  return res.rows[0];
}

export async function upsertMenuItem(data: Record<string, unknown>, id?: string) {
  if (id) {
    const res = await query(
      `UPDATE menu_items SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        is_available = COALESCE($5, is_available),
        is_best_seller = COALESCE($6, is_best_seller),
        discount_percent = COALESCE($7, discount_percent),
        allergens = COALESCE($8, allergens),
        ingredients = COALESCE($9, ingredients),
        calories = COALESCE($10, calories),
        prep_time_minutes = COALESCE($11, prep_time_minutes),
        image_url = COALESCE($12, image_url),
        category_id = COALESCE($13::uuid, category_id)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        data.name ?? null,
        data.description ?? null,
        data.price ?? null,
        data.isAvailable ?? null,
        data.isBestSeller ?? null,
        data.discountPercent ?? null,
        data.allergens ?? null,
        data.ingredients ?? null,
        data.calories ?? null,
        data.prepTimeMinutes ?? null,
        data.imageUrl ?? null,
        data.categoryId ?? null,
      ]
    );
    if (!res.rowCount) throw new AppError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
    return res.rows[0];
  }

  const slug =
    (data.slug as string) ||
    String(data.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const res = await query(
    `INSERT INTO menu_items (
      category_id, branch_id, sku, name, name_ur, slug, description, ingredients, allergens,
      price, calories, prep_time_minutes, image_url, is_available, is_best_seller, is_new,
      is_vegetarian, is_halal, discount_percent
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    ) RETURNING *`,
    [
      data.categoryId,
      data.branchId ?? env.defaultBranchId,
      data.sku ?? null,
      data.name,
      data.nameUr ?? null,
      slug,
      data.description ?? null,
      data.ingredients ?? [],
      data.allergens ?? [],
      data.price,
      data.calories ?? null,
      data.prepTimeMinutes ?? 15,
      data.imageUrl ?? null,
      data.isAvailable ?? true,
      data.isBestSeller ?? false,
      data.isNew ?? false,
      data.isVegetarian ?? false,
      data.isHalal ?? true,
      data.discountPercent ?? 0,
    ]
  );
  return res.rows[0];
}
