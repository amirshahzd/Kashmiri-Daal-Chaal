import { query, pool } from '../config/db';
import { AppError } from '../utils/errors';
import { env } from '../config/env';
import { inventoryFileStore } from './inventory-file.store';
import {
  normalizeUnitLabel,
  resolveItemUnit,
  suggestCategoryFromName,
  suggestUnitFromName,
  toStoredQuantity,
  unitKind,
} from '../utils/inventory-units';

async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function listInventory(branchId = env.defaultBranchId, category?: string) {
  if (!(await dbAvailable())) {
    return inventoryFileStore.report();
  }
  try {
    const params: unknown[] = [branchId];
    let sql = `SELECT i.*, s.name AS supplier_name,
      ROUND(((COALESCE(i.selling_price,0) - i.cost_price) / NULLIF(i.cost_price,0)) * 100, 2) AS profit_margin_pct,
      (i.current_stock <= i.reorder_level) AS is_low_stock,
      (i.current_stock <= 0) AS is_out_of_stock
      FROM inventory_items i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.branch_id = $1 AND i.is_active = TRUE`;
    if (category) {
      params.push(category);
      sql += ` AND i.category = $${params.length}`;
    }
    sql += ' ORDER BY i.name';
    return (await query(sql, params)).rows;
  } catch {
    return inventoryFileStore.report();
  }
}

export async function getInventoryItem(id: string) {
  if (!(await dbAvailable())) {
    const item = inventoryFileStore.listItems().find((i) => i.id === id);
    if (!item) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');
    return item;
  }
  try {
    const item = await query(`SELECT * FROM inventory_items WHERE id = $1`, [id]);
    if (!item.rowCount) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');
    const txs = await query(
      `SELECT * FROM inventory_transactions WHERE inventory_item_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [id]
    );
    return { ...item.rows[0], transactions: txs.rows };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const item = inventoryFileStore.listItems().find((i) => i.id === id);
    if (!item) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');
    return item;
  }
}

export async function createInventoryItem(input: {
  sku?: string;
  name: string;
  category?: string;
  unit?: string;
  openingStock?: number;
  costPrice?: number;
  sellingPrice?: number;
  reorderLevel?: number;
  supplierName?: string;
  branchId?: string;
}) {
  if (!(await dbAvailable())) {
    try {
      return inventoryFileStore.createItem(input);
    } catch (err) {
      throw new AppError(400, 'INVENTORY_CREATE_FAILED', err instanceof Error ? err.message : 'Create failed');
    }
  }

  try {
    const branchId = input.branchId ?? env.defaultBranchId;
    const name = input.name.trim();
    const unit = resolveItemUnit(input.unit || suggestUnitFromName(name), name);
    const category = input.category ?? suggestCategoryFromName(name);
    const sku = input.sku?.trim() || `INV-${Date.now().toString().slice(-6)}`;
    const rawOpening = Number(input.openingStock);
    const opening =
      Number.isFinite(rawOpening) && rawOpening > 0
        ? toStoredQuantity(rawOpening, unit, unit) || rawOpening
        : 0;
    const res = await query(
      `INSERT INTO inventory_items (
        branch_id, sku, name, category, unit, opening_stock, current_stock,
        cost_price, selling_price, reorder_level, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,TRUE)
      RETURNING *`,
      [
        branchId,
        sku,
        name,
        category,
        unit,
        opening,
        input.costPrice ?? 0,
        input.sellingPrice ?? 0,
        input.reorderLevel ?? 10,
      ]
    );
    const item = res.rows[0];
    if (opening > 0) {
      await query(
        `INSERT INTO inventory_transactions
          (inventory_item_id, branch_id, tx_type, quantity, unit_cost, notes)
         VALUES ($1, $2, 'opening'::inventory_tx_type, $3, $4, $5)`,
        [item.id, branchId, opening, input.costPrice ?? 0, `Opening stock: ${opening} ${unit}`]
      );
      const refreshed = await query(`SELECT * FROM inventory_items WHERE id = $1`, [item.id]);
      return refreshed.rows[0];
    }
    return item;
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return inventoryFileStore.createItem(input);
    } catch (fileErr) {
      throw new AppError(
        400,
        'INVENTORY_CREATE_FAILED',
        fileErr instanceof Error ? fileErr.message : 'Create failed'
      );
    }
  }
}

/** Find by name or create, then buy quantity (Lentils / Spices / Drinks menus). */
export async function buyNamedStock(input: {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  entryUnit?: string;
  unitCost?: number;
  notes?: string;
  supplierName?: string;
  performedBy?: string;
  branchId?: string;
}) {
  let item: { id: string };
  if (!(await dbAvailable())) {
    item = inventoryFileStore.ensureNamedItem({
      name: input.name,
      category: input.category,
      unit: input.unit,
      costPrice: input.unitCost,
    });
  } else {
    try {
      const existing = await query(
        `SELECT id FROM inventory_items
         WHERE is_active = TRUE AND LOWER(name) = LOWER($1)
         LIMIT 1`,
        [input.name.trim()]
      );
      if (existing.rowCount) {
        item = { id: String(existing.rows[0].id) };
        await query(
          `UPDATE inventory_items SET category = $2, unit = $3 WHERE id = $1`,
          [item.id, input.category, resolveItemUnit(input.unit, input.name)]
        );
      } else {
        const created = await createInventoryItem({
          name: input.name,
          category: input.category,
          unit: input.unit,
          openingStock: 0,
          costPrice: input.unitCost,
          branchId: input.branchId,
        });
        item = { id: String((created as { id: string }).id) };
      }
    } catch {
      item = inventoryFileStore.ensureNamedItem({
        name: input.name,
        category: input.category,
        unit: input.unit,
        costPrice: input.unitCost,
      });
    }
  }

  return buyStock({
    inventoryItemId: item.id,
    quantity: input.quantity,
    entryUnit: input.entryUnit || input.unit,
    storeUnit: input.unit,
    unitCost: input.unitCost,
    notes: input.notes,
    supplierName: input.supplierName,
    performedBy: input.performedBy,
    branchId: input.branchId,
  });
}

/** Buy / receive new stock — automatically increases inventory balance. */
export async function buyStock(input: {
  inventoryItemId: string;
  quantity: number;
  entryUnit?: string;
  storeUnit?: string;
  unitCost?: number;
  notes?: string;
  supplierName?: string;
  performedBy?: string;
  branchId?: string;
}) {
  if (!(await dbAvailable())) {
    try {
      return inventoryFileStore.buyStock(input);
    } catch (err) {
      throw new AppError(400, 'PURCHASE_FAILED', err instanceof Error ? err.message : 'Purchase failed');
    }
  }

  try {
    const row = await query(`SELECT id, unit, name FROM inventory_items WHERE id = $1`, [
      input.inventoryItemId,
    ]);
    if (!row.rowCount) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');
    const itemUnit = resolveItemUnit(
      input.storeUnit || row.rows[0].unit || suggestUnitFromName(row.rows[0].name),
      row.rows[0].name
    );
    const qty = toStoredQuantity(input.quantity, itemUnit, input.entryUnit || itemUnit);
    if (!qty) throw new AppError(400, 'INVALID_QTY', 'Quantity must be greater than 0');

    await query(`UPDATE inventory_items SET unit = $2, cost_price = COALESCE($3, cost_price), updated_at = NOW() WHERE id = $1`, [
      input.inventoryItemId,
      itemUnit,
      input.unitCost ?? null,
    ]);

    const item = await recordTransaction({
      inventoryItemId: input.inventoryItemId,
      branchId: input.branchId,
      txType: 'purchase',
      quantity: qty,
      unitCost: input.unitCost,
      notes:
        input.notes ||
        `Stock purchase (+${qty} ${itemUnit}${
          input.entryUnit && input.entryUnit !== itemUnit
            ? ` from ${input.quantity} ${input.entryUnit}`
            : ''
        })`,
      performedBy: input.performedBy,
    });
    return { item, storage: 'postgres' as const };
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return inventoryFileStore.buyStock(input);
    } catch (fileErr) {
      throw new AppError(
        400,
        'PURCHASE_FAILED',
        fileErr instanceof Error ? fileErr.message : 'Purchase failed'
      );
    }
  }
}

/** Soft-delete an inventory item (hides from lists / menus). */
export async function deleteInventoryItem(inventoryItemId: string) {
  if (!(await dbAvailable())) {
    try {
      return inventoryFileStore.deleteItem(inventoryItemId);
    } catch (err) {
      throw new AppError(400, 'DELETE_FAILED', err instanceof Error ? err.message : 'Delete failed');
    }
  }

  try {
    const row = await query(
      `UPDATE inventory_items SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, name, sku`,
      [inventoryItemId]
    );
    if (!row.rowCount) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');
    return { ...row.rows[0], deleted: true };
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return inventoryFileStore.deleteItem(inventoryItemId);
    } catch (fileErr) {
      throw new AppError(
        400,
        'DELETE_FAILED',
        fileErr instanceof Error ? fileErr.message : 'Delete failed'
      );
    }
  }
}

/** Fix spelling mistakes / rename a stock item. */
export async function renameInventoryItem(input: {
  inventoryItemId: string;
  name: string;
  notes?: string;
}) {
  if (!(await dbAvailable())) {
    try {
      return inventoryFileStore.renameItem(input);
    } catch (err) {
      throw new AppError(400, 'RENAME_FAILED', err instanceof Error ? err.message : 'Rename failed');
    }
  }

  try {
    const newName = input.name.trim();
    if (!newName) throw new AppError(400, 'INVALID_NAME', 'Name is required');
    const row = await query(
      `SELECT id, name, category, unit FROM inventory_items WHERE id = $1 AND is_active = TRUE`,
      [input.inventoryItemId]
    );
    if (!row.rowCount) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');
    const previous = row.rows[0].name as string;
    if (previous === newName) {
      throw new AppError(400, 'SAME_NAME', 'New name is the same as the current name');
    }
    const dup = await query(
      `SELECT id FROM inventory_items
       WHERE is_active = TRUE AND id <> $1 AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [input.inventoryItemId, newName]
    );
    if (dup.rowCount) {
      throw new AppError(400, 'DUPLICATE_NAME', `Another item already uses the name "${newName}"`);
    }
    const unit = resolveItemUnit(row.rows[0].unit, newName);
    let category = row.rows[0].category as string;
    if (!category || category === 'General') {
      category = suggestCategoryFromName(newName);
    }
    const updated = await query(
      `UPDATE inventory_items
       SET name = $2, category = $3, unit = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [input.inventoryItemId, newName, category, unit]
    );
    await query(
      `INSERT INTO inventory_transactions
        (inventory_item_id, branch_id, tx_type, quantity, unit_cost, notes)
       VALUES ($1, $2, 'adjustment'::inventory_tx_type, 0, 0, $3)`,
      [
        input.inventoryItemId,
        env.defaultBranchId,
        `Renamed: "${previous}" → "${newName}"${input.notes?.trim() ? ` — ${input.notes.trim()}` : ''}`,
      ]
    );
    return {
      item: updated.rows[0],
      previousName: previous,
      newName,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return inventoryFileStore.renameItem(input);
    } catch (fileErr) {
      throw new AppError(
        400,
        'RENAME_FAILED',
        fileErr instanceof Error ? fileErr.message : 'Rename failed'
      );
    }
  }
}

/** Correct stock balance when a wrong quantity was entered. */
export async function amendStock(input: {
  inventoryItemId: string;
  newBalance: number;
  notes?: string;
  performedBy?: string;
  branchId?: string;
}) {
  if (!(await dbAvailable())) {
    try {
      return inventoryFileStore.amendStock(input);
    } catch (err) {
      throw new AppError(400, 'AMEND_FAILED', err instanceof Error ? err.message : 'Amend failed');
    }
  }

  try {
    const row = await query(
      `SELECT id, current_stock, unit, name FROM inventory_items WHERE id = $1 AND is_active = TRUE`,
      [input.inventoryItemId]
    );
    if (!row.rowCount) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');

    const previous = Number(row.rows[0].current_stock);
    const unit = resolveItemUnit(row.rows[0].unit, row.rows[0].name);
    // Persist cleaned unit (e.g. "10kg" → "kg")
    await query(`UPDATE inventory_items SET unit = $2, updated_at = NOW() WHERE id = $1`, [
      input.inventoryItemId,
      unit,
    ]);
    let newBalance = Math.max(0, Number(input.newBalance));
    if (!Number.isFinite(newBalance)) throw new AppError(400, 'INVALID_BALANCE', 'Invalid balance');
    newBalance = unitKind(unit) === 'count' ? Math.round(newBalance) : Number(newBalance.toFixed(3));
    const delta = Number((newBalance - previous).toFixed(unitKind(unit) === 'count' ? 0 : 3));
    if (delta === 0) throw new AppError(400, 'NO_CHANGE', 'New balance is the same as current balance');

    const item = await recordTransaction({
      inventoryItemId: input.inventoryItemId,
      branchId: input.branchId,
      txType: 'adjustment',
      quantity: delta,
      notes: `Correct balance: ${newBalance} ${unit}${
        input.notes?.trim() ? ` — ${input.notes.trim()}` : ''
      }`,
      performedBy: input.performedBy,
    });
    return {
      item: { ...(typeof item === 'object' ? item : {}), unit },
      previousBalance: previous,
      newBalance,
      delta,
      storage: 'postgres' as const,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return inventoryFileStore.amendStock(input);
    } catch (fileErr) {
      throw new AppError(400, 'AMEND_FAILED', fileErr instanceof Error ? fileErr.message : 'Amend failed');
    }
  }
}

export async function recentPurchases(limit = 200) {
  if (!(await dbAvailable())) {
    return inventoryFileStore.recentPurchases(limit);
  }
  try {
    return (
      await query(
        `SELECT t.*, i.sku, i.name, i.unit, i.supplier_name,
                (t.created_at::date)::text AS activity_date
         FROM inventory_transactions t
         JOIN inventory_items i ON i.id = t.inventory_item_id
         WHERE t.tx_type IN (
           'purchase', 'opening', 'adjustment', 'issue', 'return', 'damage', 'sale_deduction'
         )
         ORDER BY t.created_at DESC
         LIMIT $1`,
        [limit]
      )
    ).rows;
  } catch {
    return inventoryFileStore.recentPurchases(limit);
  }
}

export async function recordTransaction(input: {
  inventoryItemId: string;
  branchId?: string;
  txType: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
  performedBy?: string;
}) {
  if (!(await dbAvailable())) {
    if (input.txType === 'purchase') {
      return inventoryFileStore.buyStock({
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        unitCost: input.unitCost,
        notes: input.notes,
      });
    }
    if (input.txType === 'issue') {
      return inventoryFileStore.issueStock({
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        notes: input.notes,
      });
    }
    if (input.txType === 'adjustment') {
      // Relative adjust via amend requires absolute balance — not supported here
      throw new AppError(
        400,
        'USE_AMEND',
        'Use stock amend for adjustments when running without database'
      );
    }
    throw new AppError(503, 'DB_UNAVAILABLE', 'Database required for this transaction type');
  }

  const item = await query(`SELECT branch_id FROM inventory_items WHERE id = $1`, [
    input.inventoryItemId,
  ]);
  if (!item.rowCount) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory item not found');

  await query(
    `INSERT INTO inventory_transactions
      (inventory_item_id, branch_id, tx_type, quantity, unit_cost, notes, performed_by)
     VALUES ($1, $2, $3::inventory_tx_type, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.inventoryItemId,
      input.branchId ?? item.rows[0].branch_id,
      input.txType,
      input.quantity,
      input.unitCost ?? null,
      input.notes ?? null,
      input.performedBy ?? null,
    ]
  );
  return getInventoryItem(input.inventoryItemId);
}

export async function inventorySummary(branchId = env.defaultBranchId) {
  if (!(await dbAvailable())) {
    const items = inventoryFileStore.listItems();
    return {
      total_skus: items.length,
      low_stock_count: items.filter((i) => i.current_stock <= i.reorder_level).length,
      out_of_stock_count: items.filter((i) => i.current_stock <= 0).length,
      inventory_value: Number(
        items.reduce((s, i) => s + i.current_stock * i.cost_price, 0).toFixed(2)
      ),
    };
  }
  try {
    const res = await query(
      `SELECT
        COUNT(*)::int AS total_skus,
        COUNT(*) FILTER (WHERE current_stock <= reorder_level)::int AS low_stock_count,
        COUNT(*) FILTER (WHERE current_stock <= 0)::int AS out_of_stock_count,
        ROUND(SUM(current_stock * cost_price)::numeric, 2) AS inventory_value
       FROM inventory_items
       WHERE branch_id = $1 AND is_active = TRUE`,
      [branchId]
    );
    return res.rows[0];
  } catch {
    const items = inventoryFileStore.listItems();
    return {
      total_skus: items.length,
      low_stock_count: items.filter((i) => i.current_stock <= i.reorder_level).length,
      out_of_stock_count: items.filter((i) => i.current_stock <= 0).length,
      inventory_value: Number(
        items.reduce((s, i) => s + i.current_stock * i.cost_price, 0).toFixed(2)
      ),
    };
  }
}

export async function inventoryReport(branchId = env.defaultBranchId) {
  if (!(await dbAvailable())) {
    return inventoryFileStore.report();
  }
  try {
    return (
      await query(
        `SELECT
          i.id, i.sku, i.name, i.category, i.unit,
          i.opening_stock,
          COALESCE(SUM(t.quantity) FILTER (WHERE t.tx_type = 'purchase'), 0) AS purchased,
          COALESCE(SUM(t.quantity) FILTER (WHERE t.tx_type = 'issue'), 0) AS issued,
          COALESCE(SUM(t.quantity) FILTER (WHERE t.tx_type = 'return'), 0) AS returned,
          COALESCE(SUM(t.quantity) FILTER (WHERE t.tx_type = 'damage'), 0) AS damaged,
          COALESCE(SUM(t.quantity) FILTER (WHERE t.tx_type = 'sale_deduction'), 0) AS sold,
          i.current_stock AS current_balance,
          i.current_stock,
          i.cost_price, i.selling_price, i.reorder_level, i.expiry_date,
          (i.current_stock <= i.reorder_level) AS is_low_stock
         FROM inventory_items i
         LEFT JOIN inventory_transactions t ON t.inventory_item_id = i.id
         WHERE i.branch_id = $1 AND i.is_active = TRUE
         GROUP BY i.id
         ORDER BY i.category, i.name`,
        [branchId]
      )
    ).rows;
  } catch {
    return inventoryFileStore.report();
  }
}
