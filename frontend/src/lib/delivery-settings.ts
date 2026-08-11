import fs from 'fs';
import path from 'path';

/** Default radius when admin has not set a custom value. */
export const DEFAULT_DELIVERY_RADIUS_KM = 10;

const FILE = path.join(process.cwd(), 'data', 'delivery-settings.json');
export const DELIVERY_RADIUS_EVENT = 'kdc-delivery-radius-change';
export const DELIVERY_RADIUS_LS_KEY = 'kdc-delivery-radius-km';

export type DeliverySettings = {
  maxKm: number;
};

function clampRadius(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DELIVERY_RADIUS_KM;
  // Allow 1–50 km so admin can tighten or expand safely
  return Math.min(50, Math.max(1, Math.round(n * 10) / 10));
}

/** Server-only: read radius admin saved (fallback 10 km). */
export function getDeliveryRadiusKm(): number {
  try {
    if (!fs.existsSync(FILE)) return DEFAULT_DELIVERY_RADIUS_KM;
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw) as Partial<DeliverySettings>;
    return clampRadius(Number(data.maxKm));
  } catch {
    return DEFAULT_DELIVERY_RADIUS_KM;
  }
}

/** Server-only: save admin-amended delivery radius. */
export function setDeliveryRadiusKm(km: number): number {
  const maxKm = clampRadius(km);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const payload: DeliverySettings = { maxKm };
  fs.writeFileSync(FILE, JSON.stringify(payload, null, 2), 'utf8');
  return maxKm;
}
