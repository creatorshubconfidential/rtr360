import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';

/**
 * Production-safe distributed rate limiter for API routes.
 *
 * Architecture (3-tier fallback):
 *   L1: In-memory cache (per-instance, O(1), 5s TTL)
 *   L2: Upstash Redis via shared redis.ts abstraction (cross-instance, atomic INCR)
 *   L3: PostgreSQL RateLimitCounter table (cross-instance, upsert)
 *
 * Failure mode: If L2 (Redis) and L3 (DB) are both unavailable, falls back to
 * L1-only mode. L1 is per-instance so it's not truly distributed, but it
 * prevents login/API crashes. Security-sensitive endpoints (auth, strict)
 * will still deny when L1 limit is hit.
 *
 * Rate-limit failures FAIL CLOSED: if the distributed store errors, we
 * continue using L1 which still enforces limits (just not cross-instance).
 */

// ── Types ────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export type RateLimitTier = 'auth' | 'api' | 'strict' | 'analytics';

// ── L1 In-Memory Cache ───────────────────────────────────────────

const cache = new Map<string, RateLimitEntry>();
const MAX_CACHE_SIZE = 10_000;

let l3DbFailed = false;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.resetAt <= now) cache.delete(key);
    }
    if (cache.size > MAX_CACHE_SIZE) {
      const keys = [...cache.keys()];
      for (let i = 0; i < keys.length / 2; i++) cache.delete(keys[i]);
    }
    purgeExpiredDbCounters(now);
  }, 60 * 1000);
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ── L2 Redis (via shared abstraction) ────────────────────────────

/**
 * Atomic INCR + EXPIRE via the shared redis.ts abstraction.
 * Returns null if Redis is unavailable or not configured.
 */
async function incrementInRedis(key: string, limit: number, windowSec: number): Promise<RateLimitResult | null> {
  const redisKey = `rtr360:rl:${key}`;
  const count = await redis.incrWithExpire(redisKey, windowSec);

  if (count === null) return null;

  if (count > limit) {
    return { allowed: false, remaining: 0, resetAt: Date.now() + windowSec * 1000 };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    resetAt: Date.now() + windowSec * 1000,
  };
}

// ── L3 Database Store ────────────────────────────────────────────

async function purgeExpiredDbCounters(now: number) {
  if (l3DbFailed) return;
  try {
    await db.rateLimitCounter.deleteMany({
      where: { resetAt: { lt: new Date(now) } },
    });
  } catch {
    l3DbFailed = true;
  }
}

async function incrementInDb(key: string, windowMs: number): Promise<RateLimitEntry | null> {
  if (l3DbFailed) return null;
  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);
    const counter = await db.rateLimitCounter.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: {
        count: { increment: 1 },
        resetAt: { set: resetAt },
      },
    });
    return { count: counter.count, resetAt: counter.resetAt.getTime() };
  } catch {
    l3DbFailed = true;
    return null;
  }
}

async function readFromDb(key: string): Promise<RateLimitEntry | null> {
  if (l3DbFailed) return null;
  try {
    const counter = await db.rateLimitCounter.findUnique({ where: { key } });
    if (!counter) return null;
    const now = Date.now();
    if (counter.resetAt.getTime() <= now) return null;
    return { count: counter.count, resetAt: counter.resetAt.getTime() };
  } catch {
    l3DbFailed = true;
    return null;
  }
}

// ── L1-Only Fallback ─────────────────────────────────────────────

function l1OnlyRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.resetAt > now) {
    const incremented = { count: cached.count + 1, resetAt: cached.resetAt };
    cache.set(key, incremented);
    if (incremented.count > limit) {
      return { allowed: false, remaining: 0, resetAt: incremented.resetAt };
    }
    return { allowed: true, remaining: Math.max(0, limit - incremented.count), resetAt: incremented.resetAt };
  }

  const entry = { count: 1, resetAt: now + windowMs };
  cache.set(key, entry);
  return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: entry.resetAt };
}

// ── Tiers ─────────────────────────────────────────────────────────

const TIER_LIMITS: Record<RateLimitTier, { limit: number; windowMs: number }> = {
  auth: { limit: 10, windowMs: 60 * 1000 },
  api: { limit: 60, windowMs: 60 * 1000 },
  strict: { limit: 5, windowMs: 60 * 1000 },
  analytics: { limit: 20, windowMs: 60 * 1000 },
};

// ── Core ──────────────────────────────────────────────────────────

/**
 * Check rate limit for a given key.
 *
 * Resolution order:
 *  1. L1 cache (fast path, per-instance)
 *  2. L2 Redis (Upstash, cross-instance, atomic INCR)
 *  3. L3 PostgreSQL (cross-instance, upsert)
 *  4. L1-only fallback (per-instance, not distributed but safe)
 *
 * All stores use the same key format: `tier:path:ip`
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60 * 1000
): Promise<RateLimitResult> {
  ensureCleanup();

  const now = Date.now();

  // L1 cache check
  const cached = cache.get(key);
  if (cached && cached.resetAt > now) {
    if (cached.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: cached.resetAt };
    }
    const incremented = { count: cached.count + 1, resetAt: cached.resetAt };
    cache.set(key, incremented);
    return { allowed: true, remaining: Math.max(0, limit - incremented.count), resetAt: incremented.resetAt };
  }

  // L2 Redis (atomic INCR + EXPIRE)
  const windowSec = Math.ceil(windowMs / 1000);
  const redisResult = await incrementInRedis(key, limit, windowSec);
  if (redisResult) {
    cache.set(key, { count: redisResult.allowed ? (limit - redisResult.remaining) : limit + 1, resetAt: redisResult.resetAt });
    return redisResult;
  }

  // L3 PostgreSQL fallback
  const existing = await readFromDb(key);
  if (l3DbFailed) {
    return l1OnlyRateLimit(key, limit, windowMs);
  }

  const effectiveExisting = existing || (cached && cached.resetAt > now ? cached : null);

  if (!effectiveExisting || effectiveExisting.resetAt <= now) {
    const entry = await incrementInDb(key, windowMs);
    if (!entry) return l1OnlyRateLimit(key, limit, windowMs);
    cache.set(key, entry);
    return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }

  if (effectiveExisting.count >= limit) {
    cache.set(key, effectiveExisting);
    return { allowed: false, remaining: 0, resetAt: effectiveExisting.resetAt };
  }

  const entry = await incrementInDb(key, windowMs);
  if (!entry) return l1OnlyRateLimit(key, limit, windowMs);
  cache.set(key, entry);
  return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}

/**
 * Extract client IP from request headers (works behind proxies).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(firstIp) ||
        /^[0-9a-fA-F:]+$/.test(firstIp)) {
      return firstIp;
    }
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/**
 * Per-endpoint rate limiter using IP + path as key.
 */
export async function perEndpointRateLimit(
  ip: string,
  path: string,
  tier: RateLimitTier = 'api'
): Promise<RateLimitResult> {
  const { limit, windowMs } = TIER_LIMITS[tier];
  return rateLimit(`${tier}:${path}:${ip}`, limit, windowMs);
}

/**
 * Middleware-style rate limit check for Next.js API route handlers.
 * Returns a 429 NextResponse if rate limited, or null if allowed.
 */
export async function checkRateLimit(
  request: Request,
  tier: RateLimitTier = 'api'
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const url = new URL(request.url);
  const pathKey = url.pathname.replace(/^\/api\//, '');
  const { allowed, resetAt } = await perEndpointRateLimit(ip, pathKey, tier);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }
  return null;
}

/**
 * Pre-configured rate limiters for legacy/inline usage.
 */
export const rateLimiter = {
  auth: (ip: string) => rateLimit(`auth:${ip}`, TIER_LIMITS.auth.limit, TIER_LIMITS.auth.windowMs),
  api: (ip: string) => rateLimit(`api:${ip}`, TIER_LIMITS.api.limit, TIER_LIMITS.api.windowMs),
  strict: (ip: string) => rateLimit(`strict:${ip}`, TIER_LIMITS.strict.limit, TIER_LIMITS.strict.windowMs),
  analytics: (ip: string) => rateLimit(`analytics:${ip}`, TIER_LIMITS.analytics.limit, TIER_LIMITS.analytics.windowMs),
};
