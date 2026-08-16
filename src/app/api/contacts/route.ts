import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, CONTACTS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    // Tenant isolation
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    } else if (user.role === 'super_admin') {
      // Super admin sees all contacts
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [contacts, total] = await Promise.all([
      db.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.contact.count({ where }),
    ]);

    return NextResponse.json({
      contacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Contacts GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: Only sales/ops roles and above can create contacts
    const permErr = requirePermission(user, CONTACTS_MANAGE);
    if (permErr) return permErr;

    const body = await request.json();
    const { name, email, phone, position, organizationId } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }

    // Determine target org: super_admin can specify, org users use their own
    const targetOrgId = user.role === 'super_admin'
      ? (organizationId || user.organizationId)
      : user.organizationId;

    if (!targetOrgId) {
      return NextResponse.json({ error: 'Organization is required' }, { status: 400 });
    }

    const contact = await db.contact.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        position: position?.trim() || null,
        organizationId: targetOrgId,
      },
    });
        await logAudit({ user, action: 'create', entity: 'Contact', entityId: contact?.id, ipAddress: getClientIp(request) });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    logger.error('Contacts POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
