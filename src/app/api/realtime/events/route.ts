import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createSseLifecycle } from '@/lib/realtime/sse-lifecycle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Simulated real-time events stream (alerts, maintenance due, speed violations)
export async function GET(request: Request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const lifecycle = createSseLifecycle(controller, encoder, request.signal);
      let eventId = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendEvent = (event: any) => {
        if (lifecycle.isClosed()) return false;
        eventId++;
        return lifecycle.send(`id: ${eventId}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      // Send initial connection event
      sendEvent({ type: 'connected', message: 'Real-time events connected', timestamp: new Date().toISOString() });

      // Generate simulated events every 8-15 seconds. The scheduler is
      // lifecycle-owned and never schedules another tick after shutdown.
      const scheduleNext = () => {
        if (lifecycle.isClosed()) return;
        const delay = 8000 + Math.random() * 7000;
        lifecycle.setTimeout(async () => {
          if (lifecycle.isClosed()) return;

          try {
            const vehicles = await db.vehicle.findMany({
              where: orgFilter,
              select: { id: true, plateNumber: true, organizationId: true },
              take: 20,
            });

            // The DB operation may finish after the client disconnects.
            if (lifecycle.isClosed()) return;
            if (vehicles.length === 0) {
              scheduleNext();
              return;
            }

            const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
            const eventTypes = [
              { type: 'speed_violation', severity: 'medium', template: (p: string) => `Speed violation detected — ${p} exceeded 120 km/h` },
              { type: 'geofence_exit', severity: 'high', template: (p: string) => `Vehicle ${p} exited designated geofence zone` },
              { type: 'idle_alert', severity: 'low', template: (p: string) => `Vehicle ${p} has been idle for more than 30 minutes` },
              { type: 'fuel_low', severity: 'medium', template: (p: string) => `Low fuel warning — ${p} fuel level below 20%` },
              { type: 'maintenance_reminder', severity: 'info', template: (p: string) => `Scheduled maintenance reminder for ${p}` },
              { type: 'harsh_braking', severity: 'medium', template: (p: string) => `Harsh braking event detected on ${p}` },
            ];

            const evt = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            sendEvent({
              type: evt.type,
              severity: evt.severity,
              vehicleId: vehicle.id,
              vehiclePlate: vehicle.plateNumber,
              message: evt.template(vehicle.plateNumber),
              timestamp: new Date().toISOString(),
            });
          } catch {
            // Keep the connection alive, but never write to a closed stream.
          }

          if (!lifecycle.isClosed()) scheduleNext();
        }, delay);
      };
      scheduleNext();

      // Heartbeat is lifecycle-owned; cleanup cancels it before another write.
      lifecycle.setInterval(() => {
        lifecycle.send(': heartbeat\n\n');
      }, 30000);

      // Auto-close after 55s to prevent Vercel serverless timeout.
      lifecycle.setTimeout(() => {
        if (lifecycle.isClosed()) return;
        lifecycle.send('event: close\ndata: {"reason":"max_duration"}\n\n');
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
