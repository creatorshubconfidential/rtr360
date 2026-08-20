/**
 * RTR 360 — Webhook Delivery Engine
 *
 * Handles the actual HTTP delivery of webhook events.
 * Includes:
 *   - HMAC-SHA256 signature generation
 *   - SSRF protection (blocks private/internal IPs)
 *   - Configurable timeout
 *   - Retry classification (transient vs permanent)
 *   - Delivery state tracking via WebhookDelivery table
 *   - Idempotency via (endpointId, eventId) unique constraint
 *   - Secret redaction in all logs
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ── Types ──────────────────────────────────────────────────────

export interface WebhookDeliveryResult {
  status: string;
  statusCode: number | null;
  durationMs: number;
}

interface DeliveryParams {
  endpointId: string;
  eventId: string;
  url: string;
  secret: string;
  payload: Record<string, unknown>;
  organizationId: string;
  requestId?: string | null;
}

// ── Configuration ──────────────────────────────────────────────

const WEBHOOK_TIMEOUT_MS = 15_000;
const MAX_PAYLOAD_SIZE_BYTES = 512_000; // 512 KB
const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

// ── SSRF Protection ────────────────────────────────────────────

/**
 * Check if a URL targets a private/internal network.
 * Blocks: localhost, loopback, link-local, private IPv4, private IPv6,
 * metadata endpoints, and non-HTTP protocols.
 *
 * Returns null if the URL is safe, or an error message if blocked.
 */
export function checkSsrf(url: string): string | null {
  // Only allow http and https
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Protocol '${parsed.protocol}' is not allowed. Only http and https are permitted.`;
  }

  const rawHostname = parsed.hostname.toLowerCase();
  // URL.hostname may include brackets for IPv6 (e.g., "[::1]")
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
    ? rawHostname.slice(1, -1)
    : rawHostname;

  // Block localhost variants
  if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
    return 'Connections to localhost are not allowed';
  }

  // Block IPv4 loopback
  if (hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return 'Connections to loopback addresses are not allowed';
  }

  // Block IPv6 loopback
  if (hostname === '::1' || hostname === '::') {
    return 'Connections to IPv6 loopback are not allowed';
  }

  // Block AWS/GCP/Azure metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal' ||
      hostname.endsWith('.metadata.azure.com')) {
    return 'Connections to cloud metadata endpoints are not allowed';
  }

  // Block private IPv4 ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  if (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    return 'Connections to private IP addresses are not allowed';
  }

  // Block link-local: 169.254.x.x (except metadata already checked above)
  if (/^169\.254\./.test(hostname)) {
    return 'Connections to link-local addresses are not allowed';
  }

  // Block IPv6 private ranges (simplified)
  if (
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname === 'fe80::1' ||
    hostname.startsWith('fe80:')
  ) {
    return 'Connections to IPv6 private addresses are not allowed';
  }

  // Block internal DNS names commonly used in corporate environments
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
    return `Connections to internal DNS name '${hostname}' are not allowed`;
  }

  // Block common service discovery names
  if (
    hostname.endsWith('.svc.cluster.local') ||
    hostname === 'kubernetes.default' ||
    hostname === 'kubernetes.default.svc'
  ) {
    return 'Connections to Kubernetes internal services are not allowed';
  }

  return null; // URL is safe
}

// ── Signature Generation ───────────────────────────────────────

/**
 * Generate an HMAC-SHA256 signature for a webhook payload.
 * Format: timestamp.payload
 * The timestamp prevents replay attacks within the tolerance window.
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
): { signature: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const material = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(material).digest('hex');
  return { signature, timestamp };
}

/**
 * Verify a webhook signature using constant-time comparison.
 * Returns true if the signature is valid and within the timestamp tolerance.
 */
export function verifyWebhookSignature(
  payload: string,
  secret: string,
  signature: string,
  timestamp: number,
): boolean {
  // Check timestamp freshness
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const material = `${timestamp}.${payload}`;
  const expected = createHmac('sha256', secret).update(material).digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

// ── Delivery ────────────────────────────────────────────────────

/**
 * Deliver a webhook event to an external endpoint.
 * Includes SSRF check, signing, timeout, and delivery record update.
 */
export async function deliverWebhook(params: DeliveryParams): Promise<WebhookDeliveryResult> {
  const { endpointId, eventId, url, secret, payload, organizationId, requestId } = params;
  const startTime = Date.now();

  // 1. SSRF protection
  const ssrfError = checkSsrf(url);
  if (ssrfError) {
    logger.security('webhook.ssrf_blocked', {
      endpointId,
      eventId,
      url: url.replace(/\/\/[^@]+@/, '//[REDACTED_USER]@'),
      reason: ssrfError,
      organizationId,
      requestId,
    });

    await updateDeliveryRecord(endpointId, eventId, {
      status: 'failed',
      lastError: `SSRF blocked: ${ssrfError}`,
    });

    throw new Error(`[PERMANENT] SSRF blocked: ${ssrfError}`);
  }

  // 2. Serialize and sign payload
  const payloadStr = JSON.stringify(payload);

  if (Buffer.byteLength(payloadStr) > MAX_PAYLOAD_SIZE_BYTES) {
    await updateDeliveryRecord(endpointId, eventId, {
      status: 'failed',
      lastError: `Payload too large: ${Buffer.byteLength(payloadStr)} bytes (max ${MAX_PAYLOAD_SIZE_BYTES})`,
    });
    throw new Error(`[PERMANENT] Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE_BYTES} bytes`);
  }

  const { signature, timestamp } = generateWebhookSignature(payloadStr, secret);

  // 3. HTTP delivery with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let deliveryStatus = 'failed';
  let deliveryError: string | null = null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-Event-Id': eventId,
        'X-Webhook-Delivery': 'rtr360',
        'User-Agent': 'RTR360-Webhook/1.0',
      },
      body: payloadStr,
      signal: controller.signal,
      redirect: 'error', // Do NOT follow redirects
    });

    statusCode = response.status;
    responseBody = await response.text();

    if (response.status >= 200 && response.status < 300) {
      deliveryStatus = 'delivered';
    } else if (response.status >= 400 && response.status < 500) {
      deliveryStatus = 'failed';
      deliveryError = `HTTP ${response.status}: ${responseBody.slice(0, 500)}`;
    } else {
      // 5xx, network errors — transient, will retry
      deliveryStatus = 'failed';
      deliveryError = `HTTP ${response.status}: ${responseBody.slice(0, 500)}`;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      deliveryError = `Request timed out after ${WEBHOOK_TIMEOUT_MS}ms`;
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      deliveryError = msg.slice(0, 1000);
    }
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - startTime;

  // 4. Update delivery record
  await updateDeliveryRecord(endpointId, eventId, {
    status: deliveryStatus,
    statusCode,
    response: responseBody?.slice(0, 2000) ?? null,
    lastError: deliveryError,
    deliveredAt: deliveryStatus === 'delivered' ? new Date() : undefined,
  });

  // 5. Log (never log the secret or full payload)
  logger.info('webhook.delivery_finished', {
    endpointId,
    eventId,
    organizationId,
    status: deliveryStatus,
    statusCode,
    durationMs,
    requestId,
  });

  return { status: deliveryStatus, statusCode, durationMs };
}

// ── Retry Failed Deliveries ────────────────────────────────────

/**
 * Find and retry failed webhook deliveries that are due.
 * Called by the worker or a scheduled task.
 */
export async function retryFailedDeliveries(
  organizationId?: string | null,
  limit: number = 10,
): Promise<number> {
 const where: Record<string, unknown> = {
    status: 'failed',
    nextRetryAt: { lte: new Date() },
  };
  if (organizationId) {
    where.organizationId = organizationId;
  }

  const deliveries = await db.webhookDelivery.findMany({
    where,
    select: {
      id: true,
      endpointId: true,
      eventId: true,
      eventType: true,
      payload: true,
      organizationId: true,
      attempt: true,
      maxAttempts: true,
    },
    take: limit,
  });

  let retried = 0;
  for (const delivery of deliveries) {
    if (delivery.attempt >= delivery.maxAttempts) continue;

    const endpoint = await db.webhookEndpoint.findUnique({
      where: { id: delivery.endpointId },
      select: { url: true, secret: true, active: true },
    });
    if (!endpoint || !endpoint.active) continue;

    try {
      await deliverWebhook({
        endpointId: delivery.endpointId,
        eventId: delivery.eventId,
        url: endpoint.url,
        secret: endpoint.secret,
        payload: delivery.payload as Record<string, unknown>,
        organizationId: delivery.organizationId,
      });

      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { attempt: { increment: 1 } },
      });

      retried++;
    } catch {
      // Delivery engine already recorded the error
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempt: { increment: 1 },
          lastError: 'Retry failed',
        },
      });
    }
  }

  return retried;
}

// ── Helpers ────────────────────────────────────────────────────

interface DeliveryUpdate {
  status: string;
  statusCode?: number | null;
  response?: string | null;
  lastError?: string | null;
  deliveredAt?: Date;
}

async function updateDeliveryRecord(
  endpointId: string,
  eventId: string,
  update: DeliveryUpdate,
): Promise<void> {
  try {
    await db.webhookDelivery.updateMany({
      where: { endpointId, eventId },
      data: update,
    });
  } catch (error) {
    logger.error('webhook.delivery_record_update_failed', {
      endpointId,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}