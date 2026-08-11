/** Delivery range from Kashmiri Daal Chawal (Hall Road kitchen). */

/** Default when admin has not set a custom radius (kept as export name for callers). */
export const MAX_DELIVERY_KM = 10;
export const DEFAULT_DELIVERY_RADIUS_KM = 10;

/** Hall Road, Lahore kitchen coordinates */
export const KITCHEN_COORDS = {
  lat: 31.55805,
  lng: 74.31925,
  label: 'Hall Road, Lahore',
} as const;

export type DeliveryDistanceResult = {
  /** Distance in km from kitchen (null if address could not be located) */
  km: number | null;
  withinRange: boolean;
  /** Polite customer-facing status */
  message: string;
  /** Resolved place label, if known */
  placeLabel?: string;
  /** Radius used for this check (admin-configurable) */
  maxKm?: number;
};

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

export function outOfRangeMessage(km: number, maxKm: number = DEFAULT_DELIVERY_RADIUS_KM): string {
  const d = roundKm(km);
  const r = roundKm(maxKm);
  return (
    `We're sorry — your address is about ${d} km from our kitchen on Hall Road, ` +
    `which is beyond our ${r} km delivery range. ` +
    `We're unable to deliver that far with the care and freshness we promise. ` +
    `You're most welcome to order as Take Away and collect from Hall Road, ` +
    `or enter a delivery address within ${r} km of our restaurant. ` +
    `Thank you for understanding — we hope to serve you soon.`
  );
}

export function withinRangeMessage(km: number, maxKm: number = DEFAULT_DELIVERY_RADIUS_KM): string {
  const d = roundKm(km);
  const r = roundKm(maxKm);
  return (
    `Great news — delivery is available to your address (about ${d} km from our Hall Road kitchen). ` +
    `Our riders serve within ${r} km so your meal arrives hot and fresh.`
  );
}

/**
 * Measure travel distance from kitchen to a customer address.
 * Uses the app's geocode API (Hall Road coordinates + admin-set max km).
 */
export async function measureDeliveryDistance(
  address: string,
  signal?: AbortSignal
): Promise<DeliveryDistanceResult> {
  const q = address.trim();
  if (q.length < 8) {
    return {
      km: null,
      withinRange: false,
      message: 'Please enter a full delivery address (street / area) so we can check our range.',
    };
  }

  try {
    const res = await fetch(
      `/api/delivery-distance?address=${encodeURIComponent(q)}`,
      { signal, headers: { Accept: 'application/json' } }
    );
    const data = (await res.json()) as DeliveryDistanceResult;
    if (data && typeof data.message === 'string') return data;
    return {
      km: null,
      withinRange: false,
      message:
        'We could not verify the distance right now. Please try again in a moment, or choose Take Away from Hall Road.',
    };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      return {
        km: null,
        withinRange: false,
        message: 'Checking delivery distance…',
      };
    }
    return {
      km: null,
      withinRange: false,
      message:
        'We could not verify the distance right now. Please try again in a moment, or choose Take Away from Hall Road.',
    };
  }
}

/** Load current admin-set delivery radius (default 10 km). */
export async function fetchDeliveryRadiusKm(signal?: AbortSignal): Promise<number> {
  try {
    const res = await fetch('/api/delivery-settings', {
      signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = (await res.json()) as { maxKm?: number };
    const n = Number(data.maxKm);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* use default */
  }
  return DEFAULT_DELIVERY_RADIUS_KM;
}

/** Admin: save amended delivery radius (1–50 km). */
export async function saveDeliveryRadiusKm(maxKm: number): Promise<number> {
  const res = await fetch('/api/delivery-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ maxKm }),
  });
  const data = (await res.json()) as { maxKm?: number; error?: string };
  if (!res.ok) throw new Error(data.error || 'Could not save delivery radius');
  return Number(data.maxKm) || DEFAULT_DELIVERY_RADIUS_KM;
}
