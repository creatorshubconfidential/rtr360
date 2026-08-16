import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Simulated real-time events stream (alerts, maintenance due, speed violations)
export async function GET(request: Request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let interval: ReturnType<typeof setInterval>;
      let eventId = 0;

      const sendEvent = (event: any) => {
        eventId++;
        controller.enqueue(encoder.encode(`id: ${eventId}\ndata: ${JSON.stringify(event)}\n\n`));
      };

      // Send initial connection event
      sendEvent({ type: 'connected', message: 'Real-time events connected', timestamp: new Date().toISOString() });

      // Generate simulated events every 8-15 seconds
      const generateEvent = async () => {
        try {
          const vehicles = await db.vehicle.findMany({
            where: orgFilter,
            select: { id: true, plateNumber: true },
            take: 20,
          });

          if (vehicles.length === 0) return;

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
          // Keep connection alive
        }
      };

      // Send first event after 5s, then random intervals
      const scheduleNext = () => {
        const delay = 8000 + Math.random() * 7000; // 8-15 seconds
        interval = setTimeout(async () => {
          await generateEvent();
          scheduleNext();
        }, delay);
      };
      scheduleNext();

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 30000);

      request.signal.addEventListener('abort', () => {
        clearTimeout(interval);
        clearInterval(heartbeat);
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
