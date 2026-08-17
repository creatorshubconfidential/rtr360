import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, DRIVERS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['active', 'inactive', 'on_leave', 'terminated'];
const LICENSE_TYPES = ['Light Vehicle', 'Heavy Vehicle', 'Motorcycle', 'Heavy Bus', 'Light Bus', 'Trailer', 'Forklift'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const emirate = searchParams.get('emirate');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    // Tenant isolation
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (emirate) {
      where.emirate = emirate;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { employeeId: { contains: search } },
        { licenseNumber: { contains: search } },
      ];
    }

    const [drivers, total] = await Promise.all([
      db.driver.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organization: { select: { id: true, name: true } },
          vehicles: { select: { id: true, plateNumber: true, vehicleType: true } },
        },
      }),
      db.driver.count({ where }),
    ]);

    return NextResponse.json({
      drivers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Drivers GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: DRIVERS_MANAGE
    const permErr = requirePermission(user, DRIVERS_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'You must belong to an organization' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name, phone, email, employeeId, licenseNumber, licenseType,
      licenseExpiry, emirate, nationality, passportNumber,
      dateOfBirth, emergencyContact, emergencyPhone, notes
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Driver name is required' }, { status: 400 });
    }

    if (licenseType && !LICENSE_TYPES.includes(licenseType)) {
      return NextResponse.json({ error: `Invalid license type. Valid: ${LICENSE_TYPES.join(', ')}` }, { status: 400 });
    }

    const driverData: Record<string, unknown> = {
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      employeeId: employeeId?.trim() || null,
      licenseNumber: licenseNumber?.trim() || null,
      licenseType: licenseType || null,
      licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null,
      emirate: emirate || null,
      nationality: nationality?.trim() || null,
      passportNumber: passportNumber?.trim() || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      emergencyContact: emergencyContact?.trim() || null,
      emergencyPhone: emergencyPhone?.trim() || null,
      notes: notes?.trim() || null,
      status: 'active',
    };

    if (user.organizationId) {
      driverData.organizationId = user.organizationId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const driver = await db.driver.create({ data: driverData as any });
        await logAudit({ user, action: 'create', entity: 'Driver', entityId: driver?.id, ipAddress: getClientIp(request) });
    return NextResponse.json({ driver }, { status: 201 });
  } catch (error) {
    logger.error('Drivers POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
