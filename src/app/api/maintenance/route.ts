import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, MAINTENANCE_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
const VALID_STATUSES = ['upcoming', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const VALID_TYPES = [
  'oil_change', 'tire_rotation', 'brake_service', 'engine_service',
  'battery_replacement', 'ac_service', 'general_service', 'inspection', 'repair',
];
const VALID_TRIGGER_TYPES = ['mileage', 'date', 'manual', 'alert'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    // Tenant isolation: super_admin sees all, org users see only their own
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (type && VALID_TYPES.includes(type)) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { description: { contains: search } },
        { vehicle: { plateNumber: { contains: search } } },
      ];
    }

    const [maintenanceRecords, total] = await Promise.all([
      db.maintenanceRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          vehicle: {
            select: { id: true, plateNumber: true, make: true, model: true },
          },
          organization: { select: { id: true, name: true } },
        },
      }),
      db.maintenanceRecord.count({ where }),
    ]);

    return NextResponse.json({
      maintenanceRecords,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Maintenance GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: MAINTENANCE_MANAGE
    const permErr = requirePermission(user, MAINTENANCE_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'You must belong to an organization' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      vehicleId,
      type,
      description,
      triggerType,
      triggerValue,
      scheduledDate,
      completedDate,
      cost,
      status,
    } = body;

    // Require vehicleId
    if (!vehicleId || typeof vehicleId !== 'string') {
      return NextResponse.json(
        { error: 'vehicleId is required' },
        { status: 400 }
      );
    }

    // Require type and validate
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Valid type is required. Valid: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate triggerType if provided
    if (triggerType && !VALID_TRIGGER_TYPES.includes(triggerType)) {
      return NextResponse.json(
        { error: `Invalid triggerType. Valid: ${VALID_TRIGGER_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (vehicleId) {
      const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 400 });
      if (user.role !== 'super_admin' && vehicle.organizationId !== user.organizationId) {
        return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
      }
    }

    const maintenanceRecord = await db.maintenanceRecord.create({
      data: {
        vehicleId,
        type,
        description: description?.trim() || null,
        triggerType: triggerType || null,
        triggerValue: triggerValue ?? null,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        completedDate: completedDate ? new Date(completedDate) : null,
        cost: cost ?? null,
        status: status || 'upcoming',
        organizationId: user.organizationId!,
      },
      include: {
        vehicle: {
          select: { id: true, plateNumber: true, make: true, model: true },
        },
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ maintenanceRecord }, { status: 201 });
  } catch (error) {
    logger.error('Maintenance POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
