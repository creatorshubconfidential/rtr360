import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
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
        items: { orderBy: { sortOrder: 'asc' } },
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
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const { status, notes, items } = body;

    const quotation = await db.quotation.findUnique({
      where: { id },
      include: { items: true },
    });

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

    // If items are provided, replace all items and recalculate totals
    if (Array.isArray(items)) {
      if (items.length === 0) {
        return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
      }

      for (const item of items) {
        if (!item.description || typeof item.description !== 'string') {
          return NextResponse.json({ error: 'Each item must have a description' }, { status: 400 });
        }
        if (typeof item.quantity !== 'number' || item.quantity < 1) {
          return NextResponse.json({ error: 'Each item quantity must be at least 1' }, { status: 400 });
        }
        if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
          return NextResponse.json({ error: 'Each item unitPrice must be non-negative' }, { status: 400 });
        }
      }

      const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
        return sum + (item.quantity * item.unitPrice);
      }, 0);
      const taxRate = quotation.taxRate || 5;
      const tax = Math.round(subtotal * taxRate / 100 * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      updateData.subtotal = subtotal;
      updateData.tax = tax;
      updateData.total = total;
      updateData.items = {
        deleteMany: { quotationId: id },
        create: items.map((item: { description: string; quantity: number; unitPrice: number }, idx: number) => ({
          sortOrder: idx,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      };
    }

    const updated = await db.quotation.update({
      where: { id },
      data: updateData,
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        lead: { select: { id: true, name: true, company: true } },
      },
    });

    return NextResponse.json({ quotation: updated });
  } catch (error) {
    console.error('Quotation PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
