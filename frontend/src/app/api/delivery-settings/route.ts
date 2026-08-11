import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_DELIVERY_RADIUS_KM,
  getDeliveryRadiusKm,
  setDeliveryRadiusKm,
} from '@/lib/delivery-settings';

/** Public: current delivery radius (admin-configurable, default 10 km). */
export async function GET() {
  try {
    return NextResponse.json({ maxKm: getDeliveryRadiusKm() });
  } catch {
    return NextResponse.json({ maxKm: DEFAULT_DELIVERY_RADIUS_KM });
  }
}

/** Admin: amend delivery radius in km. */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { maxKm?: number };
    const maxKm = setDeliveryRadiusKm(Number(body.maxKm));
    return NextResponse.json({ maxKm, saved: true });
  } catch {
    return NextResponse.json(
      { error: 'Could not save delivery radius', maxKm: DEFAULT_DELIVERY_RADIUS_KM },
      { status: 500 }
    );
  }
}
