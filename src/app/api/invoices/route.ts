import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const VALID_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'];

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    // Tenant isolation
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (search) {
      where.invoiceNumber = { contains: search };
    }

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          subscription: {
            include: {
              plan: { select: { id: true, name: true } },
            },
          },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invoice.count({ where }),
    ]);

    return NextResponse.json({
      invoices,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Invoices GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const body = await request.json();
    const { organizationId, subscriptionId, amount, tax, dueDate, notes } = body;

    if (amount === undefined || amount === null) {
      return NextResponse.json({ error: 'amount is required' }, { status: 400 });
    }

    if (!dueDate) {
      return NextResponse.json({ error: 'dueDate is required' }, { status: 400 });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return NextResponse.json({ error: 'amount must be a valid non-negative number' }, { status: 400 });
    }

    const numTax = Number(tax) || 0;
    const total = Math.round((numAmount + numTax) * 100) / 100;

    // Determine organization
    const orgId = organizationId || user.organizationId;
    if (!orgId) {
      return NextResponse.json({ error: 'Organization context required' }, { status: 400 });
    }

    // If subscriptionId is provided, verify it belongs to the org
    if (subscriptionId) {
      const sub = await db.subscription.findUnique({
        where: { id: subscriptionId },
      });
      if (!sub || sub.organizationId !== orgId) {
        return NextResponse.json({ error: 'Subscription not found or does not belong to the organization' }, { status: 400 });
      }
    }

    // Auto-generate invoiceNumber
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const count = await db.invoice.count({
      where: { createdAt: { gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()) } },
    });
    const invoiceNumber = `INV-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;

    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        organizationId: orgId,
        subscriptionId: subscriptionId || null,
        amount: numAmount,
        tax: numTax,
        total,
        status: 'pending',
        dueDate: new Date(dueDate),
        notes: notes?.trim() || null,
      },
      include: {
        subscription: {
          include: {
            plan: { select: { id: true, name: true } },
          },
        },
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error('Invoices POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
