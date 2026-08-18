import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Production-safe distributed rate limiter for API routes.
 *
 * Architecture: L1 in-memory cache + L2 database (PostgreSQL) source of truth.
 *   - L1 (in-memory): Fast O(1) lookups, avoids DB hit on every request.
 *   - L2 (database): Shared across all serverless instances via RateLimitCounter table.
 *
 * Fault tolerance: If the L2 database table is unavailable (e.g. migration not run
 * on a new Supabase instance), the limiter automatically falls back to L1-only mode.
 * This prevents login and other API routes from crashing with 500 errors.
 *
 * For very high throughput deployments, replace L2 with Redis (Upstash / Vercel KV)
 * using the same interface — swap getFromStore/incrementInStore with Redis INCR + EXPIRE.
 *
 * Features:
 *   - Sliding window with per-endpoint keys
 *   - Configurable tiers (auth, api, strict, analytics)
 *   - Automatic cleanup of expired entries (L1 + periodic L2)
 *   - IP extraction behind proxies (X-Forwarded-For)
 *   - Distributed: works across multiple Vercel serverless instances
 *   - Graceful L1-only fallback when L2 is unavailable
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
// Bounded Map for fast local lookups. Falls through to DB for misses
// and writes through to DB for distributed correctness.

const cache = new Map<string, RateLimitEntry>();
const MAX_CACHE_SIZE = 10_000;
const CACHE_TTL_MS = 5_000; // L1 entries considered fresh for 5s

// Track whether L2 database is available. Once it fails, we skip all
// future L2 calls for the lifetime of this serverless instance.
let l2Failed = false;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    // Purge expired entries from L1
    for (const [key, entry] of cache) {
      if (entry.resetAt <= now) cache.delete(key);
    }
    // Prevent unbounded growth
    if (cache.size > MAX_CACHE_SIZE) {
      const keys = [...cache.keys()];
      for (let i = 0; i < keys.length / 2; i++) cache.delete(keys[i]);
    }
    // Purge expired entries from L2 (database) — runs every 60s
    purgeExpiredDbCounters(now);
  }, 60 * 1000);
  // Allow Node.js to exit even if timer is active
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Purge expired rate limit counters from the database.
 * Keeps the table from growing unbounded.
 */
async function purgeExpiredDbCounters(now: number) {
  if (l2Failed) return;
  try {
    await db.rateLimitCounter.deleteMany({
      where: { resetAt: { lt: new Date(now) } },
    });
  } catch {
    l2Failed = true;
  }
}

// ── L2 Database Store ────────────────────────────────────────────

/**
 * Atomic increment-or-create in the database.
 * Uses upsert for race-condition safety across instances.
 * Returns null if the database is unavailable.
 */
async function incrementInDb(key: string, windowMs: number): Promise<RateLimitEntry | null> {
  if (l2Failed) return null;
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

    return {
      count: counter.count,
      resetAt: counter.resetAt.getTime(),
    };
  } catch {
    l2Failed = true;
    return null;
  }
}

/**
 * Read current counter from database (cache miss path).
 * Returns null if the database is unavailable.
 */
async function readFromDb(key: string): Promise<RateLimitEntry | null> {
  if (l2Failed) return null;
  try {
    const counter = await db.rateLimitCounter.findUnique({ where: { key } });
    if (!counter) return null;
    const now = Date.now();
    if (counter.resetAt.getTime() <= now) return null;
    return { count: counter.count, resetAt: counter.resetAt.getTime() };
  } catch {
    l2Failed = true;
    return null;
  }
}

// ── L1-Only Fallback ─────────────────────────────────────────────

/**
 * In-memory only rate limiting when L2 database is unavailable.
 * Not distributed, but prevents login from crashing on Vercel.
 */
function l1OnlyRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.resetAt > now) {
    // Existing window — check limit
    const incremented = { count: cached.count + 1, resetAt: cached.resetAt };
    cache.set(key, incremented);
    if (incremented.count > limit) {
      return { allowed: false, remaining: 0, resetAt: incremented.resetAt };
    }
    return { allowed: true, remaining: Math.max(0, limit - incremented.count), resetAt: incremented.resetAt };
  }

  // New window
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
 * Check rate limit for a given key using distributed store.
 *
 * Flow:
 *  1. If L2 known unavailable → use L1-only fallback
 *  2. Check L1 cache — if fresh hit, use it (O(1))
 *  3. On miss or stale, read from L2 database
 *  4. If L2 fails → fall back to L1-only and remember
 *  5. If no entry, increment in DB and cache the result
 *  6. If expired, increment in DB (new window) and cache
 *  7. If under limit, increment in DB and cache
 *  8. If over limit, return denied (don't increment)
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60 * 1000
): Promise<RateLimitResult> {
  ensureCleanup();

  // Fast path: L2 known to be unavailable → use L1 only
  if (l2Failed) {
    return l1OnlyRateLimit(key, limit, windowMs);
  }

  const now = Date.now();

  // L1 cache check
  const cached = cache.get(key);
  if (cached && cached.resetAt > now) {
    // Cache is fresh — return from cache without hitting DB
    if (cached.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: cached.resetAt };
    }
    // Optimistic increment in L1
    const incremented = { count: cached.count + 1, resetAt: cached.resetAt };
    cache.set(key, incremented);
    return { allowed: true, remaining: Math.max(0, limit - incremented.count), resetAt: incremented.resetAt };
  }

  // L2 database check
  const existing = await readFromDb(key);

  // If DB read failed, fall back to L1-only
  if (l2Failed) {
    return l1OnlyRateLimit(key, limit, windowMs);
  }

  const effectiveExisting = existing || (cached && cached.resetAt > now ? cached : null);

  if (!effectiveExisting || effectiveExisting.resetAt <= now) {
    // No entry or expired — create new window
    const entry = await incrementInDb(key, windowMs);
    if (!entry) {
      // DB write failed — fall back to L1-only
      return l1OnlyRateLimit(key, limit, windowMs);
    }
    cache.set(key, entry);
    return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }

  if (effectiveExisting.count >= limit) {
    cache.set(key, effectiveExisting);
    return { allowed: false, remaining: 0, resetAt: effectiveExisting.resetAt };
  }

  // Under limit — increment
  const entry = await incrementInDb(key, windowMs);
  if (!entry) {
    return l1OnlyRateLimit(key, limit, windowMs);
  }
  cache.set(key, entry);
  return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}

/**
 * Extract client IP from request headers (works behind proxies).
 * Uses the leftmost IP in X-Forwarded-For as the client IP.
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
  /** Auth routes: 10 req/min per IP */
  auth: (ip: string) => rateLimit(`auth:${ip}`, TIER_LIMITS.auth.limit, TIER_LIMITS.auth.windowMs),
  /** General API: 60 req/min per IP */
  api: (ip: string) => rateLimit(`api:${ip}`, TIER_LIMITS.api.limit, TIER_LIMITS.api.windowMs),
  /** Strict: 5 req/min per IP (login attempts) */
  strict: (ip: string) => rateLimit(`strict:${ip}`, TIER_LIMITS.strict.limit, TIER_LIMITS.strict.windowMs),
  /** Analytics/AI routes: 20 req/min per IP */
  analytics: (ip: string) => rateLimit(`analytics:${ip}`, TIER_LIMITS.analytics.limit, TIER_LIMITS.analytics.windowMs),
};
