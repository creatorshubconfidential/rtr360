import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, CONTRACTS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
const VALID_STATUSES = ['active', 'expired', 'terminated', 'draft'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (search) where.title = { contains: search };

    const [contracts, total] = await Promise.all([
      db.contract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { organization: { select: { id: true, name: true } } },
      }),
      db.contract.count({ where }),
    ]);

    return NextResponse.json({
      contracts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Contracts GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: CONTRACTS_MANAGE
    const permErr = requirePermission(user, CONTRACTS_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Organization required' }, { status: 403 });
    }

    const body = await request.json();
    const { title, startDate, endDate, status, terms } = body;

    if (!title || !startDate) {
      return NextResponse.json({ error: 'Title and start date are required' }, { status: 400 });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    const contract = await db.contract.create({
      data: {
        title: title.trim(),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'active',
        terms: terms || null,
        organizationId: user.organizationId!,
      },
      include: { organization: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    logger.error('Contracts POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
