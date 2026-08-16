import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, INSTALLATIONS_MANAGE } from '@/lib/permissions';
const VALID_STATUSES = ['scheduled', 'in_progress', 'testing', 'completed', 'failed', 'cancelled'];

// Generate installation number: INST-YYYYMM-NNN
async function generateInstallationNumber() {
  const now = new Date();
  const prefix = `INST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastInst = await db.installation.findFirst({
    where: { installationNumber: { startsWith: prefix } },
    orderBy: { installationNumber: 'desc' },
  });
  let nextNum = 1;
  if (lastInst) {
    const parts = lastInst.installationNumber.split('-');
    nextNum = parseInt(parts[2]) + 1;
  }
  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const emirate = searchParams.get('emirate');
    const technicianId = searchParams.get('technicianId');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (emirate) {
      where.emirate = emirate;
    }

    if (technicianId) {
      where.technicianId = technicianId;
    }

    if (search) {
      where.OR = [
        { installationNumber: { contains: search } },
        { location: { contains: search } },
        { notes: { contains: search } },
      ];
    }

    const [installations, total] = await Promise.all([
      db.installation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          technician: { select: { id: true, name: true, phone: true } },
        },
      }),
      db.installation.count({ where }),
    ]);

    // Enrich with vehicle and device data
    const enriched = await Promise.all(
      installations.map(async (inst) => {
        const vehicle = await db.vehicle.findUnique({
          where: { id: inst.vehicleId },
          select: { id: true, plateNumber: true, make: true, model: true, vehicleType: true },
        });
        const device = await db.device.findUnique({
          where: { id: inst.deviceId },
          select: { id: true, imei: true, model: true, deviceType: true },
        });
        return { ...inst, vehicle, device };
      })
    );

    // Status counts (must use same where clause for tenant isolation)
    const statusCounts = await db.installation.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });
    const counts: Record<string, number> = {};
    statusCounts.forEach((s) => { counts[s.status] = s._count.status; });

    return NextResponse.json({
      installations: enriched,
      counts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Installations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: INSTALLATIONS_MANAGE
    const permErr = requirePermission(user, INSTALLATIONS_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'You must belong to an organization' }, { status: 403 });
    }

    const body = await request.json();
    const {
      vehicleId, deviceId, technicianId, scheduledDate, scheduledTime,
      emirate, location, notes
    } = body;

    if (!vehicleId || !deviceId) {
      return NextResponse.json({ error: 'Vehicle and Device are required' }, { status: 400 });
    }

    // Validate vehicle exists
    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    // Validate device exists and is in warehouse/reserved
    const device = await db.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    if (device.status === 'installed') {
      return NextResponse.json({ error: 'Device is already installed on another vehicle' }, { status: 400 });
    }

    if (user.role !== 'super_admin' && vehicle.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }
    if (device.organizationId && user.role !== 'super_admin' && device.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Validate technician if provided
    if (technicianId) {
      const tech = await db.technician.findUnique({ where: { id: technicianId } });
      if (!tech) {
        return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
      }
    }

    const installationNumber = await generateInstallationNumber();

    const installation = await db.installation.create({
      data: {
        installationNumber,
        organizationId: user.organizationId!,
        vehicleId,
        deviceId,
        technicianId: technicianId || null,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        scheduledTime: scheduledTime || null,
        emirate: emirate || null,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        status: 'scheduled',
      },
      include: { technician: { select: { id: true, name: true, phone: true } } },
    });

    // Mark device as reserved
    await db.device.update({ where: { id: deviceId }, data: { status: 'reserved' } });

    return NextResponse.json({ installation }, { status: 201 });
  } catch (error) {
    console.error('Installations POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
