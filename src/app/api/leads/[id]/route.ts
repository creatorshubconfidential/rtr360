import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, LEADS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
  'closed',
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        quotations: {
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        organization: { select: { id: true, name: true } },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Tenant check
    if (user.role !== 'super_admin' && lead.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    logger.error('Lead GET error', { error });
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

    // RBAC: LEADS_MANAGE
    const permErr = requirePermission(user, LEADS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    const body = await request.json();
    const { status, priority, notes, assignedToId } = body;

    const lead = await db.lead.findUnique({ where: { id } });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && lead.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'You do not have permission to update this lead' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) updateData.status = status;
    if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) updateData.priority = priority;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId || null;

    const updated = await db.lead.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });
        await logAudit({ user, action: 'update', entity: 'Lead', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ lead: updated });
  } catch (error) {
    logger.error('Lead PATCH error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
