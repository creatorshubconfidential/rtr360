import { db } from '@/lib/db';
import type { UserSession } from '@/lib/auth';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'status_change';

interface AuditParams {
  user: UserSession;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Fire-and-forget audit log writer.
 * Writes to AuditLog table. Never throws — errors are silently swallowed to avoid
 * breaking the original request flow.
 *
 * Usage (after a successful DB write):
 *   await logAudit({ user, action: 'create', entity: 'Vehicle', entityId: vehicle.id, request });
 */
export async function logAudit({
  user,
  action,
  entity,
  entityId,
  metadata,
  ipAddress,
}: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: user.id,
        action,
        entity,
        entityId: entityId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: ipAddress ?? null,
        organizationId: user.organizationId,
      },
    });
  } catch {
    // Intentionally swallowed — audit logging must never break request flow
  }
}

/**
 * Extract client IP from request headers (X-Forwarded-For or fallback to remote address).
 */
export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || undefined;
  }
  // Next.js Route Handler doesn't expose remoteAddress directly;
  // x-real-ip is commonly set by reverse proxies
  return request.headers.get('x-real-ip') || undefined;
}
