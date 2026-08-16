import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const VALID_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const quotation = await db.quotation.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, company: true, email: true, phone: true, emirate: true } },
        organization: { select: { id: true, name: true, email: true, phone: true, address: true, emirate: true } },
      },
    });

    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    }

    // Tenant check
    if (user.role !== 'super_admin' && quotation.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ quotation });
  } catch (error) {
    console.error('Quotation GET error:', error);
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

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    const quotation = await db.quotation.findUnique({ where: { id } });

    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && quotation.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) {
      updateData.status = status;
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }

    const updated = await db.quotation.update({
      where: { id },
      data: updateData,
      include: {
        lead: { select: { id: true, name: true, company: true } },
      },
    });

    return NextResponse.json({ quotation: updated });
  } catch (error) {
    console.error('Quotation PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
