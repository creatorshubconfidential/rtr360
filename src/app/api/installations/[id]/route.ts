import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['testing', 'failed', 'cancelled'],
  testing: ['completed', 'failed'],
  failed: ['scheduled'],
  cancelled: ['scheduled'],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const { status, technicianId, scheduledDate, scheduledTime, location, notes, gpsSignal, powerWiring, antennaMounted, testResult } = body;

    const existing = await db.installation.findUnique({
      where: { id },
      include: { technician: { select: { id: true, name: true, phone: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      // Validate status transition
      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(status)) {
        return NextResponse.json({
          error: `Cannot transition from '${existing.status}' to '${status}'. Allowed: ${allowed?.join(', ') || 'none'}`,
        }, { status: 400 });
      }
      updateData.status = status;

      // Auto-timestamps
      if (status === 'completed') {
        updateData.completedAt = new Date();
        // Link device to vehicle
        await db.vehicle.update({
          where: { id: existing.vehicleId },
          data: { deviceId: existing.deviceId, installDate: new Date() },
        });
        // Mark device as installed
        await db.device.update({
          where: { id: existing.deviceId },
          data: { status: 'installed', installDate: new Date() },
        });
        // Increment technician's total installed
        if (existing.technicianId) {
          await db.technician.update({
            where: { id: existing.technicianId },
            data: { totalInstalled: { increment: 1 } },
          });
        }
      }

      if (status === 'cancelled' || status === 'failed') {
        // Release device back to warehouse
        await db.device.update({
          where: { id: existing.deviceId },
          data: { status: 'warehouse' },
        });
      }

      if (status === 'in_progress') {
        updateData.scheduledDate = updateData.scheduledDate || existing.scheduledDate;
      }
    }

    if (technicianId !== undefined) updateData.technicianId = technicianId || null;
    if (scheduledDate !== undefined) updateData.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime || null;
    if (location !== undefined) updateData.location = location?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (gpsSignal !== undefined) updateData.gpsSignal = gpsSignal;
    if (powerWiring !== undefined) updateData.powerWiring = powerWiring;
    if (antennaMounted !== undefined) updateData.antennaMounted = antennaMounted;
    if (testResult !== undefined) updateData.testResult = testResult?.trim() || null;

    const installation = await db.installation.update({
      where: { id },
      data: updateData,
      include: { technician: { select: { id: true, name: true, phone: true } } },
    });

    // Enrich with vehicle and device
    const vehicle = await db.vehicle.findUnique({
      where: { id: installation.vehicleId },
      select: { id: true, plateNumber: true, make: true, model: true, vehicleType: true },
    });
    const device = await db.device.findUnique({
      where: { id: installation.deviceId },
      select: { id: true, imei: true, model: true, deviceType: true },
    });

    return NextResponse.json({ installation: { ...installation, vehicle, device } });
  } catch (error) {
    console.error('Installation PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
