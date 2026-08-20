/**
 * RTR 360 — Notification Job Handler
 *
 * Sends in-app notifications to users within an organization.
 * Creates Notification records in the database.
 * Tenant-scoped: only users in the same organization receive notifications.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ClaimedJob } from '@/lib/queue';
import type { NotificationPayload } from '@/lib/job-types';
import { ValidationError } from '@/lib/errors';

/**
 * Notification job handler.
 * Creates in-app notification records for the specified users.
 * Enforces tenant boundaries: all userIds must belong to the same organization.
 */
export async function handleNotificationJob(job: ClaimedJob): Promise<{ created: number }> {
  // Tenant boundary: notification jobs must have an organizationId
  if (!job.organizationId) {
    throw new ValidationError('Notification jobs require an organizationId', [
      { field: 'organizationId', message: 'Tenant-scoped job missing organizationId' },
    ]);
  }

  const payload = job.payload as Record<string, unknown>;
  const notifPayload: NotificationPayload = {
    userIds: Array.isArray(payload.userIds) ? payload.userIds.map(String) : [],
    type: String(payload.type ?? ''),
    title: String(payload.title ?? ''),
    body: payload.body !== undefined ? String(payload.body) : undefined,
    metadata: payload.metadata as Record<string, unknown> | undefined,
  };

  if (notifPayload.userIds.length === 0) {
    throw new ValidationError('At least one userId is required', [
      { field: 'userIds', message: 'userIds must be a non-empty array' },
    ]);
  }

  if (!notifPayload.title) {
    throw new ValidationError('Notification title is required', [
      { field: 'title', message: 'title cannot be empty' },
    ]);
  }

  // Verify all target users belong to the same organization (tenant boundary)
  const usersInOrg = await db.user.count({
    where: {
      id: { in: notifPayload.userIds },
      organizationId: job.organizationId,
    },
  });

  if (usersInOrg !== notifPayload.userIds.length) {
    logger.security('notification.cross_tenant_access_attempt', {
      jobId: job.id,
      organizationId: job.organizationId,
      requestedUserIds: notifPayload.userIds,
      matchedCount: usersInOrg,
      requestId: job.requestId,
    });
    throw new ValidationError(
      'Some target users do not belong to this organization',
      [{ field: 'userIds', message: 'All userIds must belong to the job\'s organization' }],
    );
  }

  // Create notifications
  const createData = notifPayload.userIds.map((userId) => ({
    userId,
    organizationId: job.organizationId!,
    type: notifPayload.type,
    title: notifPayload.title,
    body: notifPayload.body ?? null,
    metadata: notifPayload.metadata ? JSON.stringify(notifPayload.metadata) : null,
    read: false,
  }));

  const result = await db.notification.createMany({ data: createData });

  logger.info('notification.created', {
    jobId: job.id,
    jobType: job.type,
    organizationId: job.organizationId,
    recipientCount: result.count,
    type: notifPayload.type,
    requestId: job.requestId,
  });

  return { created: result.count };
}
