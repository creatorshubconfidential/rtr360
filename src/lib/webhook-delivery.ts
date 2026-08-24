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
import dns from 'node:dns/promises';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptSecret } from '@/lib/crypto';
import { metrics, METRIC_NAMES } from '@/lib/metrics';

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

  // Block IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  if (/^::ffff:/i.test(hostname)) {
    return 'Connections to IPv4-mapped IPv6 addresses are not allowed';
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

  // Catch-all: Block IP-literal hostnames via comprehensive private IP checks.
  // This closes the gap where resolveAndCheckDns skips IP literals (line ~237).
  // Must be LAST so that specific error messages above take priority.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      return 'Connections to private/reserved IP addresses are not allowed';
    }
  }
  if (hostname.includes(':') && isPrivateIPv6(hostname)) {
    return 'Connections to private/reserved IPv6 addresses are not allowed';
  }

  return null; // URL is safe
}

// ── DNS Resolution-Based SSRF Check ───────────────────────────

/**
 * Check if an IPv4 address is private/internal.
 * Covers: loopback, link-local, private ranges, multicast, reserved.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;

  // 0.0.0.0/8 — Current network
  if (parts[0] === 0) return true;
  // 10.0.0.0/8 — Private
  if (parts[0] === 10) return true;
  // 100.64.0.0/10 — Carrier-grade NAT
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  // 127.0.0.0/8 — Loopback
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 — Link-local
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 172.16.0.0/12 — Private
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.0.0.0/24 — IETF Protocol Assignments
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 — Documentation (TEST-NET-1)
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
  // 192.88.99.0/24 — IPv6 to IPv4 relay
  if (parts[0] === 192 && parts[1] === 88 && parts[2] === 99) return true;
  // 192.168.0.0/16 — Private
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 198.18.0.0/15 — Benchmarking
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  // 198.51.100.0/24 — Documentation (TEST-NET-2)
  if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 — Documentation (TEST-NET-3)
  if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 — Multicast
  if (parts[0] >= 224 && parts[0] <= 239) return true;
  // 240.0.0.0/4 — Reserved
  if (parts[0] >= 240) return true;

  return false;
}

/**
 * Check if an IPv6 address is private/internal.
 * Simplified check for common private ranges.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::1 — Loopback
  if (lower === '::1') return true;
  // :: — Unspecified
  if (lower === '::') return true;
  // fe80::/10 — Link-local
  if (lower.startsWith('fe80:') || lower.startsWith('fe80')) return true;
  // fc00::/7 — Unique local (fc and fd)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // ::ffff:0:0/96 — IPv4-mapped IPv6 (check the IPv4 part)
  if (lower.startsWith('::ffff:')) {
    const v4Part = lower.slice(7);
    // Handle bracketed form ::ffff:127.0.0.1
    const v4Clean = v4Part.replace(/^\[/, '').replace(/\]$/, '');
    return isPrivateIPv4(v4Clean);
  }

  return false;
}

/**
 * DNS rebinding protection via actual DNS resolution.
 *
 * Resolves the hostname to ALL IPv4 and IPv6 addresses.
 * If ANY resolved address is private/internal, the URL is blocked.
 * This closes the gap where hostname-level checks pass but DNS
 * resolves to a private IP (DNS rebinding attack).
 *
 * LIMITATION: There is a TOCTOU race between resolution and connection.
 * The fetch API does not allow pinning a specific IP address while
 * preserving TLS SNI. A fully complete solution would require a
 * custom HTTP client. This is documented as a known limitation.
 *
 * Returns null if all resolved addresses are public, or an error message.
 */
export async function resolveAndCheckDns(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  // Skip IP-literal URLs (already checked by checkSsrf)
  const hostname = parsed.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith('[')) {
    return null; // Pure IP — already validated by checkSsrf
  }

  const privateAddresses: string[] = [];

  // Resolve IPv4 (A records)
  try {
    const v4Addresses = await dns.resolve4(hostname);
    for (const addr of v4Addresses) {
      if (isPrivateIPv4(addr)) {
        privateAddresses.push(addr);
      }
    }
  } catch {
    // DNS resolution failure — transient, don't block on DNS errors
    // checkSsrf already handled hostname patterns
  }

  // Resolve IPv6 (AAAA records)
  try {
    const v6Addresses = await dns.resolve6(hostname);
    for (const addr of v6Addresses) {
      if (isPrivateIPv6(addr)) {
        privateAddresses.push(addr);
      }
    }
  } catch {
    // DNS resolution failure — transient
  }

  if (privateAddresses.length > 0) {
    return `DNS resolved to private address(es): ${privateAddresses.join(', ')} (possible DNS rebinding)`;
  }

  return null;
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

  // 1. SSRF protection (hostname-level checks)
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

    try {
      metrics.increment(METRIC_NAMES.WEBHOOK_DNS_BLOCKED, { organizationId });
    } catch { /* metrics must never break business logic */ }

    throw new Error(`[PERMANENT] SSRF blocked: ${ssrfError}`);
  }

  // 1b. DNS resolution check (anti-rebinding)
  const dnsError = await resolveAndCheckDns(url);
  if (dnsError) {
    logger.security('webhook.dns_rebinding_blocked', {
      endpointId,
      eventId,
      reason: dnsError,
      organizationId,
      requestId,
    });

    await updateDeliveryRecord(endpointId, eventId, {
      status: 'failed',
      lastError: `DNS rebinding blocked: ${dnsError}`,
    });

    try {
      metrics.increment(METRIC_NAMES.WEBHOOK_DNS_BLOCKED, { organizationId });
    } catch { /* metrics must never break business logic */ }

    throw new Error(`[PERMANENT] DNS rebinding blocked: ${dnsError}`);
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

  // 6. Emit metrics
  try {
    if (deliveryStatus === 'delivered') {
      metrics.increment(METRIC_NAMES.WEBHOOK_SUCCESS, { organizationId });
      metrics.timing(METRIC_NAMES.WEBHOOK_LATENCY, durationMs, { organizationId });
    } else {
      metrics.increment(METRIC_NAMES.WEBHOOK_FAILURE, { organizationId, statusCode: statusCode ?? 0 });
    }
  } catch { /* metrics must never break business logic */ }

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
      const secret = decryptSecret(endpoint.secret);
      await deliverWebhook({
        endpointId: delivery.endpointId,
        eventId: delivery.eventId,
        url: endpoint.url,
        secret,
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