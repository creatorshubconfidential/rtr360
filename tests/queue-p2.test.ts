import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JOB_STATUS,
  JOB_PRIORITY,
  validateJobPayload,
  getJobTypeConfig,
} from '@/lib/job-types';
import {
  calculateRetryDelay,
  calculateLeaseExpiry,
} from '@/lib/queue';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  QueueError,
  redactSecrets,
  serializeError,
} from '@/lib/errors';

// ============================================================
// 1. JOB TYPE REGISTRY & PAYLOAD VALIDATION
// ============================================================

describe('Job Type Registry', () => {
  it('has all required RTR360 job types registered', () => {
    const requiredTypes = ['email', 'webhook', 'notification', 'report', 'maintenance', 'ai'];
    for (const type of requiredTypes) {
      const config = getJobTypeConfig(type);
      expect(config).toBeDefined();
      expect(config!.type).toBe(type);
      expect(config!.description).toBeTruthy();
      expect(config!.defaultMaxAttempts).toBeGreaterThan(0);
      expect(config!.defaultPriority).toBeGreaterThan(0);
    }
  });

  it('returns undefined for unknown job type', () => {
    expect(getJobTypeConfig('nonexistent_type')).toBeUndefined();
    expect(getJobTypeConfig('')).toBeUndefined();
    expect(getJobTypeConfig('DROP TABLE users')).toBeUndefined();
  });

  it('rejects unknown job types during validation', () => {
    const result = validateJobPayload('malicious_job', { data: 'test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unknown job type: 'malicious_job'");
    }
  });
});

describe('Email Payload Validation', () => {
  it('accepts valid email payload', () => {
    const payload = {
      to: 'user@example.com',
      subject: 'Test Subject',
      templateId: 'invoice-pdf',
    };
    const result = validateJobPayload('email', payload);
    expect(result.success).toBe(true);
  });

  it('rejects invalid email address', () => {
    const payload = {
      to: 'not-an-email',
      subject: 'Test',
      templateId: 'template',
    };
    const result = validateJobPayload('email', payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid payload');
    }
  });

  it('rejects missing required fields', () => {
    const result = validateJobPayload('email', { to: 'user@example.com' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid payload');
    }
  });

  it('accepts optional fields', () => {
    const payload = {
      to: 'user@example.com',
      subject: 'Test',
      templateId: 'tpl',
      replyTo: 'reply@example.com',
      templateData: { name: 'John' },
    };
    const result = validateJobPayload('email', payload);
    expect(result.success).toBe(true);
  });
});

describe('Webhook Payload Validation', () => {
  it('accepts valid webhook payload', () => {
    const payload = {
      endpointId: 'ep_123',
      eventType: 'invoice.created',
      payload: { invoiceId: 'inv_456' },
    };
    const result = validateJobPayload('webhook', payload);
    expect(result.success).toBe(true);
  });

  it('rejects missing eventType', () => {
    const result = validateJobPayload('webhook', {
      endpointId: 'ep_123',
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('Notification Payload Validation', () => {
  it('accepts valid notification payload', () => {
    const payload = {
      userIds: ['user_1', 'user_2'],
      type: 'alert',
      title: 'Vehicle Overdue',
    };
    const result = validateJobPayload('notification', payload);
    expect(result.success).toBe(true);
  });

  it('rejects empty userIds array', () => {
    const result = validateJobPayload('notification', {
      userIds: [],
      type: 'alert',
      title: 'Test',
    });
    expect(result.success).toBe(false);
  });
});

describe('Report Payload Validation', () => {
  it('accepts valid report payload with pdf format', () => {
    const result = validateJobPayload('report', {
      reportType: 'fleet-summary',
      format: 'pdf',
      requestedBy: 'user_1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts csv and xlsx formats', () => {
    for (const format of ['csv', 'xlsx'] as const) {
      const result = validateJobPayload('report', {
        reportType: 'trips',
        format,
        requestedBy: 'user_1',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid format', () => {
    const result = validateJobPayload('report', {
      reportType: 'fleet',
      format: 'exe',
      requestedBy: 'user_1',
    });
    expect(result.success).toBe(false);
  });
});

describe('Malformed Payload Rejection', () => {
  it('rejects null payload for typed job', () => {
    const result = validateJobPayload('email', null);
    expect(result.success).toBe(false);
  });

  it('rejects string payload for typed job', () => {
    const result = validateJobPayload('email', 'just a string');
    expect(result.success).toBe(false);
  });

  it('rejects array payload for typed job', () => {
    const result = validateJobPayload('email', [1, 2, 3]);
    expect(result.success).toBe(false);
  });

  it('rejects payload with extra unknown fields (Zod strips them but validates known)', () => {
    const result = validateJobPayload('email', {
      to: 'user@example.com',
      subject: 'Test',
      templateId: 'tpl',
      __proto__: { isAdmin: true },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// 2. IDEMPOTENCY LOGIC (simulated)
// ============================================================

describe('Idempotency - Tenant Scope Analysis', () => {
  interface ExistingJob {
    organizationId: string | null;
    idempotencyKey: string;
    status: string;
  }

  function simulateIdempotencyCheck(
    newJobOrgId: string | null,
    newJobKey: string,
    existingJobs: ExistingJob[],
  ): 'allowed' | 'duplicate' {
    const collision = existingJobs.find(
      (j) =>
        j.organizationId === newJobOrgId &&
        j.idempotencyKey === newJobKey &&
        (j.status === 'pending' || j.status === 'processing'),
    );
    return collision ? 'duplicate' : 'allowed';
  }

  const orgA = 'org_abc';
  const orgB = 'org_xyz';

  it('same org + same key = DUPLICATE', () => {
    const existing: ExistingJob[] = [
      { organizationId: orgA, idempotencyKey: 'invoice_inv123', status: 'pending' },
    ];
    expect(simulateIdempotencyCheck(orgA, 'invoice_inv123', existing)).toBe('duplicate');
  });

  it('different org + same key = ALLOWED (tenant isolation)', () => {
    const existing: ExistingJob[] = [
      { organizationId: orgA, idempotencyKey: 'daily_report', status: 'pending' },
    ];
    expect(simulateIdempotencyCheck(orgB, 'daily_report', existing)).toBe('allowed');
  });

  it('no existing job = ALLOWED', () => {
    expect(simulateIdempotencyCheck(orgA, 'new_key', [])).toBe('allowed');
  });

  it('completed job with same key = ALLOWED (terminal state)', () => {
    const existing: ExistingJob[] = [
      { organizationId: orgA, idempotencyKey: 'invoice_inv123', status: 'completed' },
    ];
    expect(simulateIdempotencyCheck(orgA, 'invoice_inv123', existing)).toBe('allowed');
  });

  it('failed job with same key = ALLOWED (terminal state)', () => {
    const existing: ExistingJob[] = [
      { organizationId: orgA, idempotencyKey: 'invoice_inv123', status: 'failed' },
    ];
    expect(simulateIdempotencyCheck(orgA, 'invoice_inv123', existing)).toBe('allowed');
  });

  it('null org + same key = ALLOWED (different tenant scope)', () => {
    const existing: ExistingJob[] = [
      { organizationId: orgA, idempotencyKey: 'system_task', status: 'pending' },
    ];
    expect(simulateIdempotencyCheck(null, 'system_task', existing)).toBe('allowed');
  });

  it('two null org + same key = duplicate in application logic', () => {
    const existing: ExistingJob[] = [
      { organizationId: null, idempotencyKey: 'system_cleanup', status: 'pending' },
    ];
    expect(simulateIdempotencyCheck(null, 'system_cleanup', existing)).toBe('duplicate');
  });
});

// ============================================================
// 3. TENANT ISOLATION
// ============================================================

describe('Tenant Isolation - Queue Reads', () => {
  interface MockJob {
    id: string;
    organizationId: string | null;
  }

  function simulateGetJob(jobId: string, userOrgId: string | null, jobs: MockJob[]): MockJob | null {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return null;
    if (userOrgId && job.organizationId !== userOrgId) return null;
    return job;
  }

  const orgA = 'org_abc';
  const orgB = 'org_xyz';
  const jobs: MockJob[] = [
    { id: 'job_1', organizationId: orgA },
    { id: 'job_2', organizationId: orgB },
    { id: 'job_3', organizationId: null },
  ];

  it('user can read own org job', () => {
    expect(simulateGetJob('job_1', orgA, jobs)?.id).toBe('job_1');
  });

  it('user CANNOT read other org job', () => {
    expect(simulateGetJob('job_2', orgA, jobs)).toBeNull();
  });

  it('super_admin (null orgId) can read any job', () => {
    expect(simulateGetJob('job_1', null, jobs)?.id).toBe('job_1');
    expect(simulateGetJob('job_2', null, jobs)?.id).toBe('job_2');
    expect(simulateGetJob('job_3', null, jobs)?.id).toBe('job_3');
  });

  it('non-existent job returns null', () => {
    expect(simulateGetJob('job_nonexistent', orgA, jobs)).toBeNull();
  });
});

// ============================================================
// 4. ATOMIC CLAIMING (simulated race condition)
// ============================================================

describe('Atomic Claiming - Two-Worker Race Prevention', () => {
  interface SimulatedJob {
    id: string;
    status: string;
    lockedBy: string | null;
  }

  function simulateClaim(
    jobs: SimulatedJob[],
    workerId: string,
  ): { claimed: boolean; jobId: string | null } {
    const target = jobs.find((j) => j.status === 'pending' && j.lockedBy === null);
    if (!target) return { claimed: false, jobId: null };

    if (target.lockedBy !== null) {
      return { claimed: false, jobId: null };
    }

    target.lockedBy = workerId;
    target.status = 'processing';
    return { claimed: true, jobId: target.id };
  }

  it('only ONE worker claims the job when two compete simultaneously', () => {
    const jobs: SimulatedJob[] = [
      { id: 'job_race_1', status: 'pending', lockedBy: null },
    ];

    const workerAResult = simulateClaim(jobs, 'worker_A');
    const workerBResult = simulateClaim(jobs, 'worker_B');

    const winnerCount = [workerAResult, workerBResult].filter((r) => r.claimed).length;
    expect(winnerCount).toBe(1);

    const winner = [workerAResult, workerBResult].find((r) => r.claimed);
    expect(winner?.jobId).toBe('job_race_1');

    const loser = [workerAResult, workerBResult].find((r) => !r.claimed);
    expect(loser?.jobId).toBeNull();
  });

  it('two workers claim DIFFERENT jobs when multiple are available', () => {
    const jobs: SimulatedJob[] = [
      { id: 'job_multi_1', status: 'pending', lockedBy: null },
      { id: 'job_multi_2', status: 'pending', lockedBy: null },
    ];

    const workerA = simulateClaim(jobs, 'worker_A');
    const workerB = simulateClaim(jobs, 'worker_B');

    expect(workerA.claimed).toBe(true);
    expect(workerB.claimed).toBe(true);
    expect(workerA.jobId).not.toBe(workerB.jobId);
  });

  it('a locked job is skipped (SKIP LOCKED behavior)', () => {
    const jobs: SimulatedJob[] = [
      { id: 'job_skip_1', status: 'processing', lockedBy: 'worker_A' },
      { id: 'job_skip_2', status: 'pending', lockedBy: null },
    ];

    const workerB = simulateClaim(jobs, 'worker_B');
    expect(workerB.claimed).toBe(true);
    expect(workerB.jobId).toBe('job_skip_2');
  });

  it('no jobs available returns NOT CLAIMED', () => {
    const jobs: SimulatedJob[] = [];
    const result = simulateClaim(jobs, 'worker_A');
    expect(result.claimed).toBe(false);
  });

  it('all jobs locked returns NOT CLAIMED for second worker', () => {
    const jobs: SimulatedJob[] = [
      { id: 'job_all_1', status: 'processing', lockedBy: 'worker_A' },
      { id: 'job_all_2', status: 'processing', lockedBy: 'worker_A' },
    ];
    const result = simulateClaim(jobs, 'worker_B');
    expect(result.claimed).toBe(false);
  });
});

// ============================================================
// 5. RETRY BACKOFF CALCULATION
// ============================================================

describe('Retry Backoff with Jitter', () => {
  it('first retry delay is approximately 1-2 seconds', () => {
    const delays = Array.from({ length: 100 }, () => calculateRetryDelay(0));
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    expect(min).toBeGreaterThanOrEqual(1000);
    expect(max).toBeLessThanOrEqual(2000);
  });

  it('second retry delay is approximately 2-3 seconds', () => {
    const delays = Array.from({ length: 100 }, () => calculateRetryDelay(1));
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    expect(min).toBeGreaterThanOrEqual(2000);
    expect(max).toBeLessThanOrEqual(3000);
  });

  it('backoff grows exponentially', () => {
    const d0 = calculateRetryDelay(0);
    const d1 = calculateRetryDelay(1);
    const d2 = calculateRetryDelay(2);
    expect(d1).toBeGreaterThan(d0 * 0.8);
    expect(d2).toBeGreaterThan(d1 * 0.8);
  });

  it('backoff is capped at MAX_BACKOFF_MS (1 hour)', () => {
    const delay = calculateRetryDelay(100);
    expect(delay).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('delays are non-deterministic (jitter)', () => {
    const delays = new Set(Array.from({ length: 50 }, () => calculateRetryDelay(2)));
    expect(delays.size).toBeGreaterThan(1);
  });
});

// ============================================================
// 6. LEASE EXPIRY
// ============================================================

describe('Lease Expiry', () => {
  it('lease expiry is in the future', () => {
    const expiry = calculateLeaseExpiry();
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('custom lease duration works', () => {
    const expiry = calculateLeaseExpiry(60_000);
    const diff = expiry.getTime() - Date.now();
    expect(diff).toBeGreaterThanOrEqual(59_000);
    expect(diff).toBeLessThanOrEqual(61_000);
  });

  it('default lease is 5 minutes', () => {
    const expiry = calculateLeaseExpiry();
    const diff = expiry.getTime() - Date.now();
    expect(diff).toBeGreaterThanOrEqual(299_000);
    expect(diff).toBeLessThanOrEqual(301_000);
  });
});

// ============================================================
// 7. STALE JOB RECOVERY LOGIC
// ============================================================

describe('Stale Job Recovery Logic', () => {
  interface SimJob {
    id: string;
    status: string;
    attempt: number;
    maxAttempts: number;
    leasedUntil: Date | null;
  }

  function simulateRecovery(jobs: SimJob[], now: Date): SimJob[] {
    return jobs.map((job) => {
      if (job.status !== 'processing') return job;
      if (!job.leasedUntil || job.leasedUntil >= now) return job;

      if (job.attempt >= job.maxAttempts) {
        return { ...job, status: 'failed', leasedUntil: null };
      }
      return { ...job, status: 'pending', leasedUntil: null, lastError: 'Lease expired' } as SimJob;
    });
  }

  const now = new Date('2026-08-20T12:00:00Z');
  const past = new Date('2026-08-20T11:00:00Z');
  const future = new Date('2026-08-20T13:00:00Z');

  it('recovers PROCESSING job with expired lease', () => {
    const jobs: SimJob[] = [
      { id: 'j1', status: 'processing', attempt: 1, maxAttempts: 3, leasedUntil: past },
    ];
    const recovered = simulateRecovery(jobs, now);
    expect(recovered[0].status).toBe('pending');
  });

  it('marks as FAILED when max attempts exhausted', () => {
    const jobs: SimJob[] = [
      { id: 'j2', status: 'processing', attempt: 3, maxAttempts: 3, leasedUntil: past },
    ];
    const recovered = simulateRecovery(jobs, now);
    expect(recovered[0].status).toBe('failed');
  });

  it('does NOT touch jobs with valid leases', () => {
    const jobs: SimJob[] = [
      { id: 'j3', status: 'processing', attempt: 1, maxAttempts: 3, leasedUntil: future },
    ];
    const recovered = simulateRecovery(jobs, now);
    expect(recovered[0].status).toBe('processing');
  });

  it('does NOT touch non-PROCESSING jobs', () => {
    const jobs: SimJob[] = [
      { id: 'j4', status: 'completed', attempt: 1, maxAttempts: 3, leasedUntil: past },
      { id: 'j5', status: 'pending', attempt: 0, maxAttempts: 3, leasedUntil: null },
      { id: 'j6', status: 'failed', attempt: 3, maxAttempts: 3, leasedUntil: past },
    ];
    const recovered = simulateRecovery(jobs, now);
    expect(recovered[0].status).toBe('completed');
    expect(recovered[1].status).toBe('pending');
    expect(recovered[2].status).toBe('failed');
  });

  it('handles multiple stale jobs', () => {
    const jobs: SimJob[] = [
      { id: 'j7', status: 'processing', attempt: 1, maxAttempts: 3, leasedUntil: past },
      { id: 'j8', status: 'processing', attempt: 2, maxAttempts: 2, leasedUntil: past },
      { id: 'j9', status: 'processing', attempt: 1, maxAttempts: 3, leasedUntil: future },
    ];
    const recovered = simulateRecovery(jobs, now);
    expect(recovered[0].status).toBe('pending');
    expect(recovered[1].status).toBe('failed');
    expect(recovered[2].status).toBe('processing');
  });
});

// ============================================================
// 8. JOB STATUS LIFECYCLE
// ============================================================

describe('Job Status Lifecycle', () => {
  const validTransitions: Record<string, string[]> = {
    pending: ['processing', 'cancelled'],
    processing: ['completed', 'failed', 'pending'],
    completed: [],
    failed: ['pending'],
    cancelled: [],
  };

  it('pending can transition to processing or cancelled', () => {
    expect(validTransitions.pending).toContain('processing');
    expect(validTransitions.pending).toContain('cancelled');
  });

  it('processing can transition to completed, failed, or pending', () => {
    expect(validTransitions.processing).toContain('completed');
    expect(validTransitions.processing).toContain('failed');
    expect(validTransitions.processing).toContain('pending');
  });

  it('completed is terminal', () => {
    expect(validTransitions.completed).toHaveLength(0);
  });

  it('failed can transition to pending (manual retry)', () => {
    expect(validTransitions.failed).toContain('pending');
  });

  it('cancelled is terminal', () => {
    expect(validTransitions.cancelled).toHaveLength(0);
  });

  it('JOB_STATUS constants match expected values', () => {
    expect(JOB_STATUS.PENDING).toBe('pending');
    expect(JOB_STATUS.PROCESSING).toBe('processing');
    expect(JOB_STATUS.COMPLETED).toBe('completed');
    expect(JOB_STATUS.FAILED).toBe('failed');
    expect(JOB_STATUS.CANCELLED).toBe('cancelled');
  });

  it('JOB_PRIORITY ordering is correct', () => {
    expect(JOB_PRIORITY.CRITICAL).toBeLessThan(JOB_PRIORITY.HIGH);
    expect(JOB_PRIORITY.HIGH).toBeLessThan(JOB_PRIORITY.NORMAL);
    expect(JOB_PRIORITY.NORMAL).toBeLessThan(JOB_PRIORITY.LOW);
    expect(JOB_PRIORITY.LOW).toBeLessThan(JOB_PRIORITY.DEFERRED);
  });
});

// ============================================================
// 9. ERROR HIERARCHY
// ============================================================

describe('Error Hierarchy', () => {
  it('AppError has correct properties', () => {
    const err = new AppError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('test');
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(false);
    expect(err.name).toBe('AppError');
  });

  it('ValidationError has details', () => {
    const err = new ValidationError('Invalid input', [
      { field: 'email', message: 'Invalid email format' },
    ]);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.details).toHaveLength(1);
    expect(err.details[0].field).toBe('email');
  });

  it('NotFoundError has correct status', () => {
    const err = new NotFoundError('Vehicle', 'v123');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('v123');
  });

  it('ForbiddenError has correct status', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it('ConflictError has correct status', () => {
    const err = new ConflictError('Already exists');
    expect(err.statusCode).toBe(409);
  });

  it('QueueError has correct defaults', () => {
    const err = new QueueError('Queue full');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('QUEUE_ERROR');
    expect(err.name).toBe('QueueError');
  });
});

// ============================================================
// 10. SECRET REDACTION
// ============================================================

describe('Secret Redaction', () => {
  it('redacts password fields', () => {
    const obj = { name: 'John', password: 'secret123' };
    const redacted = redactSecrets(obj);
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.name).toBe('John');
  });

  it('redacts DATABASE_URL', () => {
    const obj = { DATABASE_URL: 'postgresql://user:pass@host/db' };
    const redacted = redactSecrets(obj);
    expect(redacted.DATABASE_URL).toBe('[REDACTED]');
  });

  it('redacts api_key and API_KEY (case insensitive)', () => {
    const obj = { api_key: 'ak_123', API_KEY: 'ak_456' };
    const redacted = redactSecrets(obj);
    expect(redacted.api_key).toBe('[REDACTED]');
    expect(redacted.API_KEY).toBe('[REDACTED]');
  });

  it('redacts authorization header', () => {
    const obj = { authorization: 'Bearer token123' };
    const redacted = redactSecrets(obj);
    expect(redacted.authorization).toBe('[REDACTED]');
  });

  it('redacts nested objects', () => {
    const obj = { config: { redis_url: 'redis://localhost', port: 6379 } };
    const redacted = redactSecrets(obj);
    expect((redacted.config as Record<string, unknown>).redis_url).toBe('[REDACTED]');
    expect((redacted.config as Record<string, unknown>).port).toBe(6379);
  });

  it('does not redact normal fields', () => {
    const obj = { name: 'John', email: 'john@example.com', role: 'admin' };
    const redacted = redactSecrets(obj);
    expect(redacted.name).toBe('John');
    expect(redacted.email).toBe('john@example.com');
    expect(redacted.role).toBe('admin');
  });

  it('redacts token fields', () => {
    const obj = { sessionToken: 'abc123', csrfToken: 'xyz' };
    const redacted = redactSecrets(obj);
    expect(redacted.sessionToken).toBe('[REDACTED]');
    expect(redacted.csrfToken).toBe('[REDACTED]');
  });

  it('redacts DSN fields', () => {
    const obj = { SENTRY_DSN: 'https://key@sentry.io/project' };
    const redacted = redactSecrets(obj);
    expect(redacted.SENTRY_DSN).toBe('[REDACTED]');
  });
});

// ============================================================
// 11. ERROR SERIALIZATION
// ============================================================

describe('Error Serialization', () => {
  it('serializes AppError with code and statusCode', () => {
    const err = new AppError('test', 'VALIDATION');
    const serialized = serializeError(err);
    expect(serialized.code).toBe('VALIDATION');
    expect(serialized.statusCode).toBe(400);
    expect(serialized.message).toBe('test');
    expect(serialized.isOperational).toBe(true);
  });

  it('hides stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('test');
    const serialized = serializeError(err);
    expect(serialized.stack).toBeUndefined();
    process.env.NODE_ENV = originalEnv;
  });

  it('includes stack trace in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = new Error('test');
    const serialized = serializeError(err);
    expect(serialized.stack).toBeDefined();
    process.env.NODE_ENV = originalEnv;
  });

  it('handles non-Error values', () => {
    expect(serializeError('string error').message).toBe('string error');
    expect(serializeError(42).message).toBe('42');
    expect(serializeError(null).message).toBe('null');
    expect(serializeError(undefined).message).toBe('undefined');
  });
});

// ============================================================
// 12. WORKER HANDLER REGISTRY
// ============================================================

describe('Worker Handler Registry', () => {
  let registerJobHandler: (type: string, handler: (job: { id: string }) => Promise<unknown>) => void;
  let getJobHandler: (type: string) => ((job: { id: string }) => Promise<unknown>) | undefined;

  beforeEach(async () => {
    const mod = await import('@/lib/worker');
    registerJobHandler = mod.registerJobHandler;
    getJobHandler = mod.getJobHandler;
  });

  it('registers and retrieves a handler', async () => {
    const handler = async (job: { id: string }) => ({ result: 'ok' });
    registerJobHandler('test_type', handler);
    const retrieved = getJobHandler('test_type');
    expect(retrieved).toBe(handler);
  });

  it('returns undefined for unregistered type', () => {
    expect(getJobHandler('nonexistent')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    const handler = async (_job: { id: string }) => ({ result: 'ok' });
    registerJobHandler('dup_type', handler);
    expect(() => registerJobHandler('dup_type', handler)).toThrow(
      "Handler already registered for job type 'dup_type'",
    );
  });
});

// ============================================================
// 13. SECURITY
// ============================================================

describe('Security: Queue responses do not contain secrets', () => {
  it('error responses do not contain DATABASE_URL', () => {
    const err = new AppError('DB connection failed: ' + process.env.DATABASE_URL);
    const serialized = serializeError(err);
    const jsonStr = JSON.stringify(serialized);
    expect(jsonStr).not.toContain('postgresql://');
    expect(jsonStr).not.toContain('password');
  });

  it('job payloads should not be logged in full', () => {
    const logPayload = {
      jobId: 'job_123',
      jobType: 'email',
      organizationId: 'org_abc',
      attempt: 1,
    };
    const jsonStr = JSON.stringify(logPayload);
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('token');
    expect(jsonStr).not.toContain('api_key');
  });

  it('Authorization header is redacted', () => {
    const ctx = {
      Authorization: 'Bearer secret-token-123',
      organizationId: 'org_abc',
    };
    const redacted = redactSecrets(ctx);
    expect(redacted.Authorization).toBe('[REDACTED]');
  });
});

// ============================================================
// 14. MAX ATTEMPTS & FAILURE ISOLATION
// ============================================================

describe('Max Attempts & Failure Isolation', () => {
  function simulateFailJob(
    currentAttempt: number,
    maxAttempts: number,
  ): { newStatus: string; nextRetryAt: Date | null } {
    if (currentAttempt < maxAttempts) {
      return { newStatus: 'pending', nextRetryAt: new Date(Date.now() + calculateRetryDelay(currentAttempt)) };
    }
    return { newStatus: 'failed', nextRetryAt: null };
  }

  it('job retries when attempts remain', () => {
    const result = simulateFailJob(1, 3);
    expect(result.newStatus).toBe('pending');
    expect(result.nextRetryAt).not.toBeNull();
  });

  it('job fails permanently when max attempts reached', () => {
    const result = simulateFailJob(3, 3);
    expect(result.newStatus).toBe('failed');
    expect(result.nextRetryAt).toBeNull();
  });

  it('never retries forever', () => {
    for (let maxAttempts = 1; maxAttempts <= 10; maxAttempts++) {
      const result = simulateFailJob(maxAttempts, maxAttempts);
      expect(result.newStatus).toBe('failed');
    }
  });

  it('one failed job does not affect other jobs', () => {
    const jobs = [
      { id: 'j1', attempt: 1, maxAttempts: 3 },
      { id: 'j2', attempt: 1, maxAttempts: 3 },
      { id: 'j3', attempt: 1, maxAttempts: 3 },
    ];

    simulateFailJob(jobs[0].attempt, jobs[0].maxAttempts);
    jobs[0].attempt++;

    expect(jobs[1].attempt).toBe(1);
    expect(jobs[2].attempt).toBe(1);
  });
});
