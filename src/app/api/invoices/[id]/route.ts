import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, INVOICES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
import { isTenantAccessible } from '@/lib/tenant';
const VALID_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        subscription: {
          include: {
            plan: { select: { id: true, name: true } },
          },
        },
        organization: { select: { id: true, name: true, email: true, phone: true, address: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Tenant check
    if (!isTenantAccessible(user, invoice.organizationId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    logger.error('Invoice GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = await checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: INVOICES_MANAGE
    const permErr = requirePermission(user, INVOICES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    const invoice = await db.invoice.findUnique({ where: { id } });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Verify ownership
    if (!isTenantAccessible(user, invoice.organizationId)) {
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
      // P1 billing: state machine — terminal/irreversible states protected.
      // 'paid' is immutable (payment reversal requires a credit-note flow);
      // 'cancelled' is terminal; overdue can still be paid or cancelled.
      const ALLOWED_TRANSITIONS: Record<string, string[]> = {
        pending: ['paid', 'overdue', 'cancelled'],
        overdue: ['paid', 'cancelled'],
        paid: [],
        cancelled: [],
      };
      const allowed = ALLOWED_TRANSITIONS[invoice.status] ?? [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition invoice from '${invoice.status}' to '${status}'` },
          { status: 409 }
        );
      }
      updateData.status = status;
      // Auto-set paidAt when marking as paid
      if (status === 'paid') {
        updateData.paidAt = new Date();
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }

    const updated = await db.invoice.update({
      where: { id },
      data: updateData,
      include: {
        subscription: {
          include: {
            plan: { select: { id: true, name: true } },
          },
        },
        organization: { select: { id: true, name: true } },
      },
    });
        await logAudit({ user, action: 'update', entity: 'Invoice', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    logger.error('Invoice PATCH error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
