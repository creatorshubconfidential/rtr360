import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, USERS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
import { getTenantFilter } from '@/lib/tenant';
import { generateApiKey, parseScope, expiryFromDays } from '@/lib/api-keys';

/**
 * P0-⑥ — API key management.
 * GET  /api/api-keys        → list keys for the caller's org (never raw keys)
 * POST /api/api-keys        → create a key (raw key returned exactly once)
 */

// GET: list keys — org-scoped, secrets never included
export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const where: Record<string, unknown> = getTenantFilter(user);

    const apiKeys = await db.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,      // display prefix — NOT usable for auth
        permissions: true,
        expiresAt: true,
        lastUsedAt: true,
        active: true,
        createdAt: true,
        organizationId: true,
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ apiKeys });
  } catch (error) {
    logger.error('ApiKeys GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: create a key — RBAC-gated, org-scoped, one-time raw display
export async function POST(request: Request) {
  const rl = await checkRateLimit(request, 'api');
  if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: creating keys requires owner/admin-level user management rights
    const permErr = requirePermission(user, USERS_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Organization required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, permissions, expiresInDays } = body as {
      name?: unknown;
      permissions?: unknown;
      expiresInDays?: unknown;
    };

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
      return NextResponse.json({ error: 'Name is required (1-100 characters)' }, { status: 400 });
    }
    if (!user.organizationId) {
      // super_admin without org cannot mint a key with no tenant owner
      return NextResponse.json({ error: 'organizationId required for platform keys' }, { status: 400 });
    }

    const scope = parseScope(permissions);
    const expiresAt = expiryFromDays(expiresInDays);
    const { raw, prefix, hash } = generateApiKey();

    const apiKey = await db.apiKey.create({
      data: {
        name: name.trim(),
        key: hash,        // ONLY the hash is stored — raw key never persisted
        keyPrefix: prefix,
        permissions: scope,
        expiresAt,
        active: true,
        organizationId: user.organizationId,
        userId: user.id,
      },
      select: {
        id: true, name: true, keyPrefix: true, permissions: true,
        expiresAt: true, active: true, createdAt: true, organizationId: true,
      },
    });

    await logAudit({
      user, action: 'create', entity: 'ApiKey', entityId: apiKey.id,
      metadata: { name: apiKey.name, scope, keyPrefix: prefix },
      ipAddress: getClientIp(request),
    });

    // ONE-TIME raw key display — this exact payload is never retrievable again
    return NextResponse.json({ apiKey, key: raw, warning: 'Store this key now — it will not be shown again.' }, { status: 201 });
  } catch (error) {
    logger.error('ApiKeys POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
