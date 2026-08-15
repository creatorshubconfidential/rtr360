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

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiter = {
  /** Auth routes: 10 req/min per IP */
  auth: (ip: string) => rateLimit(`auth:${ip}`, 10, 60 * 1000),
  /** General API: 60 req/min per IP */
  api: (ip: string) => rateLimit(`api:${ip}`, 60, 60 * 1000),
  /** Strict: 5 req/min per IP (login attempts) */
  strict: (ip: string) => rateLimit(`strict:${ip}`, 5, 60 * 1000),
};
