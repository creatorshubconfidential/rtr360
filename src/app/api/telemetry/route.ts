import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import {
  validateTelemetry,
  impliedSpeedKmh,
  haversineKm,
  MAX_IMPLIED_SPEED_KMH,
  TELEMETRY_RATE_LIMIT,
  TELEMETRY_RATE_WINDOW_MS,
} from '@/lib/telemetry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * P1 — REAL TELEMETRY INGESTION (device-authenticated)
 *
 * POST /api/telemetry
 * Headers:
 *   X-Device-IMEI: device IMEI (identifier)
 *   X-Device-Key:  raw device key (provisioned once; only SHA-256 hash stored)
 * Body:
 *   { lat, lng, speed?, heading?, deviceTime }
 *
 * Security & integrity chain (fail-closed at every step):
 *   1. Credential: IMEI + key hash lookup — unknown/mismatched → 401
 *   2. Tenant: device.organizationId MUST exist (warehouse devices cannot
 *      ingest) → 403; events are hard-bound to the device's organization
 *   3. Rate limit per device → 429
 *   4. Validation: coordinate/speed/heading ranges, clock skew, staleness → 400
 *   5. Spoofing: implied jump speed vs previous fix > MAX_IMPLIED_SPEED_KMH → 422
 *   6. Idempotency: unique (deviceId, deviceTime) — duplicates/retries are
 *      acknowledged without duplicating rows (replay protection)
 *   7. Association: vehicle via active Vehicle.deviceId link (device→vehicle
 *      relationship; no client-supplied org/vehicle is ever trusted)
 *   8. Trip aggregation: in-progress trip's maxSpeed/distance/avgSpeed updated
 *      server-side (never client-authoritative)
 */

export async function POST(request: Request) {
  try {
    const imei = request.headers.get('x-device-imei')?.trim();
    const key = request.headers.get('x-device-key')?.trim();

    if (!imei || !key) {
      return NextResponse.json({ error: 'Missing device credentials' }, { status: 401 });
    }

    // 1. Device credential verification (hash lookup — raw key never stored)
    const deviceKeyHash = createHash('sha256').update(key, 'utf8').digest('hex');
    const device = await db.device.findUnique({
      where: { imei },
      select: {
        id: true,
        imei: true,
        deviceKeyHash: true,
        organizationId: true,
        status: true,
        lastLat: true,
        lastLng: true,
        lastDeviceTime: true,
      },
    });

    const generic401 = NextResponse.json({ error: 'Invalid device credentials' }, { status: 401 });
    if (!device || !device.deviceKeyHash || device.deviceKeyHash !== deviceKeyHash) {
      logger.warn('telemetry.auth_failed', { imei_present: Boolean(imei) });
      return generic401;
    }

    // 2. Tenant enforcement — warehouse/orgless devices cannot ingest (fail-closed)
    if (!device.organizationId) {
      logger.warn('telemetry.orgless_device_rejected', { deviceId: device.id });
      return NextResponse.json({ error: 'Device is not assigned to an organization' }, { status: 403 });
    }
    if (!['installed', 'active'].includes(device.status)) {
      return NextResponse.json({ error: 'Device is not active' }, { status: 403 });
    }

    // 3. Per-device rate limit
    const rl = await rateLimit(`telemetry:${device.id}`, TELEMETRY_RATE_LIMIT, TELEMETRY_RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Telemetry rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': Math.ceil((rl.resetAt - Date.now()) / 1000).toString() } }
      );
    }

    // 4. Payload validation
    const body = await request.json().catch(() => null);
    const validated = validateTelemetry(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.reason }, { status: 400 });
    }
    const { lat, lng, speed, heading, deviceTime } = validated.value;

    // 5. Spoofing: implied jump speed vs previous accepted fix
    if (
      device.lastLat !== null && device.lastLng !== null && device.lastDeviceTime
    ) {
      const implied = impliedSpeedKmh(
        { lat: device.lastLat, lng: device.lastLng, time: device.lastDeviceTime },
        { lat, lng, time: deviceTime }
      );
      if (implied !== null && implied > MAX_IMPLIED_SPEED_KMH) {
        logger.warn('telemetry.impossible_speed_rejected', {
          deviceId: device.id,
          impliedSpeedKmh: Math.round(implied),
        });
        return NextResponse.json(
          { error: 'Implied movement speed is physically impossible' },
          { status: 422 }
        );
      }
    }

    // 6+7. Vehicle association via device link (never client-supplied)
    const vehicle = await db.vehicle.findFirst({
      where: { deviceId: device.id, organizationId: device.organizationId },
      select: { id: true },
    });

    // 6. Idempotent write — unique (deviceId, deviceTime) as replay guard
    let duplicated = false;
    try {
      await db.telemetryEvent.create({
        data: {
          deviceId: device.id,
          vehicleId: vehicle?.id ?? null,
          organizationId: device.organizationId,
          lat,
          lng,
          speed,
          heading,
          deviceTime,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Unique constraint|P2002/i.test(msg)) {
        duplicated = true; // replay/duplicate — acknowledged, not re-stored
      } else {
        throw e;
      }
    }

    // 8. Cache latest position on the device (realtime reads + spoof checks)
    if (!duplicated) {
      // Server-authoritative distance: previous accepted fix → this fix
      const segmentKm =
        device.lastLat !== null && device.lastLng !== null && device.lastDeviceTime
          ? haversineKm(device.lastLat, device.lastLng, lat, lng)
          : 0;

      await db.device.update({
        where: { id: device.id },
        data: {
          lastLat: lat,
          lastLng: lng,
          lastSpeed: speed,
          lastHeading: heading,
          lastDeviceTime: deviceTime,
          lastPingAt: new Date(),
        },
      });

      // Trip aggregation (server-authoritative totals — never client-supplied)
      if (vehicle) {
        const trip = await db.trip.findFirst({
          where: { vehicleId: vehicle.id, status: 'in_progress' },
          orderBy: { startTime: 'desc' },
          select: { id: true, distance: true, maxSpeed: true, startTime: true },
        });
        if (trip) {
          const newDistance = (trip.distance ?? 0) + segmentKm;
          const durationMin = Math.max(
            1,
            Math.round((Date.now() - trip.startTime.getTime()) / 60_000)
          );
          const avgSpeed = durationMin > 0 ? (newDistance / (durationMin / 60)) : null;
          await db.trip.update({
            where: { id: trip.id },
            data: {
              distance: Math.round(newDistance * 100) / 100,
              maxSpeed: speed !== null ? Math.max(trip.maxSpeed ?? 0, speed) : trip.maxSpeed,
              avgSpeed: avgSpeed !== null ? Math.round(avgSpeed * 10) / 10 : undefined,
            },
          });
        }
      }
    }

    logger.info('telemetry.accepted', {
      deviceId: device.id,
      organizationId: device.organizationId,
      vehicleId: vehicle?.id ?? null,
      duplicated,
    });

    return NextResponse.json({
      accepted: true,
      duplicated,
      device: device.imei,
    });
  } catch (error) {
    logger.error('telemetry.ingestion_error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
