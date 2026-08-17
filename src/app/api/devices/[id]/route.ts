import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, DEVICES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['warehouse', 'reserved', 'installed', 'defective', 'returned', 'decommissioned'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: DEVICES_MANAGE
    const permErr = requirePermission(user, DEVICES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const { status, model, manufacturer, deviceType, protocol, simId, warehouse, notes, firmware } = body;

    const existing = await db.device.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) updateData.status = status;
    if (model !== undefined) updateData.model = model?.trim() || null;
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer?.trim() || null;
    if (deviceType) updateData.deviceType = deviceType;
    if (protocol !== undefined) updateData.protocol = protocol?.trim() || null;
    if (simId !== undefined) updateData.simId = simId || null;
    if (warehouse !== undefined) updateData.warehouse = warehouse?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (firmware !== undefined) updateData.firmware = firmware?.trim() || null;

    const device = await db.device.update({
      where: { id },
      data: updateData,
      include: { sim: true },
    });
        await logAudit({ user, action: 'update', entity: 'Device', entityId: id, ipAddress: getClientIp(request) });
    return NextResponse.json({ device });
  } catch (error) {
    logger.error('Device PATCH error', { error });
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

    // RBAC: DEVICES_MANAGE
    const permErr = requirePermission(user, DEVICES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.device.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (existing.status === 'installed') {
      return NextResponse.json({ error: 'Cannot delete an installed device. Uninstall it first.' }, { status: 400 });
    }

    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.vehicle.updateMany({ where: { deviceId: id }, data: { deviceId: null } });
    await db.device.delete({ where: { id } });
        await logAudit({ user, action: 'delete', entity: 'Device', entityId: id, ipAddress: getClientIp(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Device DELETE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
