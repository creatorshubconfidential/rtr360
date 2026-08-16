import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, SUBSCRIPTIONS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['active', 'paused', 'cancelled', 'expired'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const subscription = await db.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        organization: { select: { id: true, name: true, email: true, phone: true } },
        invoices: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Tenant check
    if (user.role !== 'super_admin' && subscription.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ subscription });
  } catch (error) {
    logger.error('Subscription GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: SUBSCRIPTIONS_MANAGE
    const permErr = requirePermission(user, SUBSCRIPTIONS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const { status, vehicleCount, endsAt } = body;

    const subscription = await db.subscription.findUnique({ where: { id } });

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Verify ownership
    if (user.role !== 'super_admin' && subscription.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (vehicleCount !== undefined) {
      const count = Number(vehicleCount);
      if (count < 0 || !Number.isInteger(count)) {
        return NextResponse.json({ error: 'vehicleCount must be a non-negative integer' }, { status: 400 });
      }
      updateData.vehicleCount = count;
    }

    if (endsAt !== undefined) {
      updateData.endsAt = endsAt ? new Date(endsAt) : null;
    }

    const updated = await db.subscription.update({
      where: { id },
      data: updateData,
      include: {
        plan: true,
        organization: { select: { id: true, name: true } },
      },
    });
        await logAudit({ user, action: 'update', entity: 'Subscription', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ subscription: updated });
  } catch (error) {
    logger.error('Subscription PATCH error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
