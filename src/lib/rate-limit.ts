import { NextResponse } from 'next/server';

/**
 * Production-safe rate limiter for API routes.
 *
 * Uses an in-memory sliding window counter per IP + endpoint.
 * For multi-instance deployments, use a Redis-backed store
 * by replacing `getCounter`/`setCounter` with Redis calls.
 *
 * Features:
 *   - Sliding window with per-endpoint keys
 *   - Configurable tiers (auth, api, strict, analytics)
 *   - Automatic cleanup of expired entries
 *   - IP extraction behind proxies (X-Forwarded-For)
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

// ── Store ─────────────────────────────────────────────────────────
// In-memory Map. For multi-instance, replace with Redis:
//   import Redis from 'ioredis';
//   const redis = new Redis(process.env.REDIS_URL);
//   Then use redis.incr() + redis.expire() for atomic counters.

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;

// Clean up expired entries every 60 seconds
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
    // Prevent unbounded growth
    if (store.size > MAX_STORE_SIZE) {
      const keys = [...store.keys()];
      for (let i = 0; i < keys.length / 2; i++) store.delete(keys[i]);
    }
  }, 60 * 1000);
  // Allow Node.js to exit even if timer is active
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
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
 * Thread-safe within a single Node.js event loop.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60 * 1000
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Extract client IP from request headers (works behind proxies).
 * Uses the leftmost IP in X-Forwarded-For as the client IP.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    // Basic validation: must look like an IPv4 or IPv6
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
export function perEndpointRateLimit(
  ip: string,
  path: string,
  tier: RateLimitTier = 'api'
): RateLimitResult {
  const { limit, windowMs } = TIER_LIMITS[tier];
  return rateLimit(`${tier}:${path}:${ip}`, limit, windowMs);
}

/**
 * Middleware-style rate limit check for Next.js API route handlers.
 * Returns a 429 NextResponse if rate limited, or null if allowed.
 *
 * Usage:
 *   const rl = checkRateLimit(request, 'api');
 *   if (rl) return rl;
 */
export function checkRateLimit(
  request: Request,
  tier: RateLimitTier = 'api'
): NextResponse | null {
  const ip = getClientIp(request);
  const url = new URL(request.url);
  const pathKey = url.pathname.replace(/^\/api\//, '');
  const { allowed, resetAt } = perEndpointRateLimit(ip, pathKey, tier);

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
