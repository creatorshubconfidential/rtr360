/**
 * RTR 360 — Durable Background Job Queue
 *
 * PostgreSQL-backed job queue with:
 *   - Atomic job claiming (row-level locking via FOR UPDATE SKIP LOCKED)
 *   - Tenant-scoped idempotency (database-enforced unique constraint)
 *   - Worker identity and ownership verification (lockedBy)
 *   - Lease-based stale job recovery (atomic)
 *   - Bounded exponential backoff with jitter
 *   - Request-to-job correlation (requestId)
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
import { metrics, METRIC_NAMES } from '@/lib/metrics';
import {
  JOB_STATUS,
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
  requestId?: string | null;
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
  lockedBy: string | null;
  requestId: string | null;
}

// ── Error Classification ────────────────────────────────────────

/**
 * Classify an error to determine retry behavior.
 * Transient errors should be retried.
 * Permanent, validation, and authorization errors should fail immediately.
 */
export function classifyError(error: unknown): 'transient' | 'permanent' {
  if (error instanceof ValidationError) return 'permanent';
  if (error instanceof QueueError) return 'permanent';

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Authorization / tenant violations — never retry
  if (lower.includes('forbidden') || lower.includes('unauthorized') || lower.includes('tenant')) {
    return 'permanent';
  }

  // Validation-like patterns — never retry
  if (lower.includes('invalid payload') || lower.includes('unknown job type')) {
    return 'permanent';
  }

  // Network / timeout / connection — retry
  if (
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('socket hang up') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('5') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('429')
  ) {
    return 'transient';
  }

  // Default: treat as transient (retry)
  return 'transient';
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
 * Idempotency is enforced at TWO levels:
 *   1. Application-level: fast-path check for existing active jobs (avoids DB errors)
 *   2. Database-level: @@unique([organizationId, idempotencyKey]) constraint
 *      catches concurrent enqueue race conditions.
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
    requestId,
  } = options;

  // 1. Validate job type exists
  const typeConfig = getJobTypeConfig(type);
  if (!typeConfig) {
    throw new ValidationError(`Unknown job type: '${type}'`, [
      { field: 'type', message: `Job type '${type}' is not registered` },
    ]);
  }

  // 2. Validate payload BEFORE database write
  const validation = validateJobPayload(type, payload);
  if (!validation.success) {
    throw new ValidationError(validation.error, [
      { field: 'payload', message: validation.error },
    ]);
  }

  // 3. Application-level idempotency: fast path to avoid unnecessary DB errors.
  //    The DB unique constraint is the real guarantee for concurrent enqueues.
  if (idempotencyKey) {
    const existing = await findExistingActiveJob(organizationId, idempotencyKey);
    if (existing) {
      logger.info('job.enqueued', {
        jobId: existing.id,
        jobType: type,
        organizationId,
        idempotencyKey,
        requestId,
        event: 'duplicate_skipped',
      });
      return { count: 0, id: existing.id };
    }
  }

  // 4. Create the job. The DB unique constraint on (organizationId, idempotencyKey)
  //    is the final guarantee — concurrent inserts with the same key will
  //    result in a Prisma unique constraint violation (P2002), which we catch.
  try {
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
        requestId: requestId ?? null,
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
      requestId,
    });

    try {
      metrics.increment(METRIC_NAMES.JOBS_ENQUEUED, { jobType: type, organizationId });
    } catch { /* metrics must never break business logic */ }

    return { count: 1, id: job.id };
  } catch (error) {
    // Catch unique constraint violation (P2002) — concurrent duplicate enqueue
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      idempotencyKey
    ) {
      // Find the existing job to return its ID
      const existing = await findExistingActiveJob(organizationId, idempotencyKey);
      const existingId = existing?.id ?? 'unknown';

      logger.info('job.enqueued', {
        jobType: type,
        organizationId,
        idempotencyKey,
        requestId,
        event: 'duplicate_concurrent',
        existingJobId: existingId,
      });

      return { count: 0, id: existingId };
    }
    throw error;
  }
}

/**
 * Find an existing non-terminal job with the same idempotency key.
 * Only considers jobs that are still active (pending/processing).
 */
async function findExistingActiveJob(
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
      lockedBy: null,
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
 *   5. Updates status to PROCESSING, sets lease and worker identity
 *
 * This is a single atomic UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
 * No race condition possible — the subquery with FOR UPDATE SKIP LOCKED
 * ensures only one worker can lock and claim each row.
 */
export async function claimJob(
  workerId: string,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
  organizationId?: string | null,
): Promise<ClaimResult> {
  const now = new Date();
  const leasedUntil = calculateLeaseExpiry(leaseDurationMs);

  const statusFilter = Prisma.sql`status = ${JOB_STATUS.PENDING}`;
  const runAtFilter = Prisma.sql`AND ("run_at" IS NULL OR "run_at" <= ${now})`;
  const orgFilter = organizationId
    ? Prisma.sql`AND "organization_id" = ${organizationId}`
    : Prisma.sql``;

  const claimedJobs = await db.$queryRaw<Array<ClaimedJob>>`
    UPDATE "BackgroundJob"
    SET status = ${JOB_STATUS.PROCESSING},
        "started_at" = ${now},
        "leased_until" = ${leasedUntil},
        "locked_by" = ${workerId},
        "attempt" = "attempt" + 1,
        "updated_at" = ${now}
    WHERE id IN (
      SELECT id FROM "BackgroundJob"
      WHERE ${statusFilter} ${runAtFilter} ${orgFilter}
      ORDER BY priority ASC, "created_at" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, "organization_id", "user_id", attempt, "max_attempts", priority, "locked_by", "request_id"
  `;

  if (claimedJobs.length === 0) {
    return { claimed: false, job: null };
  }

  const job = claimedJobs[0];

  logger.info('job.claimed', {
    jobId: job.id,
    jobType: job.type,
    organizationId: job.organizationId,
    workerId,
    attempt: job.attempt,
  });

  try {
    metrics.increment(METRIC_NAMES.JOBS_CLAIMED, { jobType: job.type, organizationId: job.organizationId, workerId });
  } catch { /* metrics must never break business logic */ }

  return { claimed: true, job };
}

// ── Lease Renewal ─────────────────────────────────────────────

/**
 * Renew the lease on a processing job.
 * Only the worker that currently owns the job (lockedBy) can renew.
 * Completed or non-PROCESSING jobs cannot be renewed.
 * Returns true if the lease was extended, false if the job is no longer
 * owned by this worker (e.g., recovered by another worker).
 */
export async function renewLease(
  jobId: string,
  workerId: string,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<boolean> {
  const leasedUntil = calculateLeaseExpiry(leaseDurationMs);
  const updated = await db.backgroundJob.updateMany({
    where: {
      id: jobId,
      status: JOB_STATUS.PROCESSING,
      lockedBy: workerId,
    },
    data: { leasedUntil },
  });

  if (updated.count === 0) {
    const current = await db.backgroundJob.findUnique({
      where: { id: jobId },
      select: { status: true, lockedBy: true },
    });
    logger.warn('job.lease_renewal_skipped', {
      jobId,
      workerId,
      currentStatus: current?.status,
      currentLockedBy: current?.lockedBy,
    });
    return false;
  }

  return true;
}

// ── Complete Job ───────────────────────────────────────────────

/**
 * Mark a job as successfully completed.
 *
 * Ownership verification: only the worker that claimed the job (lockedBy)
 * can complete it. A stale worker that lost its lease cannot overwrite
 * a newer worker's state.
 */
export async function completeJob(
  jobId: string,
  workerId: string,
  result?: unknown,
): Promise<void> {
  // Atomic: only update if this worker owns the job AND it's still PROCESSING
  const updated = await db.backgroundJob.updateMany({
    where: {
      id: jobId,
      status: JOB_STATUS.PROCESSING,
      lockedBy: workerId,
    },
    data: {
      status: JOB_STATUS.COMPLETED,
      completedAt: new Date(),
      leasedUntil: null,
      lockedBy: null,
      result: result !== undefined
        ? (result as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  if (updated.count === 0) {
    // Job was already completed by another worker, or recovered.
    // Fetch current state for diagnostics.
    const current = await db.backgroundJob.findUnique({
      where: { id: jobId },
      select: { status: true, lockedBy: true },
    });
    logger.warn('job.complete_skipped', {
      jobId,
      workerId,
      currentStatus: current?.status,
      currentLockedBy: current?.lockedBy,
    });
    return;
  }

  // Fetch for logging (need orgId)
  const job = await db.backgroundJob.findUnique({
    where: { id: jobId },
    select: { type: true, organizationId: true, attempt: true },
  });

  logger.info('job.completed', {
    jobId,
    jobType: job?.type,
    organizationId: job?.organizationId,
    workerId,
    attempt: job?.attempt,
  });

  try {
    metrics.increment(METRIC_NAMES.JOBS_COMPLETED, { jobType: job?.type, organizationId: job?.organizationId, workerId });
  } catch { /* metrics must never break business logic */ }
}

// ── Fail Job ───────────────────────────────────────────────────

/**
 * Mark a job as failed. If retries remain, schedule the next attempt.
 * If max attempts reached, mark as permanently FAILED.
 *
 * Ownership verification: only the worker that claimed the job (lockedBy)
 * can fail it. A stale worker cannot overwrite a recovered job's state.
 */
export async function failJob(
  jobId: string,
  workerId: string,
  error: unknown,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<void> {
  const job = await db.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) {
    logger.error('job.fail_error', { jobId, error: 'Job not found' });
    return;
  }

  // Verify ownership — this worker must own the job
  if (job.lockedBy !== workerId) {
    logger.warn('job.fail_skipped_wrong_owner', {
      jobId,
      currentWorker: workerId,
      actualOwner: job.lockedBy,
    });
    return;
  }

  const errorClassification = classifyError(error);
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Permanent errors → fail immediately regardless of attempt count
  if (errorClassification === 'permanent') {
    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.FAILED,
        failedAt: new Date(),
        lastError: truncateError(`[PERMANENT] ${errorMessage}`),
        leasedUntil: null,
        lockedBy: null,
      },
    });

    logger.error('job.dead_lettered', {
      jobId,
      jobType: job.type,
      organizationId: job.organizationId,
      workerId,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      reason: 'permanent_error',
      error: truncateError(errorMessage),
    });

    try {
      metrics.increment(METRIC_NAMES.JOBS_FAILED, { jobType: job.type, organizationId: job.organizationId, workerId });
    } catch { /* metrics must never break business logic */ }
    return;
  }

  // Transient errors → retry if attempts remain
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
        lockedBy: null,
      },
    });

    logger.warn('job.retry_scheduled', {
      jobId,
      jobType: job.type,
      organizationId: job.organizationId,
      workerId,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      nextRetryAt: nextRetryAt.toISOString(),
      error: truncateError(errorMessage),
    });

    try {
      metrics.increment(METRIC_NAMES.JOBS_RETRIED, { jobType: job.type, organizationId: job.organizationId, workerId });
    } catch { /* metrics must never break business logic */ }
  } else {
    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.FAILED,
        failedAt: new Date(),
        lastError: truncateError(errorMessage),
        leasedUntil: null,
        lockedBy: null,
      },
    });

    logger.error('job.dead_lettered', {
      jobId,
      jobType: job.type,
      organizationId: job.organizationId,
      workerId,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      error: truncateError(errorMessage),
    });

    try {
      metrics.increment(METRIC_NAMES.JOBS_DEAD_LETTERED, { jobType: job.type, organizationId: job.organizationId, workerId });
    } catch { /* metrics must never break business logic */ }
  }
}

// ── Stale Job Recovery ─────────────────────────────────────────

/**
 * Recover jobs that have been PROCESSING too long (lease expired).
 *
 * Uses raw SQL with WHERE clause for atomic recovery:
 *   - Only PROCESSING jobs with expired leases are recovered
 *   - attempt < max_attempts → back to PENDING
 *   - attempt >= max_attempts → FAILED
 *   - No two workers can recover the same job (single statement)
 */
export async function recoverStaleJobs(
  workerId: string,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<number> {
  const now = new Date();

  // Recover retryable stale jobs: PROCESSING + lease expired + attempts remain
  const retryableResult = await db.$executeRaw`
    UPDATE "BackgroundJob"
    SET status = ${JOB_STATUS.PENDING},
        "last_error" = 'Lease expired: worker likely crashed',
        "started_at" = NULL,
        "leased_until" = NULL,
        "locked_by" = NULL,
        "updated_at" = ${now}
    WHERE status = ${JOB_STATUS.PROCESSING}
      AND "leased_until" < ${now}
      AND attempt < "max_attempts"
  `;

  // Fail exhausted stale jobs: PROCESSING + lease expired + no retries left
  const exhaustedResult = await db.$executeRaw`
    UPDATE "BackgroundJob"
    SET status = ${JOB_STATUS.FAILED},
        "failed_at" = ${now},
        "last_error" = 'Lease expired: max attempts exhausted',
        "leased_until" = NULL,
        "locked_by" = NULL,
        "updated_at" = ${now}
    WHERE status = ${JOB_STATUS.PROCESSING}
      AND "leased_until" < ${now}
      AND attempt >= "max_attempts"
  `;

  if (retryableResult > 0) {
    logger.warn('job.recovered', {
      workerId,
      count: retryableResult,
      reason: 'stale_lease',
    });
  }

  if (exhaustedResult > 0) {
    logger.error('job.dead_lettered', {
      workerId,
      count: exhaustedResult,
      reason: 'stale_lease_max_attempts',
    });
  }

  if (retryableResult > 0 || exhaustedResult > 0) {
    logger.info('job.recovered_count', { workerId, retryable: retryableResult, exhausted: exhaustedResult });
  }

  return retryableResult;
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
