import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, GEOFENCES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const where: Record<string, unknown> = {};
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    const geofences = await db.geofence.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ geofences });
  } catch (error) {
    logger.error('Geofences GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: GEOFENCES_MANAGE
    const permErr = requirePermission(user, GEOFENCES_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Organization required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type, centerLat, centerLng, radius, polygonPoints } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!['circle', 'polygon'].includes(type || 'circle')) {
      return NextResponse.json({ error: 'Type must be circle or polygon' }, { status: 400 });
    }
    if (type === 'circle' && (centerLat == null || centerLng == null || !radius)) {
      return NextResponse.json({ error: 'Circle geofence requires centerLat, centerLng, and radius' }, { status: 400 });
    }

    const geofence = await db.geofence.create({
      data: {
        name: name.trim(),
        type: type || 'circle',
        centerLat: centerLat ?? null,
        centerLng: centerLng ?? null,
        radius: radius ?? null,
        polygonPoints: polygonPoints ? JSON.stringify(polygonPoints) : null,
        organizationId: user.organizationId!,
      },
      include: { organization: { select: { id: true, name: true } } },
    });
        await logAudit({ user, action: 'create', entity: 'Geofence', entityId: geofence?.id, ipAddress: getClientIp(request) });

    return NextResponse.json({ geofence }, { status: 201 });
  } catch (error) {
    logger.error('Geofences POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
