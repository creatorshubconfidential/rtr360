import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { requirePermission, SETTINGS_MANAGE } from '@/lib/permissions';

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: Only super_admin and platform_admin can view audit logs
    const permErr = requirePermission(user, SETTINGS_MANAGE);
    if (permErr) return permErr;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const action = searchParams.get('action');
    const entity = searchParams.get('entity');
    const userId = searchParams.get('userId');

    const where: Record<string, unknown> = {};

    // Tenant isolation: platform_admin sees only their org's logs
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (userId) {
      where.userId = userId;
    }

    const [auditLogs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      auditLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Audit logs GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
