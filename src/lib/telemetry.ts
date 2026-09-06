/**
 * P1 — Real Telemetry: shared validation & geospatial helpers.
 *
 * Hard rules (fail-closed):
 *   - Coordinates outside WGS-84 valid ranges are rejected.
 *   - Device timestamps more than CLOCK_SKEW_MS in the future are
 *     rejected (clock-spoof protection).
 *   - Device timestamps older than STALE_MS are rejected (replay of
 *     ancient data; retention window boundary).
 *   - Implied speed vs the device's previous accepted position above
 *     MAX_IMPLIED_SPEED_KMH is rejected as a spoofed jump.
 *   - Speed outside physical bounds is rejected.
 */

export const FRESH_WINDOW_MS = 15 * 60 * 1000;        // telemetry fresher than this = live
export const CLOCK_SKEW_MS = 5 * 60 * 1000;           // allowed future drift
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;      // reject older than 7 days
export const MAX_IMPLIED_SPEED_KMH = 300;             // physical plausibility bound
export const MAX_REPORTED_SPEED_KMH = 300;
export const TELEMETRY_RATE_LIMIT = 600;              // events per device per minute
export const TELEMETRY_RATE_WINDOW_MS = 60 * 1000;
export const TELEMETRY_RETENTION_DAYS = 90;

export interface TelemetryInput {
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  deviceTime: Date;
}

export type TelemetryValidation =
  | { ok: true; value: TelemetryInput }
  | { ok: false; reason: string };

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function validateTelemetry(body: unknown): TelemetryValidation {
  const b = (body ?? {}) as Record<string, unknown>;

  const lat = toNum(b.lat);
  const lng = toNum(b.lng);
  if (lat === null || lng === null) {
    return { ok: false, reason: 'lat and lng are required numbers' };
  }
  if (lat < -90 || lat > 90) return { ok: false, reason: 'lat out of range [-90, 90]' };
  if (lng < -180 || lng > 180) return { ok: false, reason: 'lng out of range [-180, 180]' };

  const speed = toNum(b.speed);
  if (speed !== null && (speed < 0 || speed > MAX_REPORTED_SPEED_KMH)) {
    return { ok: false, reason: `speed out of range [0, ${MAX_REPORTED_SPEED_KMH}] km/h` };
  }

  const heading = toNum(b.heading);
  if (heading !== null && (heading < 0 || heading >= 360)) {
    return { ok: false, reason: 'heading out of range [0, 360)' };
  }

  const rawTime = b.deviceTime ?? b.timestamp;
  if (typeof rawTime !== 'string' && typeof rawTime !== 'number') {
    return { ok: false, reason: 'deviceTime (ISO string or epoch ms) is required' };
  }
  const deviceTime = new Date(rawTime as string | number);
  if (Number.isNaN(deviceTime.getTime())) {
    return { ok: false, reason: 'deviceTime is not a valid date' };
  }
  const now = Date.now();
  if (deviceTime.getTime() > now + CLOCK_SKEW_MS) {
    return { ok: false, reason: 'deviceTime is too far in the future (clock skew)' };
  }
  if (deviceTime.getTime() < now - STALE_MS) {
    return { ok: false, reason: 'deviceTime is too old (stale/replay)' };
  }

  return {
    ok: true,
    value: {
      lat,
      lng,
      speed,
      heading,
      deviceTime,
    },
  };
}

/** Great-circle distance in km (haversine). */
export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Implied speed between the previous accepted position and a candidate.
 * Returns null when it cannot be computed (no previous fix, zero dt).
 */
export function impliedSpeedKmh(
  prev: { lat: number; lng: number; time: Date },
  next: { lat: number; lng: number; time: Date }
): number | null {
  const dtHours = (next.time.getTime() - prev.time.getTime()) / 3_600_000;
  if (dtHours <= 0) return null; // out-of-order vs cache — let idempotency handle dupes
  const km = haversineKm(prev.lat, prev.lng, next.lat, next.lng);
  return km / dtHours;
}
