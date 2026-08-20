/**
 * RTR 360 — Dead Letter Queue API
 *
 * GET /api/jobs/dead-letter — List failed jobs (tenant-scoped, paginated)
 *
 * Provides operational visibility into permanently failed jobs.
 * Never exposes secrets, stack traces, or full payloads.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission, JOBS_MANAGE } from '@/lib/permissions';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { errorResponse } from '@/lib/errors';
import { getRequestId } from '@/lib/request-id';
import { JOB_STATUS } from '@/lib/job-types';
import { Prisma } from '@prisma/client';

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
    const type = searchParams.get('type');

    // Build tenant-scoped where clause
    const where: Prisma.BackgroundJobWhereInput = {
      status: JOB_STATUS.FAILED,
    };

    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (type) {
      where.type = type;
    }

    const [jobs, total] = await Promise.all([
      db.backgroundJob.findMany({
        where,
        orderBy: { failedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          attempt: true,
          maxAttempts: true,
          lastError: true,
          failedAt: true,
          createdAt: true,
          organizationId: true,
          requestId: true,
        },
      }),
      db.backgroundJob.count({ where }),
    ]);

    logger.info('job.dead_letter_list', {
      requestId,
      userId: user.id,
      organizationId: user.organizationId,
      page,
      limit,
      total,
    });

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    const { status, body } = errorResponse(error, requestId);
    return NextResponse.json(body, { status });
  }
}
