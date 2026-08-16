import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, VEHICLES_MANAGE } from '@/lib/permissions';
const VALID_STATUSES = ['active', 'inactive', 'maintenance', 'decommissioned'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const vehicleType = searchParams.get('vehicleType');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    // Tenant isolation: org users only see their org's vehicles
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (vehicleType) {
      where.vehicleType = vehicleType;
    }

    if (search) {
      where.OR = [
        { plateNumber: { contains: search } },
        { make: { contains: search } },
        { model: { contains: search } },
        { internalId: { contains: search } },
      ];
    }

    const [vehicles, total] = await Promise.all([
      db.vehicle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          driver: { select: { id: true, name: true, phone: true } },
          device: { select: { id: true, imei: true, status: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      db.vehicle.count({ where }),
    ]);

    return NextResponse.json({
      vehicles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Vehicles GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: VEHICLES_MANAGE
    const permErr = requirePermission(user, VEHICLES_MANAGE);
    if (permErr) return permErr;

    // Only org users and super_admin can create vehicles
    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'You must belong to an organization to add vehicles' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { plateNumber, make, model, year, vehicleType, vin, color, branchId, notes } = body;

    // Validation
    if (!plateNumber || typeof plateNumber !== 'string' || plateNumber.trim().length === 0) {
      return NextResponse.json(
        { error: 'Plate number is required' },
        { status: 400 }
      );
    }

    if (year && (year < 1990 || year > new Date().getFullYear() + 1)) {
      return NextResponse.json(
        { error: 'Invalid vehicle year' },
        { status: 400 }
      );
    }

    const vehicleData: Record<string, unknown> = {
      plateNumber: plateNumber.trim(),
      make: make?.trim() || null,
      model: model?.trim() || null,
      year: year ?? null,
      vehicleType: vehicleType?.trim() || null,
      vin: vin?.trim() || null,
      color: color?.trim() || null,
      branchId: branchId || null,
      notes: notes?.trim() || null,
      status: 'active',
    };

    if (user.organizationId) {
      vehicleData.organizationId = user.organizationId;
    }

    const vehicle = await db.vehicle.create({ data: vehicleData as any });

    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error) {
    console.error('Vehicles POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
