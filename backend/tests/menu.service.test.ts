import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../src/config/db', () => ({
  query: mockQuery,
}));

vi.mock('../src/config/env', () => ({
  env: {
    defaultBranchId: 'branch-1',
  },
}));

import {
  listCategories,
  listMenuItems,
  getMenuItem,
  upsertMenuItem,
} from '../src/services/menu.service';

describe('menu service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('listCategories', () => {
    it('lists active categories for the default branch', async () => {
      const rows = [
        {
          id: 'cat-1',
          name: 'Rice',
          slug: 'rice',
        },
      ];

      mockQuery.mockResolvedValue({
        rows,
        rowCount: rows.length,
      });

      const result = await listCategories();

      expect(result).toEqual(rows);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(['branch-1']);
    });

    it('uses the supplied branch id', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await listCategories('branch-2');

      expect(mockQuery.mock.calls[0][1]).toEqual(['branch-2']);
    });
  });

  describe('listMenuItems', () => {
    it('lists available menu items by default', async () => {
      const rows = [
        {
          id: 'item-1',
          name: 'Daal Chawal',
          price: 8,
        },
      ];

      mockQuery.mockResolvedValue({
        rows,
        rowCount: rows.length,
      });

      const result = await listMenuItems();

      expect(result).toEqual(rows);

      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('m.is_available = TRUE');
      expect(params).toEqual(['branch-1']);
    });

    it('applies category and search filters', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await listMenuItems({
        category: 'biryani',
        search: 'chicken',
      });

      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('c.slug = $2');
      expect(sql).toContain('m.name ILIKE $3');
      expect(params).toEqual([
        'branch-1',
        'biryani',
        '%chicken%',
      ]);
    });

    it('applies popular, new and offers filters', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await listMenuItems({
        popular: true,
        isNew: true,
        offers: true,
      });

      const [sql] = mockQuery.mock.calls[0];

      expect(sql).toContain('m.is_best_seller = TRUE');
      expect(sql).toContain('m.is_new = TRUE');
      expect(sql).toContain('m.discount_percent > 0');
    });

    it('includes unavailable items when availableOnly is false', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await listMenuItems({
        availableOnly: false,
      });

      const [sql] = mockQuery.mock.calls[0];

      expect(sql).not.toContain('m.is_available = TRUE');
    });
  });

  describe('getMenuItem', () => {
    it('returns the requested menu item', async () => {
      const item = {
        id: 'item-1',
        name: 'Chicken Biryani',
        slug: 'chicken-biryani',
        price: 12,
      };

      mockQuery.mockResolvedValue({
        rows: [item],
        rowCount: 1,
      });

      const result = await getMenuItem('chicken-biryani');

      expect(result).toEqual(item);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'WHERE m.slug = $1 OR m.id::text = $1',
        ),
        ['chicken-biryani'],
      );
    });

    it('throws a not-found error when the menu item does not exist', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(
        getMenuItem('does-not-exist'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'MENU_ITEM_NOT_FOUND',
        message: 'Menu item not found',
      });
    });
  });

  describe('upsertMenuItem', () => {
    it('updates an existing menu item', async () => {
      const updatedItem = {
        id: 'item-1',
        name: 'Updated Daal Chawal',
        price: 9,
      };

      mockQuery.mockResolvedValue({
        rows: [updatedItem],
        rowCount: 1,
      });

      const result = await upsertMenuItem(
        {
          name: 'Updated Daal Chawal',
          price: 9,
          isAvailable: true,
        },
        'item-1',
      );

      expect(result).toEqual(updatedItem);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('UPDATE menu_items SET');
      expect(params[0]).toBe('item-1');
      expect(params[1]).toBe('Updated Daal Chawal');
      expect(params[3]).toBe(9);
    });

    it('throws when updating a menu item that does not exist', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(
        upsertMenuItem(
          { name: 'Missing Item' },
          'missing-id',
        ),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'MENU_ITEM_NOT_FOUND',
      });
    });

    it('creates a new menu item and generates a slug', async () => {
      const createdItem = {
        id: 'item-2',
        name: 'Chicken Pulao',
        slug: 'chicken-pulao',
        price: 10,
      };

      mockQuery.mockResolvedValue({
        rows: [createdItem],
        rowCount: 1,
      });

      const result = await upsertMenuItem({
        categoryId: 'cat-1',
        name: 'Chicken Pulao',
        price: 10,
      });

      expect(result).toEqual(createdItem);

      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('INSERT INTO menu_items');
      expect(params[0]).toBe('cat-1');
      expect(params[1]).toBe('branch-1');
      expect(params[3]).toBe('Chicken Pulao');
      expect(params[5]).toBe('chicken-pulao');
      expect(params[11]).toBe(15);
      expect(params[13]).toBe(true);
      expect(params[14]).toBe(false);
      expect(params[17]).toBe(true);
      expect(params[18]).toBe(0);
    });

    it('uses the supplied slug when creating a menu item', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'item-3',
            name: 'Daal Chawal',
            slug: 'special-daal',
          },
        ],
        rowCount: 1,
      });

      await upsertMenuItem({
        categoryId: 'cat-1',
        name: 'Daal Chawal',
        slug: 'special-daal',
        price: 8,
      });

      const [, params] = mockQuery.mock.calls[0];

      expect(params[5]).toBe('special-daal');
    });
  });
});

