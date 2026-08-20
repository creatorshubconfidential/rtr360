/**
 * RTR 360 — Operational Metrics
 *
 * Lightweight metrics collection using structured logs.
 * No external monitoring dependency required.
 * Integrates with existing logger.
 *
 * Usage:
 *   import { metrics } from '@/lib/metrics';
 *   metrics.increment('jobs_enqueued', { jobType: 'email' });
 *   metrics.timing('job_duration_ms', 150, { jobType: 'webhook' });
 */

import { logger } from '@/lib/logger';

// ── Types ────────────────────────────────────────────────────

interface MetricEvent {
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
  [key: string]: unknown;
}

// ── Counter Registry ─────────────────────────────────────────

const counters = new Map<string, number>();

// ── Metrics API ──────────────────────────────────────────────

/**
 * Increment a counter metric.
 * Emits a structured log with type 'metric'.
 */
function increment(name: string, tags: Record<string, unknown> = {}): void {
  const current = counters.get(name) ?? 0;
  counters.set(name, current + 1);

  const event: MetricEvent = {
    metric: name,
    value: 1,
    unit: 'count',
    timestamp: new Date().toISOString(),
    ...tags,
  };

  logger.info('metric', event);
}

/**
 * Record a timing/duration metric (milliseconds).
 */
function timing(name: string, valueMs: number, tags: Record<string, unknown> = {}): void {
  const event: MetricEvent = {
    metric: name,
    value: valueMs,
    unit: 'ms',
    timestamp: new Date().toISOString(),
    ...tags,
  };

  logger.info('metric', event);
}

/**
 * Record a gauge value (current state, can go up or down).
 */
function gauge(name: string, value: number, tags: Record<string, unknown> = {}): void {
  const event: MetricEvent = {
    metric: name,
    value,
    unit: 'gauge',
    timestamp: new Date().toISOString(),
    ...tags,
  };

  logger.info('metric', event);
}

/**
 * Get all current counter values (for health/monitoring endpoints).
 */
function getCounters(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of counters) {
    result[key] = value;
  }
  return result;
}

/**
 * Reset all counters (for testing).
 */
function resetCounters(): void {
  counters.clear();
}

// ── Predefined Metric Names ─────────────────────────────────

export const METRIC_NAMES = {
  // Queue
  JOBS_ENQUEUED: 'jobs_enqueued',
  JOBS_CLAIMED: 'jobs_claimed',
  JOBS_COMPLETED: 'jobs_completed',
  JOBS_FAILED: 'jobs_failed',
  JOBS_RETRIED: 'jobs_retried',
  JOBS_DEAD_LETTERED: 'jobs_dead_lettered',
  JOBS_CANCELLED: 'jobs_cancelled',
  JOB_DURATION_MS: 'job_duration_ms',
  QUEUE_DEPTH: 'queue_depth',
  PROCESSING_JOBS: 'processing_jobs',

  // Webhook
  WEBHOOK_SUCCESS: 'webhook_success',
  WEBHOOK_FAILURE: 'webhook_failure',
  WEBHOOK_RETRY: 'webhook_retry',
  WEBHOOK_LATENCY: 'webhook_latency',
  WEBHOOK_DNS_BLOCKED: 'webhook_dns_blocked',

  // Email
  EMAIL_SUCCESS: 'email_success',
  EMAIL_FAILURE: 'email_failure',
  EMAIL_RETRY: 'email_retry',

  // AI
  AI_SUCCESS: 'ai_success',
  AI_FAILURE: 'ai_failure',
  AI_TIMEOUT: 'ai_timeout',
  AI_DURATION_MS: 'ai_duration_ms',

  // Report
  REPORT_SUCCESS: 'report_success',
  REPORT_FAILURE: 'report_failure',
  REPORT_DURATION_MS: 'report_duration_ms',

  // Worker
  WORKER_HEARTBEAT: 'worker_heartbeat',
  WORKER_LEASE_RENEWED: 'worker_lease_renewed',
  WORKER_LEASE_RENEWAL_FAILED: 'worker_lease_renewal_failed',
} as const;

export const metrics = {
  increment,
  timing,
  gauge,
  getCounters,
  resetCounters,
} as const;
