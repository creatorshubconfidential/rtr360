import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, TRIPS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';

const VALID_STATUSES = ['in_progress', 'completed', 'cancelled'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const vehicleId = searchParams.get('vehicleId');

    const where: Record<string, unknown> = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    // Tenant: filter by org via vehicle
    if (user.role !== 'super_admin' && user.organizationId) {
      where.vehicle = { organizationId: user.organizationId };
    }

    const [trips, total] = await Promise.all([
      db.trip.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          vehicle: {
            select: { id: true, plateNumber: true, make: true, model: true, organizationId: true },
          },
        },
      }),
      db.trip.count({ where }),
    ]);

    return NextResponse.json({
      trips,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Trips GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: Only dispatcher+ and operations roles can create trips
    const permErr = requirePermission(user, TRIPS_MANAGE);
    if (permErr) return permErr;

    const body = await request.json();
    const { vehicleId, driverName, startTime, endTime, distance, duration, maxSpeed, avgSpeed, idleTime, overspeedCount, harshBrakes, harshAccel, status } = body;

    if (!vehicleId || !startTime) {
      return NextResponse.json({ error: 'vehicleId and startTime are required' }, { status: 400 });
    }

    // Verify vehicle belongs to user's org
    if (user.role !== 'super_admin' && user.organizationId) {
      const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle || vehicle.organizationId !== user.organizationId) {
        return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
      }
    }

    const trip = await db.trip.create({
      data: {
        vehicleId,
        organizationId: user.organizationId || null,
        driverName: driverName || null,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        distance: distance ?? null,
        duration: duration ?? null,
        maxSpeed: maxSpeed ?? null,
        avgSpeed: avgSpeed ?? null,
        idleTime: idleTime ?? null,
        overspeedCount: overspeedCount ?? null,
        harshBrakes: harshBrakes ?? null,
        harshAccel: harshAccel ?? null,
        status: status || 'in_progress',
      },
      include: { vehicle: { select: { id: true, plateNumber: true, make: true, model: true } } },
    });
        await logAudit({ user, action: 'create', entity: 'Trip', entityId: trip?.id, ipAddress: getClientIp(request) });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    logger.error('Trips POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
