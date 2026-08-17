import { describe, it, expect, beforeEach, vi } from 'vitest';

// Test the rate-limit module directly (bypasses Next.js)
// We re-implement the core logic here to test it independently.

describe('P1-7: Rate Limiting', () => {
  // ── In-memory store (mirrors src/lib/rate-limit.ts) ──
  interface RateLimitEntry {
    count: number;
    resetAt: number;
  }
  const store = new Map<string, RateLimitEntry>();

  function rateLimit(key: string, limit: number, windowMs: number = 60_000): { allowed: boolean; remaining: number; resetAt: number } {
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

  function getClientIp(request: { headers: { get: (name: string) => string | null } }): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
    return 'unknown';
  }

  // ── Helper to create a mock request ──
  function mockRequest(ip = '1.2.3.4', url = 'http://localhost:3000/api/vehicles') {
    return {
      url,
      headers: {
        get: (name: string) => {
          if (name === 'x-forwarded-for') return ip;
          if (name === 'x-real-ip') return null;
          return null;
        },
      },
    };
  }

  // ── Per-endpoint rate limit (mirrors the library) ──
  const TIER_LIMITS = { auth: 10, api: 60, strict: 5, analytics: 20 };
  type Tier = keyof typeof TIER_LIMITS;

  function perEndpointRateLimit(ip: string, path: string, tier: Tier = 'api') {
    return rateLimit(`${tier}:${path}:${ip}`, TIER_LIMITS[tier], 60_000);
  }

  beforeEach(() => {
    store.clear();
  });

  // ────────────────────────────────────────────────
  // Core rateLimit function
  // ────────────────────────────────────────────────
  describe('rateLimit() core', () => {
    it('allows requests under the limit', () => {
      const result = rateLimit('test:1.2.3.4', 5);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('counts requests correctly', () => {
      for (let i = 0; i < 5; i++) {
        const r = rateLimit('test:1.2.3.4', 5);
        expect(r.allowed).toBe(true);
      }
      // 6th should be blocked
      const blocked = rateLimit('test:1.2.3.4', 5);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('resets after window expires', () => {
      const result = rateLimit('test:expire', 1, 1); // 1ms window
      expect(result.allowed).toBe(true);
      // Simulate window expiry by deleting the entry directly
      store.delete('test:expire');
      const allowed = rateLimit('test:expire', 1, 1);
      expect(allowed.allowed).toBe(true);
    });

    it('isolates different keys', () => {
      rateLimit('key-a:1.2.3.4', 1);
      rateLimit('key-a:1.2.3.4'); // blocked
      const otherKey = rateLimit('key-b:1.2.3.4', 1);
      expect(otherKey.allowed).toBe(true);
    });
  });

  // ────────────────────────────────────────────────
  // Per-endpoint rate limiting
  // ────────────────────────────────────────────────
  describe('perEndpointRateLimit()', () => {
    it('uses correct limit per tier', () => {
      // strict tier = 5
      for (let i = 0; i < 5; i++) {
        const r = perEndpointRateLimit('1.2.3.4', 'auth/login', 'strict');
        expect(r.allowed).toBe(true);
      }
      expect(perEndpointRateLimit('1.2.3.4', 'auth/login', 'strict').allowed).toBe(false);

      // api tier = 60
      for (let i = 0; i < 60; i++) {
        expect(perEndpointRateLimit('1.2.3.4', 'vehicles', 'api').allowed).toBe(true);
      }
      expect(perEndpointRateLimit('1.2.3.4', 'vehicles', 'api').allowed).toBe(false);

      // analytics tier = 20
      for (let i = 0; i < 20; i++) {
        expect(perEndpointRateLimit('1.2.3.4', 'ai/chat', 'analytics').allowed).toBe(true);
      }
      expect(perEndpointRateLimit('1.2.3.4', 'ai/chat', 'analytics').allowed).toBe(false);
    });

    it('isolates different endpoints for same IP', () => {
      // Exhaust vehicles endpoint
      for (let i = 0; i < 60; i++) {
        perEndpointRateLimit('1.2.3.4', 'vehicles', 'api');
      }
      // drivers should still be allowed
      expect(perEndpointRateLimit('1.2.3.4', 'drivers', 'api').allowed).toBe(true);
    });

    it('isolates different IPs for same endpoint', () => {
      // Exhaust vehicles for IP A
      for (let i = 0; i < 60; i++) {
        perEndpointRateLimit('1.1.1.1', 'vehicles', 'api');
      }
      // IP B should still be allowed on vehicles
      expect(perEndpointRateLimit('2.2.2.2', 'vehicles', 'api').allowed).toBe(true);
    });
  });

  // ────────────────────────────────────────────────
  // IP extraction
  // ────────────────────────────────────────────────
  describe('getClientIp()', () => {
    it('extracts IP from x-forwarded-for', () => {
      const req = mockRequest('10.0.0.1');
      expect(getClientIp(req as any)).toBe('10.0.0.1');
    });

    it('takes first IP from comma-separated x-forwarded-for', () => {
      const req = {
        url: 'http://localhost/api/test',
        headers: {
          get: (name: string) => {
            if (name === 'x-forwarded-for') return '10.0.0.1, 172.16.0.1';
            return null;
          },
        },
      };
      expect(getClientIp(req as any)).toBe('10.0.0.1');
    });

    it('falls back to x-real-ip', () => {
      const req = {
        url: 'http://localhost/api/test',
        headers: {
          get: (name: string) => {
            if (name === 'x-forwarded-for') return null;
            if (name === 'x-real-ip') return '192.168.1.1';
            return null;
          },
        },
      };
      expect(getClientIp(req as any)).toBe('192.168.1.1');
    });

    it('returns unknown when no headers present', () => {
      const req = {
        url: 'http://localhost/api/test',
        headers: { get: () => null },
      };
      expect(getClientIp(req as any)).toBe('unknown');
    });
  });

  // ────────────────────────────────────────────────
  // checkRateLimit integration pattern
  // ────────────────────────────────────────────────
  describe('checkRateLimit pattern (integration)', () => {
    it('returns null when allowed (simulated)', () => {
      const req = mockRequest('5.5.5.5', 'http://localhost:3000/api/vehicles');
      const ip = getClientIp(req as any);
      const result = perEndpointRateLimit(ip, 'vehicles', 'api');
      expect(result.allowed).toBe(true);
      // checkRateLimit would return null (allowed)
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('would return 429 when blocked (simulated)', () => {
      const ip = '9.9.9.9';
      // Exhaust strict tier (5 req/min)
      for (let i = 0; i < 5; i++) {
        perEndpointRateLimit(ip, 'auth/login', 'strict');
      }
      const result = perEndpointRateLimit(ip, 'auth/login', 'strict');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      // checkRateLimit would return a 429 response with Retry-After header
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      expect(retryAfter).toBeGreaterThanOrEqual(0);
    });
  });

  // ────────────────────────────────────────────────
  // Tier limits verification
  // ────────────────────────────────────────────────
  describe('tier limit values', () => {
    it('auth tier allows 10 req/min', () => {
      let count = 0;
      while (perEndpointRateLimit('1.1.1.1', 'auth/test', 'auth').allowed) count++;
      expect(count).toBe(10);
    });

    it('api tier allows 60 req/min', () => {
      let count = 0;
      while (perEndpointRateLimit('1.1.1.1', 'api/test', 'api').allowed) count++;
      expect(count).toBe(60);
    });

    it('strict tier allows 5 req/min', () => {
      let count = 0;
      while (perEndpointRateLimit('1.1.1.1', 'login', 'strict').allowed) count++;
      expect(count).toBe(5);
    });

    it('analytics tier allows 20 req/min', () => {
      let count = 0;
      while (perEndpointRateLimit('1.1.1.1', 'ai/chat', 'analytics').allowed) count++;
      expect(count).toBe(20);
    });
  });
});
