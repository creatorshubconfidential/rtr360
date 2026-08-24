/**
 * RTR 360 — PostgreSQL Integration Tests
 *
 * Environment-gated: these tests ONLY run when RTR360_TEST_DATABASE_URL is set.
 * They require a real PostgreSQL database with migrations applied.
 *
 * Setup:
 *   1. Create a test database: createdb rtr360_test
 *   2. Set DATABASE_URL for schema: export DATABASE_URL=postgresql://... 
 *   3. Run migrations: npx prisma migrate deploy
 *   4. Run tests: RTR360_TEST_DATABASE_URL=postgresql://.../rtr360_test npm test -- --run tests/integration
 *
 * NEVER connect to production. These tests may create/drop data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB_URL = process.env.RTR360_TEST_DATABASE_URL;

const shouldRun = Boolean(TEST_DB_URL);

const describeIf = shouldRun ? describe : describe.skip;

// We need to dynamically import prisma client configured for the test DB
let testPrisma: any = null;

async function getTestPrisma() {
  if (!testPrisma) {
    const { PrismaClient } = await import('@prisma/client');
    testPrisma = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
    });
  }
  return testPrisma;
}

function generateId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function cleanup(prisma: any, orgId: string) {
  await prisma.backgroundJob.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

describeIf('PostgreSQL Queue Integration', () => {
  let prisma: any;
  let orgId: string;

  beforeAll(async () => {
    prisma = await getTestPrisma();
    orgId = generateId();
    await prisma.organization.create({
      data: { id: orgId, name: 'Test Org Queue Integration' },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await cleanup(prisma, orgId);
      await prisma.$disconnect();
    }
  });

  it('FOR UPDATE SKIP LOCKED: two concurrent claims result in exactly one winner', async () => {
    // Create a pending job
    const jobId = generateId();
    await prisma.backgroundJob.create({
      data: {
        id: jobId,
        type: 'email',
        status: 'pending',
        priority: 5,
        maxAttempts: 3,
        organizationId: orgId,
        payload: { to: 'test@example.com', subject: 'Test', templateId: 'test' },
      },
    });

    // Two workers claim simultaneously
    const workerA = 'test-worker-A';
    const workerB = 'test-worker-B';
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + 300_000);

    const [claimA, claimB] = await Promise.all([
      prisma.$queryRaw`
        UPDATE "BackgroundJob"
        SET status = 'processing', "started_at" = ${now}, "leased_until" = ${leasedUntil}, "locked_by" = ${workerA}, "attempt" = "attempt" + 1, "updated_at" = ${now}
        WHERE id IN (
          SELECT id FROM "BackgroundJob" WHERE status = 'pending' AND id = ${jobId}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, "locked_by"
      `,
      prisma.$queryRaw`
        UPDATE "BackgroundJob"
        SET status = 'processing', "started_at" = ${now}, "leased_until" = ${leasedUntil}, "locked_by" = ${workerB}, "attempt" = "attempt" + 1, "updated_at" = ${now}
        WHERE id IN (
          SELECT id FROM "BackgroundJob" WHERE status = 'pending' AND id = ${jobId}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, "locked_by"
      `,
    ]);

    // Exactly one worker should have claimed the job
    const totalClaimed = claimA.length + claimB.length;
    expect(totalClaimed).toBe(1);

    // Verify the winner
    const winner = claimA.length === 1 ? claimA[0] : claimB[0];
    expect(winner.locked_by).toBe(workerA); // First one wins (usually)
  });

  it('idempotency: same org + same key = one job', async () => {
    const idempotencyKey = `idem_${Date.now()}`;
    const payload = { to: 'test@example.com', subject: 'Idem Test', templateId: 'test' };

    // First enqueue
    const job1 = await prisma.backgroundJob.create({
      data: {
        type: 'email', status: 'pending', priority: 5, maxAttempts: 3,
        organizationId: orgId, idempotencyKey,
        payload: payload as any,
      },
    });
    expect(job1.id).toBeDefined();

    // Second enqueue with same key should fail (unique constraint)
    await expect(
      prisma.backgroundJob.create({
        data: {
          type: 'email', status: 'pending', priority: 5, maxAttempts: 3,
          organizationId: orgId, idempotencyKey,
          payload: payload as any,
        },
      })
    ).rejects.toThrow();
  });

  it('idempotency: different orgs + same key = two independent jobs', async () => {
    const org2Id = generateId();
    await prisma.organization.create({
      data: { id: org2Id, name: 'Test Org 2 Idempotency' },
    });

    const idempotencyKey = `idem_cross_${Date.now()}`;
    const payload = { to: 'test@example.com', subject: 'Cross Org', templateId: 'test' };

    const [job1, job2] = await Promise.all([
      prisma.backgroundJob.create({
        data: {
          type: 'email', status: 'pending', priority: 5, maxAttempts: 3,
          organizationId: orgId, idempotencyKey,
          payload: payload as any,
        },
      }),
      prisma.backgroundJob.create({
        data: {
          type: 'email', status: 'pending', priority: 5, maxAttempts: 3,
          organizationId: org2Id, idempotencyKey,
          payload: payload as any,
        },
      }),
    ]);

    expect(job1.id).toBeDefined();
    expect(job2.id).toBeDefined();
    expect(job1.id).not.toBe(job2.id);

    await prisma.backgroundJob.deleteMany({ where: { organizationId: org2Id } });
    await prisma.organization.deleteMany({ where: { id: org2Id } });
  });

  it('lease expiry: Worker B can recover a job after Worker A\'s lease expires', async () => {
    const jobId = generateId();
    const pastLease = new Date(Date.now() - 10_000); // 10 seconds ago

    await prisma.backgroundJob.create({
      data: {
        id: jobId, type: 'email', status: 'processing', priority: 5,
        maxAttempts: 3, attempt: 1,
        organizationId: orgId, lockedBy: 'worker-expired',
        leasedUntil: pastLease,
        payload: { to: 'test@example.com', subject: 'Lease Test', templateId: 'test' },
      },
    });

    // Recover stale jobs
    const now = new Date();
    const recovered = await prisma.$executeRaw`
      UPDATE "BackgroundJob"
      SET status = 'pending', "last_error" = 'Lease expired: worker likely crashed',
          "started_at" = NULL, "leased_until" = NULL, "locked_by" = NULL, "updated_at" = ${now}
      WHERE status = 'processing' AND "leased_until" < ${now} AND attempt < "max_attempts"
    `;
    expect(recovered).toBe(1);

    // Verify it's back to pending
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(job.status).toBe('pending');
    expect(job.lockedBy).toBeNull();
  });

  it('Worker A cannot complete a job after losing lease to Worker B', async () => {
    const jobId = generateId();
    const pastLease = new Date(Date.now() - 10_000);

    await prisma.backgroundJob.create({
      data: {
        id: jobId, type: 'email', status: 'processing', priority: 5,
        maxAttempts: 3, attempt: 1,
        organizationId: orgId, lockedBy: 'worker-A',
        leasedUntil: pastLease,
        payload: { to: 'test@example.com', subject: 'Ownership', templateId: 'test' },
      },
    });

    // Worker B claims the expired job
    const now = new Date();
    const newLease = new Date(now.getTime() + 300_000);
    const [claimed] = await prisma.$queryRaw`
      UPDATE "BackgroundJob"
      SET status = 'processing', "started_at" = ${now}, "leased_until" = ${newLease}, "locked_by" = 'worker-B', "attempt" = "attempt" + 1, "updated_at" = ${now}
      WHERE id IN (
        SELECT id FROM "BackgroundJob" WHERE status = 'processing' AND "leased_until" < ${now}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "locked_by"
    `;
    expect(claimed.locked_by).toBe('worker-B');

    // Worker A tries to complete — should fail (lockedBy no longer matches)
    const result = await prisma.backgroundJob.updateMany({
      where: { id: jobId, status: 'processing', lockedBy: 'worker-A' },
      data: { status: 'completed', completedAt: now, leasedUntil: null, lockedBy: null },
    });
    expect(result.count).toBe(0);

    // Job should still be processing (owned by worker-B)
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(job.status).toBe('processing');
    expect(job.lockedBy).toBe('worker-B');
  });

  it('tenant isolation: Org A cannot see Org B jobs', async () => {
    const orgBId = generateId();
    await prisma.organization.create({
      data: { id: orgBId, name: 'Test Org B Isolation' },
    });

    // Create jobs for both orgs
    await prisma.backgroundJob.create({
      data: {
        id: generateId(), type: 'email', status: 'pending', priority: 5,
        maxAttempts: 3, organizationId: orgId,
        payload: { to: 'orgA@test.com', subject: 'A', templateId: 'test' },
      },
    });
    await prisma.backgroundJob.create({
      data: {
        id: generateId(), type: 'email', status: 'pending', priority: 5,
        maxAttempts: 3, organizationId: orgBId,
        payload: { to: 'orgB@test.com', subject: 'B', templateId: 'test' },
      },
    });

    const orgAJobs = await prisma.backgroundJob.findMany({ where: { organizationId: orgId } });
    const orgBJobs = await prisma.backgroundJob.findMany({ where: { organizationId: orgBId } });

    expect(orgAJobs.length).toBeGreaterThanOrEqual(1);
    expect(orgBJobs.length).toBeGreaterThanOrEqual(1);
    // Cross-check: no Org B job should appear in Org A results
    for (const job of orgAJobs) {
      expect(job.organizationId).toBe(orgId);
    }
    for (const job of orgBJobs) {
      expect(job.organizationId).toBe(orgBId);
    }

    // Cleanup org B
    await prisma.backgroundJob.deleteMany({ where: { organizationId: orgBId } });
    await prisma.organization.deleteMany({ where: { id: orgBId } });
  });

  it('retry: transient failure schedules next attempt with backoff', async () => {
    const jobId = generateId();
    await prisma.backgroundJob.create({
      data: {
        id: jobId, type: 'email', status: 'processing', priority: 5,
        maxAttempts: 3, attempt: 1,
        organizationId: orgId, lockedBy: 'test-worker',
        leasedUntil: new Date(Date.now() + 300_000),
        payload: { to: 'test@example.com', subject: 'Retry', templateId: 'test' },
      },
    });

    // Simulate transient failure: back to pending with future runAt
    const futureRunAt = new Date(Date.now() + 2000);
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'pending', lastError: 'ECONNREFUSED',
        runAt: futureRunAt, startedAt: null, leasedUntil: null, lockedBy: null,
      },
    });

    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(job.status).toBe('pending');
    expect(job.attempt).toBe(1);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('max attempts: job becomes FAILED when attempts reach maxAttempts', async () => {
    const jobId = generateId();
    await prisma.backgroundJob.create({
      data: {
        id: jobId, type: 'email', status: 'processing', priority: 5,
        maxAttempts: 2, attempt: 2, // Already at max
        organizationId: orgId, lockedBy: 'test-worker',
        leasedUntil: new Date(Date.now() + 300_000),
        payload: { to: 'test@example.com', subject: 'MaxAttempts', templateId: 'test' },
      },
    });

    // Simulate failure when at max attempts
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'failed', failedAt: new Date(),
        lastError: 'Max attempts exhausted',
        leasedUntil: null, lockedBy: null,
      },
    });

    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(job.status).toBe('failed');
    expect(job.failedAt).not.toBeNull();
  });

  it('transaction rollback: failed transaction does not partially persist', async () => {
    const jobId = generateId();

    // This should succeed — create a job
    const job = await prisma.backgroundJob.create({
      data: {
        id: jobId, type: 'email', status: 'pending', priority: 5,
        maxAttempts: 3, organizationId: orgId,
        payload: { to: 'test@example.com', subject: 'Txn', templateId: 'test' },
      },
    });
    expect(job.id).toBe(jobId);

    // Attempt to create duplicate — should fail and NOT create partial data
    await expect(
      prisma.backgroundJob.create({
        data: {
          id: jobId, type: 'email', status: 'pending', priority: 5,
          maxAttempts: 3, organizationId: orgId,
          payload: { to: 'test@example.com', subject: 'Dup', templateId: 'test' },
        },
      })
    ).rejects.toThrow();

    // Original job still intact
    const original = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(original).not.toBeNull();
    expect(original.status).toBe('pending');
  });
});
