/**
 * RTR 360 — Retry Job API
 *
 * POST /api/jobs/[id]/retry — Retry a failed/cancelled job
 *
 * Only failed/cancelled jobs can be retried.
 * Resets attempt, lastError, scheduling fields.
 * Preserves auditability — never deletes the record.
 * Tenant-scoped + permission-protected.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireAuth } from '@/lib/auth';
import { requirePermission, JOBS_MANAGE } from '@/lib/permissions';
import { retryJob } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { errorResponse } from '@/lib/errors';
import { getRequestId } from '@/lib/request-id';
import { logAudit, getClientIp } from '@/lib/audit';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);

  const rl = await checkRateLimit(request, 'strict');
  if (rl) return rl;

  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const permErr = requirePermission(user, JOBS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Tenant-scoped retry: organizationId from session
    const updated = await retryJob(id, user.role === 'super_admin' ? undefined : user.organizationId);

    await logAudit({
      user,
      action: 'update',
      entity: 'BackgroundJob',
      entityId: id,
      metadata: { previousStatus: 'failed_or_cancelled', newStatus: 'pending' },
      ipAddress: getClientIp(request),
    });

    logger.info('job.retry_requested', {
      jobId: id,
      userId: user.id,
      organizationId: user.organizationId,
      requestId,
    });

    return NextResponse.json({
      success: true,
      job: {
        id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    const { status, body } = errorResponse(error, requestId);
    return NextResponse.json(body, { status });
  }
}
