import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, VEHICLES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';

const VALID_STATUSES = ['active', 'inactive', 'maintenance', 'decommissioned'];

// Helper to check tenant access to a vehicle
async function getVehicleWithAccess(vehicleId: string, user: { id: string; role: string; organizationId: string | null }) {
  const where: Record<string, unknown> = { id: vehicleId };
  if (user.role !== 'super_admin' && user.organizationId) {
    where.organizationId = user.organizationId;
  }

  const vehicle = await db.vehicle.findFirst({
    where,
    include: {
      driver: { select: { id: true, name: true, phone: true } },
      device: { select: { id: true, imei: true, status: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  if (!vehicle) return null;

  // Cross-org check: even super_admin should verify vehicle exists
  return vehicle;
}

/**
 * GET /api/vehicles/[id]
 * Fetch a single vehicle by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const vehicle = await getVehicleWithAccess(id, user);
    if (!vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    return NextResponse.json({ vehicle });
  } catch (err) {
    logger.error('Vehicle GET by ID error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/vehicles/[id]
 * Update a vehicle
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkRateLimit(request, 'api');
  if (rl) return rl;

  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC check
    const permErr = requirePermission(user, VEHICLES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    // Verify vehicle exists and belongs to user's org
    const existing = await getVehicleWithAccess(id, user);
    if (!existing) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const body = await request.json();
    const { plateNumber, make, model, year, vehicleType, vin, color, branchId, driverId, status, notes, mileage, installDate } = body;

    // Validation
    if (plateNumber !== undefined) {
      if (typeof plateNumber !== 'string' || plateNumber.trim().length === 0) {
        return NextResponse.json({ error: 'Plate number cannot be empty' }, { status: 400 });
      }
    }

    if (year !== undefined && (year < 1990 || year > new Date().getFullYear() + 1)) {
      return NextResponse.json({ error: 'Invalid vehicle year' }, { status: 400 });
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (plateNumber !== undefined) updateData.plateNumber = plateNumber.trim();
    if (make !== undefined) updateData.make = make?.trim() || null;
    if (model !== undefined) updateData.model = model?.trim() || null;
    if (year !== undefined) updateData.year = year ?? null;
    if (vehicleType !== undefined) updateData.vehicleType = vehicleType?.trim() || null;
    if (vin !== undefined) updateData.vin = vin?.trim() || null;
    if (color !== undefined) updateData.color = color?.trim() || null;
    if (branchId !== undefined) updateData.branchId = branchId || null;
    if (driverId !== undefined) updateData.driverId = driverId || null;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (mileage !== undefined) updateData.mileage = mileage;
    if (installDate !== undefined) updateData.installDate = installDate ? new Date(installDate) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehicle = await db.vehicle.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: updateData as any,
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        device: { select: { id: true, imei: true, status: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    await logAudit({ user, action: 'update', entity: 'Vehicle', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ vehicle });
  } catch (err) {
    logger.error('Vehicle PUT error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/vehicles/[id]
 * Delete a vehicle (soft delete via status change, or hard delete)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkRateLimit(request, 'api');
  if (rl) return rl;

  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC check
    const permErr = requirePermission(user, VEHICLES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    // Verify vehicle exists and belongs to user's org
    const existing = await getVehicleWithAccess(id, user);
    if (!existing) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    // Disconnect driver and device before deleting
    await db.vehicle.update({
      where: { id },
      data: { driverId: null, deviceId: null },
    });

    await db.vehicle.delete({ where: { id } });

    await logAudit({ user, action: 'delete', entity: 'Vehicle', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ success: true, message: 'Vehicle deleted' });
  } catch (err) {
    logger.error('Vehicle DELETE error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
