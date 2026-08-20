/**
 * RTR 360 — Single Job API
 *
 * GET /api/jobs/[id] — Get a single job (tenant-scoped)
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission, JOBS_MANAGE } from '@/lib/permissions';
import { getJob } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { errorResponse, NotFoundError } from '@/lib/errors';
import { getRequestId } from '@/lib/request-id';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);

  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const permErr = requirePermission(user, JOBS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    if (!id || typeof id !== 'string') {
      throw new NotFoundError('Job', id);
    }

    // Tenant-scoped lookup: organizationId comes from session
    const job = await getJob(id, user.role === 'super_admin' ? undefined : user.organizationId);

    if (!job) {
      throw new NotFoundError('Job', id);
    }

    // For non-super_admin, verify the job belongs to their org
    if (user.role !== 'super_admin' && job.organizationId !== user.organizationId) {
      logger.security('job.cross_tenant_access_attempt', {
        jobId: id,
        userId: user.id,
        userOrgId: user.organizationId,
        jobOrgId: job.organizationId,
        requestId,
      });
      throw new NotFoundError('Job', id);
    }

    // Return safe subset — never expose payload secrets, worker internals
    const safeJob = {
      id: job.id,
      type: job.type,
      status: job.status,
      priority: job.priority,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      runAt: job.runAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      requestId: job.requestId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      organizationId: job.organizationId,
    };

    return NextResponse.json({ job: safeJob });
  } catch (error) {
    const { status, body } = errorResponse(error, requestId);
    return NextResponse.json(body, { status });
  }
}
