/**
 * RTR 360 — Webhook Delivery Handler (Job Handler)
 *
 * Handles the 'webhook' background job type.
 * Looks up the WebhookEndpoint, signs the payload, delivers via HTTP,
 * and records the result in WebhookDelivery.
 *
 * Delegates to webhook-delivery.ts for actual HTTP delivery + signing.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import type { ClaimedJob } from '@/lib/queue';
import { ValidationError, AppError, ErrorCode } from '@/lib/errors';
import { deliverWebhook, type WebhookDeliveryResult } from '@/lib/webhook-delivery';
import { decryptSecret } from '@/lib/crypto';
import { metrics, METRIC_NAMES } from '@/lib/metrics';

/**
 * Webhook job handler.
 * The payload contains endpointId, eventType, and payload.
 * Looks up the endpoint, verifies tenant ownership, delivers.
 */
export async function handleWebhookJob(job: ClaimedJob): Promise<WebhookDeliveryResult> {
  const payload = job.payload as Record<string, unknown>;
  const endpointId = String(payload.endpointId ?? '');
  const eventType = String(payload.eventType ?? '');
  const webhookPayload = (payload.payload ?? {}) as Record<string, unknown>;

  if (!endpointId) {
    throw new ValidationError('endpointId is required', [
      { field: 'endpointId', message: 'A valid endpoint ID is required' },
    ]);
  }

  if (!eventType) {
    throw new ValidationError('eventType is required', [
      { field: 'eventType', message: 'A valid event type is required' },
    ]);
  }

  // Verify tenant ownership of the endpoint
  const endpoint = await db.webhookEndpoint.findUnique({
    where: { id: endpointId },
    select: { id: true, organizationId: true, url: true, secret: true, active: true },
  });

  if (!endpoint) {
    throw new AppError(`Webhook endpoint '${endpointId}' not found`, ErrorCode.NOT_FOUND);
  }

  if (endpoint.organizationId !== job.organizationId) {
    logger.security('webhook.cross_tenant_access_attempt', {
      jobId: job.id,
      endpointId,
      jobOrgId: job.organizationId,
      endpointOrgId: endpoint.organizationId,
      requestId: job.requestId,
    });
    throw new AppError('Webhook endpoint not found', ErrorCode.NOT_FOUND);
  }

  if (!endpoint.active) {
    throw new AppError(`Webhook endpoint '${endpointId}' is inactive`, ErrorCode.VALIDATION);
  }

  // Generate a unique eventId for this delivery
  const eventId = `${job.id}-${job.attempt}`;

  // Check idempotency: has this exact event already been delivered to this endpoint?
  const existingDelivery = await db.webhookDelivery.findUnique({
    where: { endpointId_eventId: { endpointId, eventId } },
    select: { id: true, status: true },
  });

  if (existingDelivery) {
    logger.info('webhook.delivery_idempotent_skip', {
      jobId: job.id,
      endpointId,
      eventId,
      existingStatus: existingDelivery.status,
      requestId: job.requestId,
    });
    return { status: existingDelivery.status, statusCode: null, durationMs: 0 };
  }

  // Create delivery record
  await db.webhookDelivery.create({
    data: {
      endpointId,
      eventId,
      eventType,
      organizationId: job.organizationId!,
      payload: webhookPayload as Prisma.InputJsonValue,
      status: 'pending',
      attempt: 0,
      maxAttempts: 5,
    },
  });

  // Decrypt the webhook secret (supports both encrypted v1: and plaintext for migration)
  let secret: string;
  try {
    secret = decryptSecret(endpoint.secret);
  } catch (error) {
    logger.error('webhook.secret_decryption_failed', {
      jobId: job.id,
      endpointId,
      organizationId: job.organizationId,
      error: error instanceof Error ? error.message : String(error),
      requestId: job.requestId,
    });
    throw new AppError(
      'Failed to decrypt webhook secret — ENCRYPTION_MASTER_KEY may be misconfigured',
      ErrorCode.INTERNAL,
    );
  }

  // Deliver
  const result = await deliverWebhook({
    endpointId,
    eventId,
    url: endpoint.url,
    secret,
    payload: webhookPayload,
    organizationId: job.organizationId!,
    requestId: job.requestId,
  });

  logger.info('webhook.delivery_completed', {
    jobId: job.id,
    endpointId,
    eventId,
    status: result.status,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    organizationId: job.organizationId,
    requestId: job.requestId,
  });

  try {
    metrics.increment(METRIC_NAMES.WEBHOOK_SUCCESS, { organizationId: job.organizationId, eventType });
    metrics.timing(METRIC_NAMES.WEBHOOK_LATENCY, result.durationMs, { eventType });
  } catch { /* metrics must never break business logic */ }

  return result;
}
