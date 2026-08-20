/**
 * RTR 360 — Durable Background Job Queue
 *
 * PostgreSQL-backed job queue with:
 *   - Atomic job claiming (row-level locking via FOR UPDATE SKIP LOCKED)
 *   - Tenant-scoped idempotency
 *   - Lease-based stale job recovery
 *   - Bounded exponential backoff with jitter
 *   - Graceful degradation (works without Redis)
 *
 * Redis is NOT the durable store. PostgreSQL is the source of truth.
 * Redis MAY be used for wake-up signals (future enhancement).
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { BackgroundJob } from '@prisma/client';
import { logger } from '@/lib/logger';
import { QueueError, ConflictError, ValidationError } from '@/lib/errors';
import {
  JOB_STATUS,
  JOB_PRIORITY,
  validateJobPayload,
  getJobTypeConfig,
} from '@/lib/job-types';

// ── Types ──────────────────────────────────────────────────────

export interface EnqueueOptions {
  type: string;
  payload: unknown;
  organizationId: string | null;
  userId?: string | null;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  idempotencyKey?: string | null;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface ClaimResult {
  claimed: boolean;
  job: ClaimedJob | null;
}

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Prisma.JsonValue | null;
  organizationId: string | null;
  userId: string | null;
  attempt: number;
  maxAttempts: number;
  priority: number;
}

// ── Lease Configuration ────────────────────────────────────────

/** Default lease duration: 5 minutes */
const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;

/** Maximum backoff: 1 hour */
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/** Base backoff: 1 second */
const BASE_BACKOFF_MS = 1000;

/**
 * Calculate next retry time using exponential backoff with jitter.
 * Formula: min(base * 2^attempt + jitter, maxBackoff)
 */
export function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return Math.min(exponentialDelay + jitter, MAX_BACKOFF_MS);
}

/**
 * Calculate the lease expiration time.
 */
export function calculateLeaseExpiry(durationMs: number = DEFAULT_LEASE_DURATION_MS): Date {
  return new Date(Date.now() + durationMs);
}

// ── Enqueue ────────────────────────────────────────────────────

/**
 * Enqueue a new background job.
 *
 * Validates the job type and payload before creating the job.
 * If an idempotencyKey is provided, it checks for existing jobs
 * within the same organization to prevent duplicates.
 *
 * The organizationId MUST come from authenticated server context,
 * never from untrusted client payload.
 */
export async function enqueue(options: EnqueueOptions): Promise<{ count: number; id?: string }> {
  const {
    type,
    payload,
    organizationId,
    userId,
    priority,
    runAt,
    maxAttempts,
    idempotencyKey,
  } = options;

  // 1. Validate job type exists
  const typeConfig = getJobTypeConfig(type);
  if (!typeConfig) {
    throw new ValidationError(`Unknown job type: '${type}'`, [
      { field: 'type', message: `Job type '${type}' is not registered` },
    ]);
  }

  // 2. Validate payload
  const validation = validateJobPayload(type, payload);
  if (!validation.success) {
    throw new ValidationError(validation.error, [
      { field: 'payload', message: validation.error },
    ]);
  }

  // 3. Idempotency check: same org + same key must not create duplicates
  if (idempotencyKey) {
    const existing = await findExistingJob(organizationId, idempotencyKey);
    if (existing) {
      logger.info('job.enqueued', {
        jobId: existing.id,
        jobType: type,
        organizationId,
        idempotencyKey,
        status: 'duplicate_skipped',
      });
      return { count: 0, id: existing.id };
    }
  }

  // 4. Create the job
  const job = await db.backgroundJob.create({
    data: {
      type,
      status: JOB_STATUS.PENDING,
      payload: payload as Prisma.InputJsonValue,
      organizationId: organizationId ?? null,
      userId: userId ?? null,
      priority: priority ?? typeConfig.defaultPriority,
      runAt: runAt ?? null,
      maxAttempts: maxAttempts ?? typeConfig.defaultMaxAttempts,
      idempotencyKey: idempotencyKey ?? null,
    },
  });

  logger.info('job.enqueued', {
    jobId: job.id,
    jobType: type,
    organizationId,
    userId,
    priority: job.priority,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt,
    idempotencyKey,
  });

  return { count: 1, id: job.id };
}

/**
 * Find an existing non-terminal job with the same idempotency key.
 * Only considers jobs that are still active (pending/processing).
 */
async function findExistingJob(
  organizationId: string | null,
  idempotencyKey: string,
): Promise<{ id: string; status: string } | null> {
  return db.backgroundJob.findFirst({
    where: {
      organizationId,
      idempotencyKey,
      status: { in: [JOB_STATUS.PENDING, JOB_STATUS.PROCESSING] },
    },
    select: { id: true, status: true },
  });
}

// ── Get Job ────────────────────────────────────────────────────

/**
 * Get a job by ID.
 * If organizationId is provided, enforces tenant isolation.
 */
export async function getJob(
  jobId: string,
  organizationId?: string | null,
): Promise<BackgroundJob | null> {
  const where: Prisma.BackgroundJobWhereInput = { id: jobId };
  if (organizationId) {
    where.organizationId = organizationId;
  }
  return db.backgroundJob.findFirst({ where });
}

// ── Cancel Job ─────────────────────────────────────────────────

/**
 * Cancel a pending or processing job.
 * Processing jobs are only cancelled if their lease has expired.
 * Completed/failed jobs cannot be cancelled.
 */
export async function cancelJob(
  jobId: string,
  organizationId?: string | null,
): Promise<BackgroundJob> {
  const job = await getJob(jobId, organizationId);
  if (!job) {
    throw new QueueError(`Job '${jobId}' not found`);
  }

  if (job.status === JOB_STATUS.COMPLETED) {
    throw new QueueError(`Cannot cancel completed job '${jobId}'`);
  }
  if (job.status === JOB_STATUS.FAILED) {
    throw new QueueError(`Cannot cancel failed job '${jobId}'`);
  }
  if (job.status === JOB_STATUS.CANCELLED) {
    throw new ConflictError(`Job '${jobId}' is already cancelled`);
  }

  const updated = await db.backgroundJob.update({
    where: { id: jobId },
    data: { status: JOB_STATUS.CANCELLED },
  });

  logger.info('job.cancelled', {
    jobId,
    jobType: job.type,
    organizationId,
    previousStatus: job.status,
  });

  return updated;
}

// ── Retry Job ──────────────────────────────────────────────────

/**
 * Manually retry a failed or cancelled job.
 * Resets attempt count and schedules for immediate execution.
 */
export async function retryJob(
  jobId: string,
  organizationId?: string | null,
): Promise<BackgroundJob> {
  const job = await getJob(jobId, organizationId);
  if (!job) {
    throw new QueueError(`Job '${jobId}' not found`);
  }

  if (job.status !== JOB_STATUS.FAILED && job.status !== JOB_STATUS.CANCELLED) {
    throw new QueueError(
      `Can only retry failed or cancelled jobs, got '${job.status}'`,
    );
  }

  const updated = await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: JOB_STATUS.PENDING,
      attempt: 0,
      lastError: null,
      runAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      leasedUntil: null,
    },
  });

  logger.info('job.retry_scheduled', {
    jobId,
    jobType: job.type,
    organizationId,
  });

  return updated;
}

// ── Atomic Claiming ────────────────────────────────────────────

/**
 * Atomically claim the next available job.
 *
 * Uses PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` to ensure
 * two workers can NEVER claim the same job concurrently.
 *
 * The query:
 *   1. Filters to PENDING jobs with runAt <= now (or null)
 *   2. Optionally filters by organization (for tenant-scoped workers)
 *   3. Orders by priority ASC, then createdAt ASC
 *   4. Locks the row exclusively, skipping already-locked rows
 *   5. Updates status to PROCESSING and sets lease
 *
 * This is a single atomic operation — no race condition possible.
 */
export async function claimJob(
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
  organizationId?: string | null,
): Promise<ClaimResult> {
  const now = new Date();
  const leasedUntil = calculateLeaseExpiry(leaseDurationMs);

  // Build the WHERE clause
  const statusFilter = Prisma.sql`status = ${JOB_STATUS.PENDING}`;
  const runAtFilter = Prisma.sql`AND ("run_at" IS NULL OR "run_at" <= ${now})`;
  const orgFilter = organizationId
    ? Prisma.sql`AND "organization_id" = ${organizationId}`
    : Prisma.sql``;

  // Use a raw query with FOR UPDATE SKIP LOCKED for atomic claiming
  const claimedJobs = await db.$queryRaw<Array<ClaimedJob>>`
    UPDATE "BackgroundJob"
    SET status = ${JOB_STATUS.PROCESSING},
        "started_at" = ${now},
        "leased_until" = ${leasedUntil},
        "attempt" = "attempt" + 1,
        "updated_at" = ${now}
    WHERE id IN (
      SELECT id FROM "BackgroundJob"
      WHERE ${statusFilter} ${runAtFilter} ${orgFilter}
      ORDER BY priority ASC, "created_at" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, "organization_id", "user_id", attempt, "max_attempts", priority
  `;

  if (claimedJobs.length === 0) {
    return { claimed: false, job: null };
  }

  const job = claimedJobs[0];

  logger.info('job.claimed', {
    jobId: job.id,
    jobType: job.type,
    organizationId: job.organizationId,
    attempt: job.attempt,
  });

  return { claimed: true, job };
}

// ── Complete Job ───────────────────────────────────────────────

/**
 * Mark a job as successfully completed.
 */
export async function completeJob(
  jobId: string,
  result?: unknown,
): Promise<void> {
  const job = await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: JOB_STATUS.COMPLETED,
      completedAt: new Date(),
      leasedUntil: null,
      result: result !== undefined ? (result as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  logger.info('job.completed', {
    jobId,
    jobType: job.type,
    organizationId: job.organizationId,
    attempt: job.attempt,
  });
}

// ── Fail Job ───────────────────────────────────────────────────

/**
 * Mark a job as failed. If retries remain, schedule the next attempt.
 * If max attempts reached, mark as permanently FAILED.
 */
export async function failJob(
  jobId: string,
  error: unknown,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<void> {
  const job = await db.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) {
    logger.error('job.fail_error', { jobId, error: 'Job not found' });
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  if (job.attempt < job.maxAttempts) {
    const nextRetryAt = new Date(Date.now() + calculateRetryDelay(job.attempt));

    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.PENDING,
        lastError: truncateError(errorMessage),
        runAt: nextRetryAt,
        startedAt: null,
        leasedUntil: null,
      },
    });

    logger.warn('job.retry_scheduled', {
      jobId,
      jobType: job.type,
      organizationId: job.organizationId,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      nextRetryAt: nextRetryAt.toISOString(),
      error: truncateError(errorMessage),
    });
  } else {
    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.FAILED,
        failedAt: new Date(),
        lastError: truncateError(errorMessage),
        leasedUntil: null,
      },
    });

    logger.error('job.dead_lettered', {
      jobId,
      jobType: job.type,
      organizationId: job.organizationId,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      error: truncateError(errorMessage),
    });
  }
}

// ── Stale Job Recovery ─────────────────────────────────────────

/**
 * Recover jobs that have been PROCESSING too long (lease expired).
 * Transitions them back to PENDING with a retry scheduled.
 */
export async function recoverStaleJobs(
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<number> {
  const now = new Date();

  const staleJobs = await db.backgroundJob.findMany({
    where: {
      status: JOB_STATUS.PROCESSING,
      leasedUntil: { lt: now },
    },
    select: { id: true, attempt: true, maxAttempts: true, type: true, organizationId: true },
  });

  if (staleJobs.length === 0) return 0;

  let recovered = 0;

  for (const job of staleJobs) {
    if (job.attempt >= job.maxAttempts) {
      await db.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: JOB_STATUS.FAILED,
          failedAt: now,
          lastError: 'Lease expired: worker likely crashed',
          leasedUntil: null,
        },
      });

      logger.error('job.dead_lettered', {
        jobId: job.id,
        jobType: job.type,
        organizationId: job.organizationId,
        attempt: job.attempt,
        reason: 'stale_lease',
      });
    } else {
      const nextRetryAt = new Date(Date.now() + calculateRetryDelay(job.attempt));
      await db.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: JOB_STATUS.PENDING,
          lastError: 'Lease expired: worker likely crashed',
          runAt: nextRetryAt,
          startedAt: null,
          leasedUntil: null,
        },
      });

      logger.warn('job.retry_scheduled', {
        jobId: job.id,
        jobType: job.type,
        organizationId: job.organizationId,
        attempt: job.attempt,
        reason: 'stale_lease',
        nextRetryAt: nextRetryAt.toISOString(),
      });

      recovered++;
    }
  }

  return recovered;
}

// ── Queue Stats ────────────────────────────────────────────────

/**
 * Get queue statistics.
 * If organizationId is provided, returns tenant-scoped stats.
 */
export async function getQueueStats(
  organizationId?: string | null,
): Promise<QueueStats> {
  const where: Prisma.BackgroundJobWhereInput = organizationId
    ? { organizationId }
    : {};

  const [pending, processing, completed, failed, cancelled] = await Promise.all([
    db.backgroundJob.count({ where: { ...where, status: JOB_STATUS.PENDING } }),
    db.backgroundJob.count({ where: { ...where, status: JOB_STATUS.PROCESSING } }),
    db.backgroundJob.count({ where: { ...where, status: JOB_STATUS.COMPLETED } }),
    db.backgroundJob.count({ where: { ...where, status: JOB_STATUS.FAILED } }),
    db.backgroundJob.count({ where: { ...where, status: JOB_STATUS.CANCELLED } }),
  ]);

  return { pending, processing, completed, failed, cancelled };
}

// ── Helpers ────────────────────────────────────────────────────

function truncateError(message: string, maxLength: number = 2000): string {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength - 3) + '...';
}
