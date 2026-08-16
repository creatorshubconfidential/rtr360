import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, DEVICES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['warehouse', 'reserved', 'installed', 'defective', 'returned', 'decommissioned'];
const DEVICE_TYPES = ['GPS Tracker', 'OBD Tracker', 'Wired Tracker', 'Personal Tracker', 'Asset Tracker', 'Camera', 'Temperature Sensor'];
const PROVIDERS = ['Etisalat', 'du', 'Virgin Mobile', 'Swyp'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const deviceType = searchParams.get('deviceType');
    const warehouse = searchParams.get('warehouse');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    // Tenant: super_admin sees all, org users see their own + unassigned (warehouse)
    if (user.role !== 'super_admin') {
      if (user.organizationId) {
        where.OR = [
          { organizationId: user.organizationId },
          { organizationId: null, status: 'warehouse' },
        ];
      }
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (deviceType) {
      where.deviceType = deviceType;
    }

    if (warehouse) {
      where.warehouse = warehouse;
    }

    if (search) {
      where.OR = [
        { imei: { contains: search } },
        { serialNumber: { contains: search } },
        { model: { contains: search } },
        { phoneNumber: { contains: search } },
      ];
    }

    const [devices, total] = await Promise.all([
      db.device.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sim: { select: { id: true, number: true, provider: true, status: true } },
          vehicles: { select: { id: true, plateNumber: true } },
          organization: { select: { id: true, name: true } },
        },
      }),
      db.device.count({ where }),
    ]);

    // Aggregate counts (scoped to same tenant filter)
    const statusCounts = await db.device.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const counts: Record<string, number> = {};
    statusCounts.forEach((s) => { counts[s.status] = s._count.status; });

    return NextResponse.json({
      devices,
      counts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Devices GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: DEVICES_MANAGE
    const permErr = requirePermission(user, DEVICES_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'You must belong to an organization' }, { status: 403 });
    }

    const body = await request.json();
    const {
      imei, serialNumber, model, manufacturer, deviceType, protocol,
      simId, warehouse, purchaseDate, purchaseCost, warrantyExpiry, notes
    } = body;

    if (!imei || typeof imei !== 'string' || imei.trim().length < 10) {
      return NextResponse.json({ error: 'Valid IMEI is required (min 10 characters)' }, { status: 400 });
    }

    // Check IMEI uniqueness
    const existing = await db.device.findUnique({ where: { imei: imei.trim() } });
    if (existing) {
      return NextResponse.json({ error: 'A device with this IMEI already exists' }, { status: 409 });
    }

    if (deviceType && !DEVICE_TYPES.includes(deviceType)) {
      return NextResponse.json({ error: `Invalid device type. Valid: ${DEVICE_TYPES.join(', ')}` }, { status: 400 });
    }

    const deviceData: Record<string, unknown> = {
      imei: imei.trim(),
      serialNumber: serialNumber?.trim() || null,
      model: model?.trim() || null,
      manufacturer: manufacturer?.trim() || null,
      deviceType: deviceType || null,
      protocol: protocol?.trim() || null,
      simId: simId || null,
      warehouse: warehouse?.trim() || 'RTR Dubai Warehouse',
      status: 'warehouse',
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      purchaseCost: purchaseCost ?? null,
      warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      notes: notes?.trim() || null,
      organizationId: user.organizationId || null,
    };

    const device = await db.device.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: deviceData as any,
      include: { sim: true },
    });
        await logAudit({ user, action: 'create', entity: 'Device', entityId: device?.id, ipAddress: getClientIp(request) });

    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    logger.error('Devices POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
