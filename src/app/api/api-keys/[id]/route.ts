import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
import { isTenantAccessible } from '@/lib/tenant';

/**
 * P0-⑥ — Revoke an API key (soft delete: active=false, row retained
 * for audit). Org-scoped: cross-org key ids are indistinguishable from
 * unknown ids (404) — no existence oracle across tenants.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const record = await db.apiKey.findFirst({
      where: { id },
      select: { id: true, organizationId: true, keyPrefix: true, name: true },
    });

    if (!record || !isTenantAccessible(user, record.organizationId)) {
      // 404 for both "unknown" and "not yours" — no cross-tenant oracle
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await db.apiKey.update({
      where: { id: record.id },
      data: { active: false },
    });

    await logAudit({
      user, action: 'delete', entity: 'ApiKey', entityId: record.id,
      metadata: { name: record.name, keyPrefix: record.keyPrefix, outcome: 'revoked' },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, revoked: record.id });
  } catch (error) {
    logger.error('ApiKey DELETE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
