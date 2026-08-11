import { NextRequest, NextResponse } from 'next/server';
import {
  isMenuCatalogEmpty,
  readMenuCatalogState,
  writeMenuCatalogState,
} from '@/lib/menu-catalog-store';
import type { MenuCatalogState } from '@/lib/menu-catalog-types';

/** Public: current menu catalog (admin-added dishes, price edits, removals). */
export async function GET() {
  try {
    return NextResponse.json(readMenuCatalogState());
  } catch {
    return NextResponse.json({ extras: [], overrides: {}, removedIds: [] });
  }
}

/**
 * Save shared menu catalog so every customer/device sees the same menu.
 * Accepts full state (preferred) or merge-from-client when server is still empty.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<MenuCatalogState> & { mergeIfEmpty?: boolean };
    const incoming: MenuCatalogState = {
      extras: Array.isArray(body.extras) ? body.extras : [],
      overrides: body.overrides && typeof body.overrides === 'object' ? body.overrides : {},
      removedIds: Array.isArray(body.removedIds) ? body.removedIds : [],
    };

    if (body.mergeIfEmpty) {
      const current = readMenuCatalogState();
      if (!isMenuCatalogEmpty(current)) {
        return NextResponse.json(current);
      }
    }

    const saved = writeMenuCatalogState(incoming);
    return NextResponse.json({ ...saved, saved: true });
  } catch {
    return NextResponse.json({ error: 'Could not save menu catalog' }, { status: 500 });
  }
}
