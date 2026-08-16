import { NextResponse } from 'next/server';

/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window counter per IP + endpoint.
 * Not suitable for multi-instance deployments (use Redis for that).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given identifier (e.g., IP address).
 * @param key - Unique key (typically IP + endpoint)
 * @param limit - Max requests in the window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60 * 1000
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    // New window
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
 * Extract client IP from request headers (works behind proxies)
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export type RateLimitTier = 'auth' | 'api' | 'strict' | 'analytics';

const TIER_LIMITS: Record<RateLimitTier, number> = {
  auth: 10,
  api: 60,
  strict: 5,
  analytics: 20,
};

/**
 * Per-endpoint rate limiter using IP + path as key.
 * This prevents one endpoint from consuming the entire IP bucket.
 */
export function perEndpointRateLimit(
  ip: string,
  path: string,
  tier: RateLimitTier = 'api'
): RateLimitResult {
  return rateLimit(`${tier}:${path}:${ip}`, TIER_LIMITS[tier], 60 * 1000);
}

/**
 * Middleware-style rate limit check for Next.js API route handlers.
 * Call at the top of any route handler:
 *   const rl = checkRateLimit(request, 'api');
 *   if (rl) return rl;
 * Returns a 429 NextResponse if rate limited, or null if allowed.
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
 * Pre-configured rate limiters for legacy/inline usage (login already uses these)
 */
export const rateLimiter = {
  /** Auth routes: 10 req/min per IP */
  auth: (ip: string) => rateLimit(`auth:${ip}`, TIER_LIMITS.auth, 60 * 1000),
  /** General API: 60 req/min per IP */
  api: (ip: string) => rateLimit(`api:${ip}`, TIER_LIMITS.api, 60 * 1000),
  /** Strict: 5 req/min per IP (login attempts) */
  strict: (ip: string) => rateLimit(`strict:${ip}`, TIER_LIMITS.strict, 60 * 1000),
  /** Analytics/AI routes: 20 req/min per IP */
  analytics: (ip: string) => rateLimit(`analytics:${ip}`, TIER_LIMITS.analytics, 60 * 1000),
};
