/**
 * RTR 360 — Background Job Worker
 *
 * Long-running process that polls the queue and executes jobs.
 * Designed to run as a standalone process (not inside Next.js serverless).
 *
 * Features:
 *   - Bounded concurrency (configurable max concurrent jobs)
 *   - Graceful shutdown (SIGTERM/SIGINT handling)
 *   - Stale job recovery on each poll cycle
 *   - Structured logging with job correlation
 *   - Safe failure isolation (one bad job must not stop the queue)
 *   - No infinite tight loop (configurable polling interval)
 */

import { claimJob, completeJob, failJob, recoverStaleJobs, type ClaimedJob } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { getJobTypeConfig } from '@/lib/job-types';
import { serializeError } from '@/lib/errors';
import { randomUUID } from 'crypto';

// ── Types ──────────────────────────────────────────────────────

export type JobHandler = (job: ClaimedJob) => Promise<unknown>;

export interface WorkerConfig {
  /** Maximum jobs processed concurrently (default: 5) */
  concurrency: number;
  /** Milliseconds between poll cycles (default: 2000) */
  pollingIntervalMs: number;
  /** Maximum jobs to claim per poll cycle (default: 10) */
  maxJobsPerCycle: number;
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
  maxJobsPerCycle: 10,
  leaseDurationMs: 5 * 60 * 1000,
  recoverStaleJobs: true,
};

// ── Handler Registry ───────────────────────────────────────────

const handlers = new Map<string, JobHandler>();

/**
 * Register a handler for a job type.
 * This is the ONLY way to execute job types — no arbitrary handler execution.
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

// ── Worker Class ───────────────────────────────────────────────

export class Worker {
  private config: WorkerConfig;
  private state: WorkerState;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownRequested = false;

  constructor(config: Partial<WorkerConfig> = {}) {
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
   * Start the worker loop.
   * Registers signal handlers for graceful shutdown.
   */
  async start(): Promise<void> {
    if (this.state.running) {
      logger.warn('worker.start', { message: 'Worker is already running' });
      return;
    }

    this.state.running = true;
    this.shutdownRequested = false;

    logger.info('worker.started', {
      concurrency: this.config.concurrency,
      pollingIntervalMs: this.config.pollingIntervalMs,
      maxJobsPerCycle: this.config.maxJobsPerCycle,
      organizationId: this.config.organizationId,
    });

    // Register signal handlers
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

    logger.info('worker.shutdown_requested', { signal });
    this.shutdownRequested = true;

    // Stop the polling timer
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Wait for active jobs to finish (with a timeout)
    if (this.state.activeJobs > 0) {
      logger.info('worker.waiting_for_active_jobs', {
        activeJobs: this.state.activeJobs,
      });

      const maxWait = 30_000;
      const checkInterval = 500;
      let waited = 0;

      while (this.state.activeJobs > 0 && waited < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        waited += checkInterval;
      }

      if (this.state.activeJobs > 0) {
        logger.warn('worker.shutdown_timeout', {
          activeJobs: this.state.activeJobs,
          waitedMs: waited,
        });
      }
    }

    this.state.running = false;
    logger.info('worker.stopped', {
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
        logger.error('worker.poll_error', serializeError(error));
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
      const recovered = await recoverStaleJobs(this.config.leaseDurationMs);
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
        this.config.leaseDurationMs,
        this.config.organizationId,
      );

      if (!result.claimed || !result.job) {
        break;
      }

      this.processJob(result.job).catch((error) => {
        logger.error('worker.process_error', {
          jobId: result.job!.id,
          ...serializeError(error),
        });
      });
    }
  }

  private async processJob(job: ClaimedJob): Promise<void> {
    const requestId = randomUUID();

    this.state.activeJobs++;
    const startTime = Date.now();

    const jobLogger = logger.child({
      jobId: job.id,
      jobType: job.type,
      organizationId: job.organizationId,
      attempt: job.attempt,
    });

    try {
      jobLogger.info('job.started');

      const handler = handlers.get(job.type);
      if (!handler) {
        const config = getJobTypeConfig(job.type);
        throw new Error(
          `No handler registered for job type '${job.type}'. ` +
          (config
            ? 'Job type is defined but handler is not registered.'
            : 'Job type is not defined in the registry.'),
        );
      }

      const result = await handler(job);

      const duration = Date.now() - startTime;
      await completeJob(job.id, result);

      jobLogger.info('job.completed', { durationMs: duration });
      this.state.totalProcessed++;
    } catch (error) {
      const duration = Date.now() - startTime;

      await failJob(job.id, error, this.config.leaseDurationMs);

      jobLogger.error('job.failed', {
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
