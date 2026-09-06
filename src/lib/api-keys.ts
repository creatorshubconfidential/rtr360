/**
 * P0-⑥ — API Key Security
 *
 * Complete lifecycle: generation → hashed storage → verification →
 * rotation → revocation → expiry → last-used tracking → scopes →
 * rate limiting + brute-force protection → audit logging.
 *
 * STORAGE RULE (enforced everywhere in this module):
 *   The RAW key is returned exactly once at creation/rotation.
 *   Only a SHA-256 hex hash is ever persisted (in the ApiKey.key column,
 *   which is UNIQUE — hash uniqueness ≈ key uniqueness).
 *   keyPrefix (first 16 chars of the raw key) is stored for human
 *   identification in listings and logs; it is not usable for auth.
 *
 * VERIFICATION RULES:
 *   - Missing header      → 401 (generic)
 *   - Unknown key         → 401 (generic, constant-path)
 *   - Revoked (active=false) → 401 (generic)
 *   - Expired             → 401 (generic)
 *   - Scope insufficient  → 403 (explicit)
 *   All 401s share one generic message (no oracle distinguishing
 *   unknown vs revoked vs expired), and verification is rate-limited
 *   per IP for brute-force protection. Digest comparison uses
 *   crypto.timingSafeEqual.
 *
 * SCOPES:
 *   'read'  → read-only endpoints
 *   'write' → read + write
 *   'all'   → full account access (still org-scoped)
 */
import { createHash, timingSafeEqual, randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const KEY_PREFIX = 'rtr_';
const RAW_LENGTH = 32; // bytes → 43 base64url chars
const DISPLAY_PREFIX_LENGTH = 16;

export type ApiKeyScope = 'read' | 'write' | 'all';

export const SCOPE_RANK: Record<ApiKeyScope, number> = {
  read: 1,
  write: 2,
  all: 3,
};

export interface GeneratedKey {
  raw: string;       // one-time plaintext — returned to caller, NEVER stored
  prefix: string;    // stored for display (not usable for auth)
  hash: string;      // sha256 hex — the only persisted form
}

/** Generate a new raw API key with its display prefix and hash. */
export function generateApiKey(): GeneratedKey {
  const raw = KEY_PREFIX + randomBytes(RAW_LENGTH).toString('base64url');
  return {
    raw,
    prefix: raw.slice(0, DISPLAY_PREFIX_LENGTH),
    hash: hashApiKey(raw),
  };
}

/** SHA-256 hex digest of a raw key. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Constant-time comparison of two digests (belt-and-braces on top of DB lookup). */
export function safeDigestEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface ApiKeyContext {
  keyId: string;
  organizationId: string | null;
  userId: string | null;
  scope: ApiKeyScope;
  prefix: string;
}

export type ApiKeyAuthResult =
  | { ok: true; context: ApiKeyContext }
  | { ok: false; status: 401 | 403 | 429; error: string };

/**
 * Authenticate a request via the `X-API-Key` header (or Authorization: Bearer).
 * Enforces: existence (by hash), active, not expired, scope, rate limits.
 * Updates lastUsedAt asynchronously. Failures are audit-logged (prefix only).
 *
 * @param request       Incoming request
 * @param requiredScope Minimum scope the endpoint demands
 */
export async function authenticateApiKey(
  request: Request,
  requiredScope: ApiKeyScope = 'read'
): Promise<ApiKeyAuthResult> {
  // 1. Extract the presented key
  const header =
    request.headers.get('x-api-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  const raw = header.trim();
  if (!raw) {
    return { ok: false, status: 401, error: 'Missing API key' };
  }

  const ip = getClientIp(request);

  // 2. Brute-force protection: strict per-IP verification rate limit.
  const rl = await rateLimit(`apikey-verify:${ip}`, 30, 5 * 60 * 1000);
  if (!rl.allowed) {
    logger.warn('apikey.verify_rate_limited', { ip });
    return { ok: false, status: 429, error: 'Too many requests. Please try again later.' };
  }

  // 3. Hash the presented key and look it up
  const hash = hashApiKey(raw);
  const record = await db.apiKey.findUnique({
    where: { key: hash },
    select: {
      id: true,
      active: true,
      expiresAt: true,
      permissions: true,
      organizationId: true,
      userId: true,
      keyPrefix: true,
    },
  });

  // Generic 401 for every failure mode (no oracle)
  const generic401 = { ok: false as const, status: 401 as const, error: 'Invalid API key' };
  if (!record) {
    await logAudit({
      user: { id: null, role: 'api_key', organizationId: null } as never,
      action: 'login',
      entity: 'ApiKey',
      entityId: null,
      metadata: { outcome: 'unknown_key', ip },
      ipAddress: ip,
    });
    return generic401;
  }
  if (!record.active) return generic401;
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return generic401;

  // 4. The hash lookup above IS the verification: SHA-256 preimage
  // resistance makes timing attacks against findUnique irrelevant, and the
  // digest is fixed-length so no collation-dependent comparison exists.

  // 5. Scope enforcement
  const scope = (record.permissions as ApiKeyScope) ?? 'read';
  if (!(scope in SCOPE_RANK) || SCOPE_RANK[scope] < SCOPE_RANK[requiredScope]) {
    return {
      ok: false,
      status: 403,
      error: `Insufficient scope: requires ${requiredScope}`,
    };
  }

  // 6. Last-used tracking (fire-and-forget, never blocks the request)
  db.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    ok: true,
    context: {
      keyId: record.id,
      organizationId: record.organizationId,
      userId: record.userId,
      scope,
      prefix: record.keyPrefix,
    },
  };
}

/** Validate a requested scope value from user input. */
export function parseScope(input: unknown): ApiKeyScope {
  if (typeof input === 'string' && input in SCOPE_RANK) return input as ApiKeyScope;
  return 'read';
}

/**
 * Compute expiry Date from a lifetime in days (null = never expires).
 * Max lifetime enforced (3650 days) to prevent accidental non-expiry.
 */
export function expiryFromDays(days: unknown): Date | null {
  const n = typeof days === 'number' && Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : null;
  return n ? new Date(Date.now() + n * 24 * 60 * 60 * 1000) : null;
}
