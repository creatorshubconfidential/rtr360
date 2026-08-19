import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')));

    // Tenant isolation
    const orgFilter =
      user.role !== 'super_admin' && user.organizationId
        ? { organizationId: user.organizationId }
        : {};

    const alerts = await db.alert.findMany({
      where: { ...orgFilter, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        severity: true,
        vehiclePlate: true,
        message: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ alerts });
  } catch (err) {
    logger.error('Dashboard alerts error', { err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
