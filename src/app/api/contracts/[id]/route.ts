import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, CONTRACTS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_STATUSES = ['draft', 'active', 'expired', 'terminated'];
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await checkRateLimit(request, 'api');
  if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: CONTRACTS_MANAGE
    const permErr = requirePermission(user, CONTRACTS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.contract.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { title, startDate, endDate, status, terms } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
      }
      updateData.status = status;
    }
    if (terms !== undefined) updateData.terms = terms;

    const contract = await db.contract.update({
      where: { id },
      data: updateData,
      include: { organization: { select: { id: true, name: true } } },
    });
        await logAudit({ user, action: 'update', entity: 'Contract', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ contract });
  } catch (error) {
    logger.error('Contracts PATCH error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await checkRateLimit(request, 'api');
  if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: CONTRACTS_MANAGE
    const permErr = requirePermission(user, CONTRACTS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.contract.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.contract.delete({ where: { id } });
        await logAudit({ user, action: 'delete', entity: 'Contract', entityId: id, ipAddress: getClientIp(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Contracts DELETE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
