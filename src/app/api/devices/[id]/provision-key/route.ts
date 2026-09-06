import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, DEVICES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
import { isTenantAccessible } from '@/lib/tenant';

/**
 * P1 — Device key provisioning for telemetry ingestion.
 * POST /api/devices/[id]/provision-key
 * → generates a one-time raw device key; only the SHA-256 hash is stored.
 * Org-scoped (cross-tenant → 404, no oracle).
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

    const permErr = requirePermission(user, DEVICES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;

    const device = await db.device.findFirst({
      where: { id },
      select: { id: true, imei: true, organizationId: true, status: true },
    });

    if (!device || !isTenantAccessible(user, device.organizationId)) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const raw = 'dtk_' + randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(raw, 'utf8').digest('hex');

    await db.device.update({
      where: { id: device.id },
      data: { deviceKeyHash: hash },
    });

    await logAudit({
      user, action: 'update', entity: 'Device', entityId: device.id,
      metadata: { imei: device.imei, outcome: 'device_key_provisioned' },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      deviceId: device.id,
      imei: device.imei,
      deviceKey: raw, // ONE-TIME display — never retrievable again
      warning: 'Store this device key now — it will not be shown again.',
    });
  } catch (error) {
    logger.error('Device provision-key error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
