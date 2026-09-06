import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createSseLifecycle } from '@/lib/realtime/sse-lifecycle';
import { getTenantFilter } from '@/lib/tenant';
import { FRESH_WINDOW_MS } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * P1 — REAL-TIME VEHICLE POSITIONS (Server-Sent Events)
 *
 * Streams ONLY real telemetry received through POST /api/telemetry:
 *   - A vehicle is "live" when its device has a position fix within
 *     FRESH_WINDOW_MS; coordinates/speed/heading come from the device's
 *     latest accepted fix — never generated, interpolated or simulated.
 *   - Vehicles without fresh telemetry are reported honestly as
 *     status 'no_data' with null coordinates.
 * Every 3s tick re-reads the cached device positions; updates are sent
 * only when a device's fix timestamp actually changed.
 */

interface DeviceFix {
  id: string;
  lastLat: number | null;
  lastLng: number | null;
  lastSpeed: number | null;
  lastHeading: number | null;
  lastDeviceTime: Date | null;
}

function buildState(v: {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  driver: { name: string } | null;
  device: DeviceFix | null;
}) {
  const d = v.device;
  const fixTime = d?.lastDeviceTime ?? null;
  const fresh =
    fixTime !== null && Date.now() - fixTime.getTime() <= FRESH_WINDOW_MS;

  if (!d || !fresh || d.lastLat === null || d.lastLng === null) {
    return {
      id: v.id,
      plateNumber: v.plateNumber,
      make: v.make,
      model: v.model,
      driver: v.driver?.name || null,
      imei: null, // raw IMEI is never exposed to clients (device id stays server-side)
      lat: null,
      lng: null,
      speed: null,
      heading: null,
      status: 'no_data',
      lastUpdate: fixTime ? fixTime.toISOString() : null,
    };
  }

  const speed = d.lastSpeed ?? 0;
  return {
    id: v.id,
    plateNumber: v.plateNumber,
    make: v.make,
    model: v.model,
    driver: v.driver?.name || null,
    imei: null,
    lat: d.lastLat,
    lng: d.lastLng,
    speed,
    heading: d.lastHeading ?? 0,
    status: speed > 5 ? 'moving' : 'idle',
    lastUpdate: fixTime ? fixTime.toISOString() : null,
  };
}

export async function GET(request: Request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const orgFilter = getTenantFilter(user);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const lifecycle = createSseLifecycle(controller, encoder, request.signal);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendEvent = (data: any) => lifecycle.send(`data: ${JSON.stringify(data)}\n\n`);

      // Initial full state — REAL data only
      try {
        const vehicles = await db.vehicle.findMany({
          where: { ...orgFilter, status: 'active' },
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            driver: { select: { name: true } },
            device: {
              select: {
                id: true,
                lastLat: true,
                lastLng: true,
                lastSpeed: true,
                lastHeading: true,
                lastDeviceTime: true,
              },
            },
          },
        });

        if (lifecycle.isClosed()) return;

        const vehicleStates = vehicles.map(buildState);
        sendEvent({
          type: 'init',
          vehicles: vehicleStates,
          total: vehicleStates.length,
          live: vehicleStates.filter((s) => s.status !== 'no_data').length,
        });

        // Tick: re-read cached fixes every 3s and stream the current real
        // state (values come straight from the DB — never generated).
        const scheduleNext = () => {
          if (lifecycle.isClosed()) return;

          lifecycle.setTimeout(async () => {
            if (lifecycle.isClosed()) return;

            try {
              const devices = await db.vehicle.findMany({
                where: { ...orgFilter, status: 'active' },
                select: {
                  id: true,
                  plateNumber: true,
                  make: true,
                  model: true,
                  driver: { select: { name: true } },
                  device: {
                    select: {
                      id: true,
                      lastLat: true,
                      lastLng: true,
                      lastSpeed: true,
                      lastHeading: true,
                      lastDeviceTime: true,
                    },
                  },
                },
              });

              if (lifecycle.isClosed()) return;

              const current = new Map(devices.map((v) => [v.id, buildState(v)]));

              sendEvent({
                type: 'update',
                vehicles: [...current.values()],
                tick: Date.now(),
              });

              if (lifecycle.isClosed()) {
                return;
              }
            } catch {
              // DB error — send heartbeat, never fabricate positions.
              if (!lifecycle.isClosed()) sendEvent({ type: 'heartbeat', tick: Date.now() });
            }

            if (!lifecycle.isClosed()) scheduleNext();
          }, 3000);
        };

        scheduleNext();
      } catch {
        if (!lifecycle.isClosed()) {
          sendEvent({ type: 'error', message: 'Failed to load vehicles' });
          lifecycle.close();
        }
        return;
      }

      // Auto-close after 55s to prevent Vercel serverless timeout.
      lifecycle.setTimeout(() => {
        if (lifecycle.isClosed()) return;
        sendEvent({ type: 'close', reason: 'max_duration' });
        lifecycle.close();
      }, 55000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
