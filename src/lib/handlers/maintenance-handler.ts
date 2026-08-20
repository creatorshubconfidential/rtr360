/**
 * RTR 360 — Maintenance Job Handler
 *
 * Executes scheduled maintenance tasks.
 * Task names are restricted to a known allowlist.
 * No dynamic execution — every task must be explicitly implemented.
 */

import { logger } from '@/lib/logger';
import type { ClaimedJob } from '@/lib/queue';
import { ValidationError } from '@/lib/errors';

// ── Allowed Maintenance Tasks ──────────────────────────────────

const ALLOWED_TASKS = new Set([
  'cleanup_expired_sessions',
  'cleanup_stale_rate_limits',
  'refresh_aggregate_stats',
  'cleanup_old_audit_logs',
  'reconcile_webhook_deliveries',
]) as ReadonlySet<string>;

// ── Task Implementations ────────────────────────────────────────

async function cleanupExpiredSessions(_orgId: string | null): Promise<{ cleaned: number }> {
  // Placeholder: in production, delete expired sessions older than threshold
  logger.info('maintenance.task_cleanup_sessions', {});
  return { cleaned: 0 };
}

async function cleanupStaleRateLimits(_orgId: string | null): Promise<{ cleaned: number }> {
  // Placeholder: in production, purge expired rate limit counters
  logger.info('maintenance.task_cleanup_rate_limits', {});
  return { cleaned: 0 };
}

async function refreshAggregateStats(orgId: string | null): Promise<{ refreshed: boolean }> {
  // Placeholder: in production, refresh materialized aggregates for org
  logger.info('maintenance.task_refresh_aggregates', { organizationId: orgId });
  return { refreshed: true };
}

async function cleanupOldAuditLogs(orgId: string | null): Promise<{ cleaned: number }> {
  // Placeholder: in production, archive audit logs older than retention period
  logger.info('maintenance.task_cleanup_audit_logs', { organizationId: orgId });
  return { cleaned: 0 };
}

async function reconcileWebhookDeliveries(orgId: string | null): Promise<{ reconciled: number }> {
  // Placeholder: in production, check for stuck webhook deliveries
  logger.info('maintenance.task_reconcile_webhooks', { organizationId: orgId });
  return { reconciled: 0 };
}

const TASK_IMPLEMENTATIONS: Record<string, (orgId: string | null, params?: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  cleanup_expired_sessions: cleanupExpiredSessions,
  cleanup_stale_rate_limits: cleanupStaleRateLimits,
  refresh_aggregate_stats: refreshAggregateStats,
  cleanup_old_audit_logs: cleanupOldAuditLogs,
  reconcile_webhook_deliveries: reconcileWebhookDeliveries,
};

// ── Handler ──────────────────────────────────────────────────────

/**
 * Maintenance job handler.
 * Only tasks in the ALLOWED_TASKS set can be executed.
 * No eval/dynamic import — all tasks are statically registered.
 */
export async function handleMaintenanceJob(job: ClaimedJob): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>;
  const task = String(payload.task ?? '');
  const params = payload.params as Record<string, unknown> | undefined;

  if (!task || !ALLOWED_TASKS.has(task)) {
    throw new ValidationError(`Unknown or disallowed maintenance task: '${task}'`, [
      { field: 'task', message: `Task must be one of: ${Array.from(ALLOWED_TASKS).join(', ')}` },
    ]);
  }

  const impl = TASK_IMPLEMENTATIONS[task];
  if (!impl) {
    // This should never happen if ALLOWED_TASKS and TASK_IMPLEMENTATIONS are in sync,
    // but we defend against it anyway.
    throw new Error(`Implementation missing for task: '${task}'`);
  }

  logger.info('maintenance.task_started', {
    jobId: job.id,
    task,
    organizationId: job.organizationId,
    requestId: job.requestId,
  });

  const result = await impl(job.organizationId, params);

  logger.info('maintenance.task_completed', {
    jobId: job.id,
    task,
    organizationId: job.organizationId,
    result,
    requestId: job.requestId,
  });

  return result;
}
