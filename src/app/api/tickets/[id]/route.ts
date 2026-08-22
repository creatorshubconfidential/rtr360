import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, TICKETS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['open', 'in_progress', 'pending', 'resolved', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: TICKETS_MANAGE
    const permErr = requirePermission(user, TICKETS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const {
      status,
      priority,
      description,
      vehiclePlate,
      assignedToId,
      resolvedAt,
    } = body;

    const existing = await db.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Verify ownership (tenant isolation)
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return NextResponse.json(
          { error: `Invalid priority. Valid: ${VALID_PRIORITIES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.priority = priority;
    }

    if (description !== undefined) updateData.description = description?.trim() || null;
    if (vehiclePlate !== undefined) updateData.vehiclePlate = vehiclePlate?.trim() || null;
    if (assignedToId !== undefined) {
      if (assignedToId) {
        // Validate assignee belongs to same org (prevent cross-tenant FK assignment)
        const assignee = await db.user.findFirst({
          where: user.role !== 'super_admin' && user.organizationId
            ? { id: assignedToId, organizationId: user.organizationId }
            : { id: assignedToId },
          select: { id: true },
        });
        if (!assignee) {
          return NextResponse.json({ error: 'Assigned user not found' }, { status: 400 });
        }
      }
      updateData.assignedToId = assignedToId || null;
    }
    if (resolvedAt !== undefined) updateData.resolvedAt = resolvedAt ? new Date(resolvedAt) : null;

    // Auto-set resolvedAt when status changes to 'resolved' or 'closed'
    if (status === 'resolved' || status === 'closed') {
      updateData.resolvedAt = new Date();
    }

    const ticket = await db.ticket.update({
      where: { id },
      data: updateData,
      include: {
        organization: { select: { id: true, name: true } },
      },
    });
        await logAudit({ user, action: 'update', entity: 'Ticket', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ ticket });
  } catch (error) {
    logger.error('Ticket PATCH error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: TICKETS_MANAGE
    const permErr = requirePermission(user, TICKETS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    const existing = await db.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Verify ownership (tenant isolation)
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.ticket.delete({ where: { id } });
        await logAudit({ user, action: 'delete', entity: 'Ticket', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Ticket DELETE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
