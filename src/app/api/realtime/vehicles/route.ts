import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

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
      let interval: ReturnType<typeof setInterval>;
      let tick = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial full state
      try {
        const vehicles = await db.vehicle.findMany({
          where: { ...orgFilter, status: 'active' },
          include: {
            driver: { select: { name: true } },
            device: { select: { imei: true, status: true, lastPingAt: true } },
          },
        });

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

        // Stream updates every 3 seconds
        interval = setInterval(async () => {
          tick++;
          try {
            // Update positions with small random movements
            const updates = vehicleStates.map((vs) => {
              if (vs.status === 'idle') return null;
              // Simulate movement
              const headingRad = (vs.heading * Math.PI) / 180;
              const speedKmPerTick = (vs.speed / 3600) * 3; // km per 3s tick
              const latDelta = (speedKmPerTick / 111.32) * Math.cos(headingRad);
              const lngDelta = (speedKmPerTick / (111.32 * Math.cos((vs.lat * Math.PI) / 180))) * Math.sin(headingRad);

              vs.lat = Math.round((vs.lat + latDelta + (Math.random() - 0.5) * 0.001) * 10000) / 10000;
              vs.lng = Math.round((vs.lng + lngDelta + (Math.random() - 0.5) * 0.001) * 10000) / 10000;
              vs.speed = Math.max(0, Math.min(120, vs.speed + Math.round((Math.random() - 0.5) * 10)));
              vs.heading = (vs.heading + Math.round((Math.random() - 0.5) * 20) + 360) % 360;
              vs.fuel = Math.max(10, vs.fuel - (Math.random() > 0.8 ? 1 : 0));
              vs.timestamp = new Date().toISOString();

              // Occasionally toggle status
              if (Math.random() > 0.95) vs.status = vs.status === 'moving' ? 'idle' : 'moving';

              return { ...vs };
            }).filter(Boolean);

            // Every 10th tick, send fresh vehicle count from DB
            if (tick % 10 === 0) {
              const freshCount = await db.vehicle.count({ where: { ...orgFilter, status: 'active' } });
              sendEvent({ type: 'stats', activeVehicles: freshCount, tick });
            }

            sendEvent({ type: 'update', vehicles: updates, tick });
          } catch (err) {
            // DB error — keep streaming with simulated data
            sendEvent({ type: 'heartbeat', tick });
          }
        }, 3000);
      } catch (err) {
        sendEvent({ type: 'error', message: 'Failed to load vehicles' });
        controller.close();
        return;
      }

      // Clean up on close
      // Auto-close after 55s to prevent Vercel 300s serverless timeout
      const maxDuration = setTimeout(() => {
        clearInterval(interval);
        controller.enqueue(encoder.encode(`event: close\ndata: {\"reason\": \"max_duration\"}\n\n`));
        controller.close();
      }, 55000);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        clearTimeout(maxDuration);
        controller.close();
      });
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
