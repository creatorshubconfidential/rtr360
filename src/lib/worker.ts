/**
 * RTR 360 — Background Job Worker
 *
 * Long-running process that polls the PostgreSQL queue and executes jobs.
 * Designed to run as a standalone process (not inside Next.js serverless).
 *
 * Features:
 *   - Unique worker identity (rtr-worker-{uuid})
 *   - Bounded concurrency (configurable max concurrent jobs)
 *   - Graceful shutdown (SIGTERM/SIGINT handling)
 *   - Stale job recovery on each poll cycle
 *   - Structured logging with job + request correlation
 *   - Safe failure isolation (one bad job must not stop the queue)
 *   - No infinite tight loop (configurable polling interval)
 *   - Error classification (transient vs permanent)
 */

import { claimJob, completeJob, failJob, recoverStaleJobs, type ClaimedJob } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { getJobTypeConfig, validateJobPayload } from '@/lib/job-types';
import { serializeError } from '@/lib/errors';
import { randomUUID } from 'crypto';

// ── Types ──────────────────────────────────────────────────────

export type JobHandler = (job: ClaimedJob) => Promise<unknown>;

export interface WorkerConfig {
  /** Maximum jobs processed concurrently (default: 5) */
  concurrency: number;
  /** Milliseconds between poll cycles (default: 2000) */
  pollingIntervalMs: number;
  /** Lease duration in milliseconds (default: 300000 = 5 min) */
  leaseDurationMs: number;
  /** If set, only processes jobs for this organization */
  organizationId?: string;
  /** Enable stale job recovery on each cycle (default: true) */
  recoverStaleJobs: boolean;
}

export interface WorkerState {
  running: boolean;
  activeJobs: number;
  totalProcessed: number;
  totalFailed: number;
  totalRecovered: number;
}

const DEFAULT_CONFIG: WorkerConfig = {
  concurrency: 5,
  pollingIntervalMs: 2000,
  leaseDurationMs: 5 * 60 * 1000,
  recoverStaleJobs: true,
};

// ── Worker Identity ────────────────────────────────────────────

/**
 * Generate a unique worker identity.
 * Format: rtr-worker-{uuid}
 * Used for lockedBy, logging, and diagnostics.
 */
export function generateWorkerId(): string {
  return `rtr-worker-${randomUUID()}`;
}

// ── Handler Registry ───────────────────────────────────────────

const handlers = new Map<string, JobHandler>();

/**
 * Register a handler for a job type.
 * This is the ONLY way to execute job types — no arbitrary handler execution.
 * Throws if a handler is already registered for the same type.
 */
export function registerJobHandler(type: string, handler: JobHandler): void {
  if (handlers.has(type)) {
    throw new Error(`Handler already registered for job type '${type}'`);
  }
  handlers.set(type, handler);
}

/**
 * Get a registered handler. Returns undefined for unregistered types.
 */
export function getJobHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

/**
 * List all registered handler types (for diagnostics).
 */
export function getRegisteredHandlerTypes(): string[] {
  return Array.from(handlers.keys());
}

// ── Worker Class ───────────────────────────────────────────────

export class Worker {
  private readonly workerId: string;
  private config: WorkerConfig;
  private state: WorkerState;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownRequested = false;

  constructor(
    config: Partial<WorkerConfig> = {},
    workerId?: string,
  ) {
    this.workerId = workerId ?? generateWorkerId();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      running: false,
      activeJobs: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalRecovered: 0,
    };
  }

  /**
   * Get this worker's unique identity.
   */
  get id(): string {
    return this.workerId;
  }

  /**
   * Start the worker loop.
   * Registers signal handlers for graceful shutdown.
   */
  async start(): Promise<void> {
    if (this.state.running) {
      logger.warn('worker.start', {
        workerId: this.workerId,
        event: 'already_running',
      });
      return;
    }

    this.state.running = true;
    this.shutdownRequested = false;

    logger.info('worker.started', {
      workerId: this.workerId,
      concurrency: this.config.concurrency,
      pollingIntervalMs: this.config.pollingIntervalMs,
      organizationId: this.config.organizationId,
    });

    // Register signal handlers for graceful shutdown
    process.on('SIGTERM', () => this.requestShutdown('SIGTERM'));
    process.on('SIGINT', () => this.requestShutdown('SIGINT'));

    // Start the poll loop
    this.scheduleNextPoll();
  }

  /**
   * Request graceful shutdown.
   * Stops accepting new work, waits for in-flight jobs to finish.
   */
  async requestShutdown(signal?: string): Promise<void> {
    if (this.shutdownRequested) return;

    logger.info('worker.shutdown_requested', {
      workerId: this.workerId,
      signal,
      activeJobs: this.state.activeJobs,
    });
    this.shutdownRequested = true;

    // Stop the polling timer — no new poll cycles
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Wait for active jobs to finish (with a timeout)
    if (this.state.activeJobs > 0) {
      const maxWait = 30_000;
      const checkInterval = 500;
      let waited = 0;

      while (this.state.activeJobs > 0 && waited < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        waited += checkInterval;
      }

      if (this.state.activeJobs > 0) {
        logger.warn('worker.shutdown_timeout', {
          workerId: this.workerId,
          activeJobs: this.state.activeJobs,
          waitedMs: waited,
        });
      }
    }

    this.state.running = false;
    logger.info('worker.stopped', {
      workerId: this.workerId,
      totalProcessed: this.state.totalProcessed,
      totalFailed: this.state.totalFailed,
      totalRecovered: this.state.totalRecovered,
    });
  }

  /**
   * Get the current worker state (for monitoring/health checks).
   */
  getState(): Readonly<WorkerState> {
    return { ...this.state };
  }

  // ── Private Methods ──────────────────────────────────────

  private scheduleNextPoll(): void {
    if (this.shutdownRequested) return;

    this.pollingTimer = setTimeout(() => {
      this.poll().catch((error) => {
        logger.error('worker.poll_error', {
          workerId: this.workerId,
          ...serializeError(error),
        });
      }).finally(() => {
        if (!this.shutdownRequested) {
          this.scheduleNextPoll();
        }
      });
    }, this.config.pollingIntervalMs);

    // Allow Node.js to exit if this is the only active timer
    if (typeof this.pollingTimer === 'object' && 'unref' in this.pollingTimer) {
      this.pollingTimer.unref();
    }
  }

  private async poll(): Promise<void> {
    // Recover stale jobs first (if enabled)
    if (this.config.recoverStaleJobs) {
      const recovered = await recoverStaleJobs(
        this.workerId,
        this.config.leaseDurationMs,
      );
      if (recovered > 0) {
        this.state.totalRecovered += recovered;
      }
    }

    // Claim and process jobs up to concurrency limit
    while (
      !this.shutdownRequested &&
      this.state.activeJobs < this.config.concurrency
    ) {
      const result = await claimJob(
        this.workerId,
        this.config.leaseDurationMs,
        this.config.organizationId,
      );

      if (!result.claimed || !result.job) {
        break;
      }

      // Fire-and-forget with error boundary
      this.processJob(result.job).catch((error) => {
        logger.error('worker.process_error', {
          workerId: this.workerId,
          jobId: result.job!.id,
          ...serializeError(error),
        });
      });
    }
  }

  private async processJob(job: ClaimedJob): Promise<void> {
    this.state.activeJobs++;
    const startTime = Date.now();

    const jobLogger = logger.child({
      jobId: job.id,
      jobType: job.type,
      organizationId: job.organizationId,
      workerId: this.workerId,
      attempt: job.attempt,
      requestId: job.requestId,
    });

    try {
      jobLogger.info('job.started', { event: 'job.started' });

      // Re-validate payload at execution time (treat DB payload as untrusted)
      const payloadValidation = validateJobPayload(job.type, job.payload);
      if (!payloadValidation.success) {
        throw new Error(`[VALIDATION] ${payloadValidation.error}`);
      }

      // Look up handler
      const handler = handlers.get(job.type);
      if (!handler) {
        const typeConfig = getJobTypeConfig(job.type);
        const msg = typeConfig
          ? `No handler registered for job type '${job.type}'`
          : `Unknown job type '${job.type}'`;
        throw new Error(msg);
      }

      // Execute
      const result = await handler(job);

      const duration = Date.now() - startTime;
      await completeJob(job.id, this.workerId, result);

      jobLogger.info('job.completed', {
        event: 'job.completed',
        durationMs: duration,
      });

      this.state.totalProcessed++;
    } catch (error) {
      const duration = Date.now() - startTime;

      await failJob(job.id, this.workerId, error, this.config.leaseDurationMs);

      jobLogger.error('job.failed', {
        event: 'job.failed',
        durationMs: duration,
        ...serializeError(error),
      });

      this.state.totalFailed++;
      this.state.totalProcessed++;
    } finally {
      this.state.activeJobs--;
    }
  }
}
