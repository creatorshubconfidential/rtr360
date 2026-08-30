import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createSseLifecycle } from '@/lib/realtime/sse-lifecycle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// UAE locations for simulation
const UAE_LOCATIONS = [
  { lat: 25.276987, lng: 55.296249, name: 'Dubai Deira' },
  { lat: 25.204849, lng: 55.270783, name: 'Sheikh Zayed Road' },
  { lat: 25.141, lng: 55.185, name: 'Dubai Marina' },
  { lat: 25.1185, lng: 55.3785, name: 'Dubai Airport' },
  { lat: 25.35, lng: 55.39, name: 'Sharjah' },
  { lat: 24.4539, lng: 54.3773, name: 'Abu Dhabi' },
  { lat: 25.42, lng: 55.48, name: 'Ajman' },
  { lat: 25.79, lng: 55.98, name: 'Ras Al Khaimah' },
];

export async function GET(request: Request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const lifecycle = createSseLifecycle(controller, encoder, request.signal);
      let tick = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendEvent = (data: any) => lifecycle.send(`data: ${JSON.stringify(data)}\n\n`);

      // Initial full state
      try {
        const vehicles = await db.vehicle.findMany({
          where: { ...orgFilter, status: 'active' },
          include: {
            driver: { select: { name: true } },
            device: { select: { imei: true, status: true, lastPingAt: true } },
          },
        });

        if (lifecycle.isClosed()) return;

        const vehicleStates = vehicles.map((v, i) => {
          const loc = UAE_LOCATIONS[i % UAE_LOCATIONS.length];
          return {
            id: v.id,
            plateNumber: v.plateNumber,
            make: v.make,
            model: v.model,
            driver: v.driver?.name || null,
            imei: v.device?.imei || null,
            lat: loc.lat + (Math.random() - 0.5) * 0.02,
            lng: loc.lng + (Math.random() - 0.5) * 0.02,
            speed: Math.round(Math.random() * 80 + 20),
            heading: Math.round(Math.random() * 360),
            status: Math.random() > 0.3 ? 'moving' : 'idle',
            fuel: Math.round(Math.random() * 40 + 60),
            timestamp: new Date().toISOString(),
          };
        });

        sendEvent({ type: 'init', vehicles: vehicleStates, total: vehicleStates.length });

        // Async recursive scheduling avoids overlapping setInterval callbacks.
        const scheduleNext = () => {
          if (lifecycle.isClosed()) return;

          lifecycle.setTimeout(async () => {
            if (lifecycle.isClosed()) return;
            tick++;

            try {
              const updates = vehicleStates.map((vs) => {
                if (vs.status === 'idle') return null;
                const headingRad = (vs.heading * Math.PI) / 180;
                const speedKmPerTick = (vs.speed / 3600) * 3;
                const latDelta = (speedKmPerTick / 111.32) * Math.cos(headingRad);
                const lngDelta = (speedKmPerTick / (111.32 * Math.cos((vs.lat * Math.PI) / 180))) * Math.sin(headingRad);

                vs.lat = Math.round((vs.lat + latDelta + (Math.random() - 0.5) * 0.001) * 10000) / 10000;
                vs.lng = Math.round((vs.lng + lngDelta + (Math.random() - 0.5) * 0.001) * 10000) / 10000;
                vs.speed = Math.max(0, Math.min(120, vs.speed + Math.round((Math.random() - 0.5) * 10)));
                vs.heading = (vs.heading + Math.round((Math.random() - 0.5) * 20) + 360) % 360;
                vs.fuel = Math.max(10, vs.fuel - (Math.random() > 0.8 ? 1 : 0));
                vs.timestamp = new Date().toISOString();

                if (Math.random() > 0.95) vs.status = vs.status === 'moving' ? 'idle' : 'moving';
                return { ...vs };
              }).filter(Boolean);

              // DB query may complete after the client disconnects.
              if (lifecycle.isClosed()) return;

              if (tick % 10 === 0) {
                const freshCount = await db.vehicle.count({ where: { ...orgFilter, status: 'active' } });
                if (lifecycle.isClosed()) return;
                sendEvent({ type: 'stats', activeVehicles: freshCount, tick });
              }

              if (!lifecycle.isClosed()) sendEvent({ type: 'update', vehicles: updates, tick });
            } catch {
              // DB error — keep streaming with simulated data, unless closed.
              if (!lifecycle.isClosed()) sendEvent({ type: 'heartbeat', tick });
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
