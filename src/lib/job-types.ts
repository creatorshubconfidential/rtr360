/**
 * RTR 360 — Job Type Registry
 *
 * Defines all supported background job types with strongly-typed payloads.
 * Each job type has a Zod schema for payload validation.
 *
 * ONLY job types that actually exist in RTR360 requirements are included.
 * Workers must be registered here before they can be enqueued.
 */

import { z } from 'zod';

// ── Job Status Constants ──────────────────────────────────────

export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

// ── Job Priority Constants ────────────────────────────────────
// Lower number = higher priority. 1 is highest, 10 is lowest.

export const JOB_PRIORITY = {
  CRITICAL: 1,
  HIGH: 3,
  NORMAL: 5,
  LOW: 8,
  DEFERRED: 10,
} as const;

// ── Payload Schemas ────────────────────────────────────────────

/** Send an email (e.g., invoice, quotation PDF, alerts) */
export const emailPayloadSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  templateId: z.string().min(1),
  templateData: z.record(z.string(), z.unknown()).optional(),
  replyTo: z.string().email().optional(),
});

/** Deliver a webhook event to an external endpoint */
export const webhookPayloadSchema = z.object({
  endpointId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

/** Send an in-app notification to one or more users */
export const notificationPayloadSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  type: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Generate and export a report (PDF, CSV, Excel) */
export const reportPayloadSchema = z.object({
  reportType: z.string().min(1),
  format: z.enum(['pdf', 'csv', 'xlsx']),
  filters: z.record(z.string(), z.unknown()).optional(),
  requestedBy: z.string().min(1),
});

/** Run a maintenance-scheduled operation (e.g., data cleanup, aggregate refresh) */
export const maintenancePayloadSchema = z.object({
  task: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** Process an AI-related task (e.g., batch analysis, embedding generation) */
export const aiPayloadSchema = z.object({
  task: z.string().min(1),
  conversationId: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

// ── Job Type Registry ──────────────────────────────────────────

export type JobTypeConfig = {
  type: string;
  description: string;
  payloadSchema: z.ZodType;
  defaultMaxAttempts: number;
  defaultPriority: number;
};

/**
 * Central registry of all supported job types.
 * To add a new job type: define its schema above, then add an entry here.
 */
export const JOB_TYPES: Readonly<Record<string, JobTypeConfig>> = {
  email: {
    type: 'email',
    description: 'Send transactional email (invoice, quotation, alerts)',
    payloadSchema: emailPayloadSchema,
    defaultMaxAttempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
  },
  webhook: {
    type: 'webhook',
    description: 'Deliver webhook event to external endpoint',
    payloadSchema: webhookPayloadSchema,
    defaultMaxAttempts: 5,
    defaultPriority: JOB_PRIORITY.HIGH,
  },
  notification: {
    type: 'notification',
    description: 'Send in-app notification to users',
    payloadSchema: notificationPayloadSchema,
    defaultMaxAttempts: 2,
    defaultPriority: JOB_PRIORITY.LOW,
  },
  report: {
    type: 'report',
    description: 'Generate and export a report (PDF, CSV, Excel)',
    payloadSchema: reportPayloadSchema,
    defaultMaxAttempts: 2,
    defaultPriority: JOB_PRIORITY.LOW,
  },
  maintenance: {
    type: 'maintenance',
    description: 'Scheduled maintenance tasks (cleanup, aggregation)',
    payloadSchema: maintenancePayloadSchema,
    defaultMaxAttempts: 1,
    defaultPriority: JOB_PRIORITY.DEFERRED,
  },
  ai: {
    type: 'ai',
    description: 'AI processing tasks (batch analysis, embeddings)',
    payloadSchema: aiPayloadSchema,
    defaultMaxAttempts: 2,
    defaultPriority: JOB_PRIORITY.NORMAL,
  },
};

// ── Inferred Payload Types ─────────────────────────────────────

export type EmailPayload = z.infer<typeof emailPayloadSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
export type ReportPayload = z.infer<typeof reportPayloadSchema>;
export type MaintenancePayload = z.infer<typeof maintenancePayloadSchema>;
export type AiPayload = z.infer<typeof aiPayloadSchema>;

/**
 * Validate a job type and its payload.
 * Returns the validated payload or an error message.
 */
export function validateJobPayload(
  type: string,
  payload: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const config = JOB_TYPES[type];
  if (!config) {
    return { success: false, error: `Unknown job type: '${type}'` };
  }

  const result = config.payloadSchema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return { success: false, error: `Invalid payload: ${issues.join(', ')}` };
  }

  return { success: true, data: result.data };
}

/**
 * Get a registered job type config. Returns undefined for unknown types.
 */
export function getJobTypeConfig(type: string): JobTypeConfig | undefined {
  return JOB_TYPES[type];
}
