import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, MAINTENANCE_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['upcoming', 'scheduled', 'in_progress', 'completed', 'cancelled'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: MAINTENANCE_MANAGE
    const permErr = requirePermission(user, MAINTENANCE_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const {
      status,
      description,
      cost,
      completedDate,
      scheduledDate,
      triggerType,
      triggerValue,
      type,
    } = body;

    const existing = await db.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 });
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
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (cost !== undefined) updateData.cost = cost ?? null;
    if (completedDate !== undefined) updateData.completedDate = completedDate ? new Date(completedDate) : null;
    if (scheduledDate !== undefined) updateData.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
    if (triggerType !== undefined) updateData.triggerType = triggerType?.trim() || null;
    if (triggerValue !== undefined) updateData.triggerValue = triggerValue ?? null;
    if (type !== undefined) updateData.type = type?.trim() || null;

    const maintenanceRecord = await db.maintenanceRecord.update({
      where: { id },
      data: updateData,
      include: {
        vehicle: {
          select: { id: true, plateNumber: true, make: true, model: true },
        },
        organization: { select: { id: true, name: true } },
      },
    });
        await logAudit({ user, action: 'update', entity: 'MaintenanceRecord', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ maintenanceRecord });
  } catch (error) {
    logger.error('Maintenance PATCH error', { error });
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

    // RBAC: MAINTENANCE_MANAGE
    const permErr = requirePermission(user, MAINTENANCE_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    const existing = await db.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 });
    }

    // Verify ownership (tenant isolation)
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.maintenanceRecord.delete({ where: { id } });
        await logAudit({ user, action: 'delete', entity: 'MaintenanceRecord', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Maintenance DELETE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
