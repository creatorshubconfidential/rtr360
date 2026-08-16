import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, INVOICES_MANAGE } from '@/lib/permissions';
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
    if (user.role !== 'super_admin' && invoice.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('Invoice GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    if (user.role !== 'super_admin' && invoice.organizationId !== user.organizationId) {
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

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    console.error('Invoice PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
