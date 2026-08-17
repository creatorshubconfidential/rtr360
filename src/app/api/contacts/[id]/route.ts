import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, CONTACTS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;
    const contact = await db.contact.findUnique({ where: { id } });

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Tenant check
    if (user.role !== 'super_admin' && user.organizationId && contact.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    logger.error('Contact GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(request, 'api');
  if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const permErr = requirePermission(user, CONTACTS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const { name, email, phone, position } = body;

    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Tenant check
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (position !== undefined) updateData.position = position?.trim() || null;

    const contact = await db.contact.update({ where: { id }, data: updateData });
    await logAudit({ user, action: 'update', entity: 'Contact', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ contact });
  } catch (error) {
    logger.error('Contact PUT error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(request, 'api');
  if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const permErr = requirePermission(user, CONTACTS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Tenant check
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.contact.delete({ where: { id } });
    await logAudit({ user, action: 'delete', entity: 'Contact', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Contact DELETE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
