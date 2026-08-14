import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const VALID_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

function generateQuotationNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const r = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `RTR-Q-${y}${m}-${r}`;
}

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
      where.quotationNumber = { contains: search };
    }

    const [quotations, total] = await Promise.all([
      db.quotation.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, company: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.quotation.count({ where }),
    ]);

    return NextResponse.json({
      quotations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Quotations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const body = await request.json();
    const { leadId, items, taxRate, notes, terms, validUntil } = body;

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    // Calculate totals
    const subtotal = items.reduce((sum: number, item: Record<string, unknown>) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);

    const rate = Number(taxRate) || 5; // UAE VAT default 5%
    const tax = Math.round(subtotal * rate / 100 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    // Get org from lead if provided, otherwise from user
    let orgId = user.organizationId;
    if (leadId) {
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (lead?.organizationId) orgId = lead.organizationId;
    }

    if (!orgId) {
      return NextResponse.json({ error: 'Organization context required' }, { status: 400 });
    }

    // Generate unique quotation number
    let quotationNumber = generateQuotationNumber();
    let attempts = 0;
    while (await db.quotation.findUnique({ where: { quotationNumber } })) {
      quotationNumber = generateQuotationNumber();
      attempts++;
      if (attempts > 10) {
        quotationNumber = `RTR-Q-${Date.now()}`;
        break;
      }
    }

    const quotation = await db.quotation.create({
      data: {
        quotationNumber,
        leadId: leadId || null,
        organizationId: orgId,
        items: JSON.stringify(items),
        subtotal,
        taxRate: rate,
        tax,
        total,
        status: 'draft',
        validUntil: validUntil ? new Date(validUntil) : null,
        notes: notes?.trim() || null,
        terms: terms?.trim() || null,
      },
      include: {
        lead: { select: { id: true, name: true, company: true } },
      },
    });

    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    console.error('Quotations POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
