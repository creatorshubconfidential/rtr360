/**
 * RTR 360 — Handler Registration
 *
 * Registers all production job handlers with the worker.
 * Call registerAllHandlers() once at application startup.
 * This is the ONLY place where job types are mapped to handlers.
 */

import { registerJobHandler, type JobHandler } from '@/lib/worker';
import { handleEmailJob } from '@/lib/handlers/email-handler';
import { handleNotificationJob } from '@/lib/handlers/notification-handler';
import { handleMaintenanceJob } from '@/lib/handlers/maintenance-handler';
import { handleWebhookJob } from '@/lib/handlers/webhook-handler';

/**
 * Register all production job handlers.
 * Must be called before the worker starts processing jobs.
 * Throws if a handler is already registered (prevents double-registration).
 */
export function registerAllHandlers(): void {
  const handlers: Array<{ type: string; handler: JobHandler }> = [
    { type: 'email', handler: handleEmailJob },
    { type: 'notification', handler: handleNotificationJob },
    { type: 'maintenance', handler: handleMaintenanceJob },
    { type: 'webhook', handler: handleWebhookJob },
  ];

  for (const { type, handler } of handlers) {
    registerJobHandler(type, handler);
  }
}
