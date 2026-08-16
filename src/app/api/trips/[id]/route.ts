import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

import { requirePermission, TRIPS_MANAGE } from '@/lib/permissions';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: TRIPS_MANAGE
    const permErr = requirePermission(user, TRIPS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.trip.findUnique({
      where: { id },
      include: { vehicle: { select: { organizationId: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.vehicle?.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { endTime, distance, duration, maxSpeed, avgSpeed, idleTime, overspeedCount, harshBrakes, harshAccel, status } = body;

    const updateData: Record<string, unknown> = {};
    if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : null;
    if (distance !== undefined) updateData.distance = distance;
    if (duration !== undefined) updateData.duration = duration;
    if (maxSpeed !== undefined) updateData.maxSpeed = maxSpeed;
    if (avgSpeed !== undefined) updateData.avgSpeed = avgSpeed;
    if (idleTime !== undefined) updateData.idleTime = idleTime;
    if (overspeedCount !== undefined) updateData.overspeedCount = overspeedCount;
    if (harshBrakes !== undefined) updateData.harshBrakes = harshBrakes;
    if (harshAccel !== undefined) updateData.harshAccel = harshAccel;
    if (status !== undefined) updateData.status = status;

    const trip = await db.trip.update({
      where: { id },
      data: updateData,
      include: { vehicle: { select: { id: true, plateNumber: true, make: true, model: true } } },
    });

    return NextResponse.json({ trip });
  } catch (error) {
    console.error('Trips PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: TRIPS_MANAGE
    const permErr = requirePermission(user, TRIPS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.trip.findUnique({
      where: { id },
      include: { vehicle: { select: { organizationId: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.vehicle?.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.trip.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Trips DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
