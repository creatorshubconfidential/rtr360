import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
import { isTenantAccessible } from '@/lib/tenant';
import { generateApiKey } from '@/lib/api-keys';

/**
 * P0-⑥ — Rotate an API key: issues a new raw key, replaces the stored
 * hash + prefix, clears expiry extension request handling. The old raw
 * key stops working immediately (its hash is overwritten). Org-scoped 404.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkRateLimit(request, 'api');
  if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const record = await db.apiKey.findFirst({
      where: { id },
      select: { id: true, organizationId: true, name: true, active: true },
    });

    if (!record || !isTenantAccessible(user, record.organizationId)) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }
    if (!record.active) {
      return NextResponse.json({ error: 'Cannot rotate a revoked key' }, { status: 400 });
    }

    const { raw, prefix, hash } = generateApiKey();

    await db.apiKey.update({
      where: { id: record.id },
      data: { key: hash, keyPrefix: prefix },
    });

    await logAudit({
      user, action: 'update', entity: 'ApiKey', entityId: record.id,
      metadata: { name: record.name, keyPrefix: prefix, outcome: 'rotated' },
      ipAddress: getClientIp(request),
    });

    // ONE-TIME raw display
    return NextResponse.json({
      rotated: record.id,
      keyPrefix: prefix,
      key: raw,
      warning: 'Store this key now — it will not be shown again.',
    });
  } catch (error) {
    logger.error('ApiKey ROTATE error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
