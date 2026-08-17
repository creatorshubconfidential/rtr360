import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, SUBSCRIPTIONS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';

const VALID_STATUSES = ['active', 'paused', 'cancelled', 'expired'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};

    // Tenant isolation
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    const [subscriptions, total] = await Promise.all([
      db.subscription.findMany({
        where,
        include: {
          plan: true,
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.subscription.count({ where }),
    ]);

    return NextResponse.json({
      subscriptions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Subscriptions GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: Only org_owner, platform_admin, super_admin can manage subscriptions
    const permErr = requirePermission(user, SUBSCRIPTIONS_MANAGE);
    if (permErr) return permErr;

    const body = await request.json();
    const { organizationId, planId, startsAt, endsAt } = body;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    if (!startsAt) {
      return NextResponse.json({ error: 'startsAt is required' }, { status: 400 });
    }

    // Verify the plan exists
    const plan = await db.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Determine the organization — non-super_admin cannot specify a different org
    const orgId = user.role === 'super_admin' ? (organizationId || user.organizationId) : user.organizationId;

    if (!orgId) {
      return NextResponse.json({ error: 'Organization context required' }, { status: 400 });
    }

    // Check if the organization already has a subscription
    const existing = await db.subscription.findUnique({
      where: { organizationId: orgId },
    });

    if (existing) {
      return NextResponse.json({ error: 'Organization already has a subscription' }, { status: 409 });
    }

    const subscription = await db.subscription.create({
      data: {
        organizationId: orgId,
        planId,
        status: 'active',
        vehicleCount: 0,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
      },
      include: {
        plan: true,
        organization: { select: { id: true, name: true } },
      },
    });
        await logAudit({ user, action: 'create', entity: 'Subscription', entityId: subscription?.id, ipAddress: getClientIp(request) });

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    logger.error('Subscriptions POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
