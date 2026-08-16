import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, ACTIVITIES_MANAGE } from '@/lib/permissions';
import { getTenantFilter } from '@/lib/tenant';
import { logger } from '@/lib/logger';

const VALID_TYPES = ['call', 'email', 'meeting', 'note', 'task', 'whatsapp', 'visit'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId');
    const opportunityId = searchParams.get('opportunityId');
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const where: Record<string, unknown> = getTenantFilter(user);

    if (leadId) where.leadId = leadId;
    if (opportunityId) where.opportunityId = opportunityId;

    // Verify lead/opportunity belongs to user's org
    if (leadId) {
      const lead = await db.lead.findUnique({ where: { id: leadId }, select: { organizationId: true } });
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      if (user.role !== 'super_admin' && lead.organizationId !== user.organizationId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const activities = await db.activity.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    logger.error('Activities GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: ACTIVITIES_MANAGE
    const permErr = requirePermission(user, ACTIVITIES_MANAGE);
    if (permErr) return permErr;

    const body = await request.json();
    const { type, title, description, leadId, opportunityId, dueDate, completed } = body;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Verify lead belongs to user's org if provided
    if (leadId) {
      const lead = await db.lead.findUnique({ where: { id: leadId }, select: { organizationId: true } });
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      if (user.role !== 'super_admin' && lead.organizationId !== user.organizationId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const activity = await db.activity.create({
      data: {
        type,
        title: title.trim(),
        description: description?.trim() || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completed: completed === true,
        userId: user.id,
        leadId: leadId || null,
        opportunityId: opportunityId || null,
        organizationId: user.organizationId || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    logger.error('Activities POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
