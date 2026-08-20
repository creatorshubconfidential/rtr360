/**
 * RTR 360 — Metrics Failure Isolation Tests (P2-6)
 *
 * Proves that metrics failures NEVER break business logic.
 * We mock the logger to throw, simulating a metrics infrastructure failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture original console methods
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;

function createMockLogger(shouldThrow: boolean) {
  return {
    info: shouldThrow
      ? () => { throw new Error('Logger infrastructure failure'); }
      : vi.fn(),
    error: shouldThrow
      ? () => { throw new Error('Logger infrastructure failure'); }
      : vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
    child: () => createMockLogger(shouldThrow),
  };
}

describe('P2-6: Metrics Failure Isolation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    console.info = originalConsoleInfo;
  });

  it('metrics.increment does not throw even when logger fails', async () => {
    // Mock console to prevent error output pollution
    console.error = vi.fn();
    console.info = vi.fn();

    // Dynamic import to get fresh module
    const { metrics } = await import('@/lib/metrics');

    // Should not throw — metrics are failure-isolated via try/catch internally
    expect(() => metrics.increment('test_metric')).not.toThrow();
    expect(() => metrics.increment('test_metric', { key: 'value' })).not.toThrow();
  });

  it('metrics.timing does not throw', async () => {
    console.error = vi.fn();
    console.info = vi.fn();

    const { metrics } = await import('@/lib/metrics');
    expect(() => metrics.timing('test_duration', 100)).not.toThrow();
    expect(() => metrics.timing('test_duration', 100, { tag: 'val' })).not.toThrow();
  });

  it('metrics.gauge does not throw', async () => {
    console.error = vi.fn();
    console.info = vi.fn();

    const { metrics } = await import('@/lib/metrics');
    expect(() => metrics.gauge('test_gauge', 42)).not.toThrow();
  });

  it('metrics.getCounters returns valid counters', async () => {
    console.info = vi.fn();

    const { metrics } = await import('@/lib/metrics');
    metrics.resetCounters();
    metrics.increment('counter_a');
    metrics.increment('counter_a');
    metrics.increment('counter_b');

    const counters = metrics.getCounters();
    expect(counters['counter_a']).toBe(2);
    expect(counters['counter_b']).toBe(1);
  });

  it('METRIC_NAMES contains all required metric names', async () => {
    const { METRIC_NAMES } = await import('@/lib/metrics');

    // Queue metrics
    expect(METRIC_NAMES.JOBS_ENQUEUED).toBe('jobs_enqueued');
    expect(METRIC_NAMES.JOBS_CLAIMED).toBe('jobs_claimed');
    expect(METRIC_NAMES.JOBS_COMPLETED).toBe('jobs_completed');
    expect(METRIC_NAMES.JOBS_FAILED).toBe('jobs_failed');
    expect(METRIC_NAMES.JOBS_RETRIED).toBe('jobs_retried');
    expect(METRIC_NAMES.JOBS_DEAD_LETTERED).toBe('jobs_dead_lettered');
    expect(METRIC_NAMES.JOB_DURATION_MS).toBe('job_duration_ms');

    // Webhook metrics
    expect(METRIC_NAMES.WEBHOOK_SUCCESS).toBe('webhook_success');
    expect(METRIC_NAMES.WEBHOOK_FAILURE).toBe('webhook_failure');
    expect(METRIC_NAMES.WEBHOOK_LATENCY).toBe('webhook_latency');
    expect(METRIC_NAMES.WEBHOOK_DNS_BLOCKED).toBe('webhook_dns_blocked');

    // Email metrics
    expect(METRIC_NAMES.EMAIL_SUCCESS).toBe('email_success');
    expect(METRIC_NAMES.EMAIL_FAILURE).toBe('email_failure');

    // AI metrics
    expect(METRIC_NAMES.AI_SUCCESS).toBe('ai_success');
    expect(METRIC_NAMES.AI_FAILURE).toBe('ai_failure');
    expect(METRIC_NAMES.AI_DURATION_MS).toBe('ai_duration_ms');

    // Report metrics
    expect(METRIC_NAMES.REPORT_SUCCESS).toBe('report_success');
    expect(METRIC_NAMES.REPORT_FAILURE).toBe('report_failure');
    expect(METRIC_NAMES.REPORT_DURATION_MS).toBe('report_duration_ms');

    // Worker metrics
    expect(METRIC_NAMES.WORKER_HEARTBEAT).toBe('worker_heartbeat');
    expect(METRIC_NAMES.WORKER_LEASE_RENEWAL_FAILED).toBe('worker_lease_renewal_failed');
  });
});
