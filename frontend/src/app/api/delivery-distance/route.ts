import { NextRequest, NextResponse } from 'next/server';
import {
  KITCHEN_COORDS,
  outOfRangeMessage,
  withinRangeMessage,
  type DeliveryDistanceResult,
} from '@/lib/delivery-range';
import { getDeliveryRadiusKm } from '@/lib/delivery-settings';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

/** Server-side geocode + distance from Hall Road kitchen (admin radius). */
export async function GET(req: NextRequest) {
  const maxKm = getDeliveryRadiusKm();
  const address = (req.nextUrl.searchParams.get('address') || '').trim();
  if (address.length < 8) {
    const body: DeliveryDistanceResult = {
      km: null,
      withinRange: false,
      maxKm,
      message: 'Please enter a full delivery address (street / area) so we can check our range.',
    };
    return NextResponse.json(body);
  }

  const query = /lahore/i.test(address) ? address : `${address}, Lahore, Pakistan`;
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      countrycodes: 'pk',
    });

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KashmiriDaalChawal-DeliveryCheck/1.0 (restaurant-website)',
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`geocode ${res.status}`);

    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
    }>;

    if (!data?.length) {
      const body: DeliveryDistanceResult = {
        km: null,
        withinRange: false,
        maxKm,
        message:
          'We could not locate that address. Please add a clearer street or area name in Lahore so we can check if delivery is available.',
      };
      return NextResponse.json(body);
    }

    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const body: DeliveryDistanceResult = {
        km: null,
        withinRange: false,
        maxKm,
        message:
          'We could not map that address. Please try a nearby landmark or fuller street name in Lahore.',
      };
      return NextResponse.json(body);
    }

    const km = haversineKm(KITCHEN_COORDS.lat, KITCHEN_COORDS.lng, lat, lng);
    const withinRange = km <= maxKm;
    const body: DeliveryDistanceResult = {
      km: roundKm(km),
      withinRange,
      maxKm,
      placeLabel: data[0].display_name,
      message: withinRange ? withinRangeMessage(km, maxKm) : outOfRangeMessage(km, maxKm),
    };
    return NextResponse.json(body);
  } catch {
    const body: DeliveryDistanceResult = {
      km: null,
      withinRange: false,
      maxKm,
      message:
        'We could not verify the distance right now. Please try again in a moment, or choose Take Away from Hall Road.',
    };
    return NextResponse.json(body, { status: 503 });
  }
}
