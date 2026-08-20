/**
 * RTR 360 — Queue API
 *
 * POST /api/jobs  — Enqueue a new background job
 * GET  /api/jobs  — List jobs (tenant-scoped, paginated)
 *
 * Security:
 *   - Auth required
 *   - JOBS_MANAGE permission required for enqueue
 *   - organizationId derived from session, never from request body
 *   - Rate limited
 *   - Audit logged
 *   - requestId in all logs
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireAuth } from '@/lib/auth';
import { requirePermission, JOBS_MANAGE } from '@/lib/permissions';
import { enqueue, getQueueStats } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { errorResponse, ValidationError } from '@/lib/errors';
import { getRequestId } from '@/lib/request-id';
import { logAudit, getClientIp } from '@/lib/audit';
import { db } from '@/lib/db';
import { JOB_TYPES, JOB_STATUS } from '@/lib/job-types';
import { Prisma } from '@prisma/client';

// ── Sort field allowlist ────────────────────────────────────────

const ALLOWED_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'priority',
  'status',
  'runAt',
  'attempt',
  'type',
]) as ReadonlySet<string>;

// ── Enqueue Schema ─────────────────────────────────────────────

/** Fields that MUST be server-derived — never accepted from the client */
const FORBIDDEN_ENQUEUE_FIELDS = new Set([
  'organizationId',
  'userId',
  'createdAt',
  'status',
  'attempt',
  'lockedBy',
  'leasedUntil',
  'completedAt',
  'failedAt',
  'startedAt',
  'lastError',
  'result',
  'id',
  'updatedAt',
]) as ReadonlySet<string>;

const enqueueSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  priority: z.number().int().min(1).max(10).optional(),
  runAt: z.string().datetime().optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

// ── POST /api/jobs ──────────────────────────────────────────────

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  const rl = await checkRateLimit(request, 'strict');
  if (rl) return rl;

  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const permErr = requirePermission(user, JOBS_MANAGE);
    if (permErr) return permErr;

    // Enqueue requires an organization
    if (!user.organizationId && user.role !== 'super_admin') {
      logger.security('job.enqueue_without_org', {
        userId: user.id,
        role: user.role,
        requestId,
      });
      return NextResponse.json(
        { error: 'You must belong to an organization to enqueue jobs' },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Mass-assignment protection: reject forbidden fields
    const forbiddenFound = Object.keys(body).filter((k) => FORBIDDEN_ENQUEUE_FIELDS.has(k));
    if (forbiddenFound.length > 0) {
      logger.security('job.mass_assignment_blocked', {
        userId: user.id,
        fields: forbiddenFound,
        requestId,
      });
      return NextResponse.json(
        { error: 'Forbidden fields in request body', forbiddenFields: forbiddenFound },
        { status: 400 },
      );
    }

    // Validate with Zod
    const parsed = enqueueSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      throw new ValidationError('Invalid enqueue request', issues);
    }

    const { type, payload, priority, runAt, maxAttempts, idempotencyKey } = parsed.data;

    // Verify job type is in the static registry (no arbitrary handler execution)
    if (!JOB_TYPES[type]) {
      throw new ValidationError(`Unknown job type: '${type}'`, [
        { field: 'type', message: `Job type '${type}' is not registered` },
      ]);
    }

    // Enqueue using the existing queue implementation
    // organizationId and userId come from the authenticated session
    const result = await enqueue({
      type,
      payload,
      organizationId: user.organizationId,
      userId: user.id,
      priority,
      runAt: runAt ? new Date(runAt) : undefined,
      maxAttempts,
      idempotencyKey,
      requestId,
    });

    await logAudit({
      user,
      action: 'create',
      entity: 'BackgroundJob',
      entityId: result.id,
      metadata: { type, priority, idempotencyKey: idempotencyKey ?? null },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(
      {
        success: true,
        jobId: result.id,
        enqueued: result.count === 1,
        duplicate: result.count === 0,
      },
      { status: result.count === 1 ? 201 : 200 },
    );
  } catch (error) {
    const { status, body } = errorResponse(error, requestId);
    return NextResponse.json(body, { status });
  }
}

// ── GET /api/jobs ────────────────────────────────────────────────

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const permErr = requirePermission(user, JOBS_MANAGE);
    if (permErr) return permErr;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const sortBy = searchParams.get('sortBy');
    const sortOrder = searchParams.get('sortOrder');

    // Build tenant-scoped where clause
    const where: Prisma.BackgroundJobWhereInput = {};

    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && Object.values(JOB_STATUS).includes(status as (typeof JOB_STATUS)[keyof typeof JOB_STATUS])) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    // Date range filter
    if (fromDate || toDate) {
      const createdAtFilter: Prisma.BackgroundJobWhereInput['createdAt'] = {};
      if (fromDate) createdAtFilter!.gte = new Date(fromDate);
      if (toDate) createdAtFilter!.lte = new Date(toDate);
      where.createdAt = createdAtFilter;
    }

    // Safe sort: only allowlisted fields, only asc/desc
    let orderBy: Prisma.BackgroundJobOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy && ALLOWED_SORT_FIELDS.has(sortBy)) {
      const direction = sortOrder === 'asc' ? 'asc' : 'desc';
      orderBy = { [sortBy]: direction };
    }

    const [jobs, total] = await Promise.all([
      db.backgroundJob.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          priority: true,
          attempt: true,
          maxAttempts: true,
          lastError: true,
          runAt: true,
          startedAt: true,
          completedAt: true,
          failedAt: true,
          requestId: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
          // NEVER expose: payload, result, lockedBy, leasedUntil, userId
        },
      }),
      db.backgroundJob.count({ where }),
    ]);

    // Get stats for this tenant
    const stats = await getQueueStats(
      user.role === 'super_admin' ? undefined : user.organizationId,
    );

    logger.info('job.list', {
      requestId,
      userId: user.id,
      organizationId: user.organizationId,
      page,
      limit,
      total,
      filters: { status, type, fromDate, toDate },
    });

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    });
  } catch (error) {
    const { status, body } = errorResponse(error, requestId);
    return NextResponse.json(body, { status });
  }
}
