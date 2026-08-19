import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, TICKETS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['open', 'in_progress', 'pending', 'resolved', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    // Tenant isolation: super_admin sees all, org users see only their own
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (priority && VALID_PRIORITIES.includes(priority)) {
      where.priority = priority;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { description: { contains: search } },
        { ticketNumber: { contains: search } },
        { vehiclePlate: { contains: search } },
      ];
    }

    const [tickets, total] = await Promise.all([
      db.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organization: { select: { id: true, name: true } },
        },
      }),
      db.ticket.count({ where }),
    ]);

    return NextResponse.json({
      tickets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Tickets GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: TICKETS_MANAGE
    const permErr = requirePermission(user, TICKETS_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'You must belong to an organization to create tickets' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { subject, description, priority, status, vehiclePlate, assignedToId } = body;

    // Require subject
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json(
        { error: 'Subject is required' },
        { status: 400 }
      );
    }

    // Validate priority if provided
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { error: `Invalid priority. Valid: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Auto-generate ticketNumber: TKT-YYYYMMDD-XXX
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const count = await db.ticket.count({
      where: { createdAt: { gte: startOfDay } },
    });
    const ticketNumber = `TKT-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;

    // Validate assignedToId belongs to user's org (cross-tenant FK protection)
    if (assignedToId) {
      const assignee = await db.user.findFirst({
        where: user.role !== 'super_admin' && user.organizationId
          ? { id: assignedToId, organizationId: user.organizationId }
          : { id: assignedToId },
        select: { id: true },
      });
      if (!assignee) return NextResponse.json({ error: 'Assigned user not found' }, { status: 400 });
    }

    // Determine resolvedAt based on status
    let resolvedAt: Date | null = null;
    if (status === 'resolved' || status === 'closed') {
      resolvedAt = new Date();
    }

    const ticket = await db.ticket.create({
      data: {
        ticketNumber,
        organizationId: user.organizationId!,
        subject: subject.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        status: status || 'open',
        vehiclePlate: vehiclePlate?.trim() || null,
        assignedToId: assignedToId || null,
        resolvedAt,
      },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });
        await logAudit({ user, action: 'create', entity: 'Ticket', entityId: ticket?.id, ipAddress: getClientIp(request) });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    logger.error('Tickets POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
