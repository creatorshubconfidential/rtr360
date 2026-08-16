import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, DRIVERS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['active', 'inactive', 'on_leave', 'terminated'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: DRIVERS_MANAGE
    const permErr = requirePermission(user, DRIVERS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const { status, name, phone, email, employeeId, licenseNumber, licenseType, licenseExpiry, emirate, nationality, notes } = body;

    const existing = await db.driver.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Tenant check
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) updateData.status = status;
    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (employeeId !== undefined) updateData.employeeId = employeeId?.trim() || null;
    if (licenseNumber !== undefined) updateData.licenseNumber = licenseNumber?.trim() || null;
    if (licenseType) updateData.licenseType = licenseType;
    if (licenseExpiry) updateData.licenseExpiry = new Date(licenseExpiry);
    if (emirate !== undefined) updateData.emirate = emirate || null;
    if (nationality !== undefined) updateData.nationality = nationality?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;

    const driver = await db.driver.update({ where: { id }, data: updateData });
        await logAudit({ user, action: 'update', entity: 'Driver', entityId: id, ipAddress: getClientIp(request) });
    return NextResponse.json({ driver });
  } catch (error) {
    logger.error('Driver PATCH error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: DRIVERS_MANAGE
    const permErr = requirePermission(user, DRIVERS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.driver.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Unassign from vehicles first
    await db.vehicle.updateMany({ where: { driverId: id }, data: { driverId: null } });
    await db.driver.delete({ where: { id } });
        await logAudit({ user, action: 'delete', entity: 'Driver', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Driver DELETE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
