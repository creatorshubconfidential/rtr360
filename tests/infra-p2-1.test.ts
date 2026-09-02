/**
 * P2-1 Infrastructure Tests
 *
 * Tests for: env validation, request ID, redis abstraction,
 * error types, logger, health/ready endpoints, secret redaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── env.ts ────────────────────────────────────────────────────────

describe('env validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reports missing Redis token when URL is present', async () => {
    process.env.NODE_ENV = 'production';
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.SETUP_INIT_KEY = 'test-key';

    const { getEnvStatus } = await import('@/lib/env');
    const status = getEnvStatus();
    expect(status.errors).toContainEqual(
      expect.stringContaining('UPSTASH_REDIS_REST_URL is set but UPSTASH_REDIS_REST_TOKEN is missing')
    );
  });

  it('reports missing Redis URL when token is present', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token';
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.SETUP_INIT_KEY = 'test-key';

    const { getEnvStatus } = await import('@/lib/env');
    const status = getEnvStatus();
    expect(status.errors).toContainEqual(
      expect.stringContaining('UPSTASH_REDIS_REST_TOKEN is set but UPSTASH_REDIS_REST_URL is missing')
    );
  });

  it('isRedisConfigured returns false when not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { isRedisConfigured } = await import('@/lib/env');
    expect(isRedisConfigured()).toBe(false);
  });

  it('isRedisConfigured returns true when both are set', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

    const { isRedisConfigured } = await import('@/lib/env');
    expect(isRedisConfigured()).toBe(true);
  });

  it('valid is true in development even without all required vars', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;

    const { getEnvStatus } = await import('@/lib/env');
    const status = getEnvStatus();
    expect(status.valid).toBe(true);
  });


  it('does not require SESSION_SECRET for current opaque server-side sessions', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32).toString('base64');
    delete process.env.SESSION_SECRET;
    delete process.env.SETUP_INIT_KEY;

    const { getEnvStatus } = await import('@/lib/env');
    const status = getEnvStatus();

    expect(status.required.SESSION_SECRET).toBeUndefined();
    expect(status.required.SETUP_INIT_KEY).toBeUndefined();
    expect(status.valid).toBe(true);
  });

  it('still requires ENCRYPTION_MASTER_KEY in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    delete process.env.ENCRYPTION_MASTER_KEY;

    const { getEnvStatus } = await import('@/lib/env');
    const status = getEnvStatus();

    expect(status.valid).toBe(false);
    expect(status.errors).toContain('ENCRYPTION_MASTER_KEY is required in production');
  });

  it('never exposes secret values', async () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = 'super-secret-token-12345';
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';

    const { getEnvStatus } = await import('@/lib/env');
    const status = getEnvStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('super-secret-token-12345');
    expect(serialized).not.toContain('user:pass');
  });
});

// ── request-id.ts ────────────────────────────────────────────────

describe('request ID', () => {
  it('generates IDs with rtr_ prefix', async () => {
    const { generateRequestId } = await import('@/lib/request-id');
    const id = generateRequestId();
    expect(id).toMatch(/^rtr_[a-f0-9]{32}$/);
  });

  it('generates unique IDs', async () => {
    const { generateRequestId } = await import('@/lib/request-id');
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    expect(ids.size).toBe(100);
  });

  it('reuses valid incoming x-request-id', async () => {
    const { getRequestId } = await import('@/lib/request-id');
    const validId = 'rtr_0123456789abcdef0123456789abcdef';
    const request = new Request('http://localhost', {
      headers: { 'x-request-id': validId },
    });
    expect(getRequestId(request)).toBe(validId);
  });

  it('rejects malformed x-request-id and generates new one', async () => {
    const { getRequestId, generateRequestId } = await import('@/lib/request-id');
    const request = new Request('http://localhost', {
      headers: { 'x-request-id': 'not-a-valid-id' },
    });
    const id = getRequestId(request);
    expect(id).toMatch(/^rtr_[a-f0-9]{32}$/);
    expect(id).not.toBe('not-a-valid-id');
  });

  it('rejects overly long x-request-id', async () => {
    const { getRequestId } = await import('@/lib/request-id');
    const longId = 'rtr_' + 'a'.repeat(200);
    const request = new Request('http://localhost', {
      headers: { 'x-request-id': longId },
    });
    const id = getRequestId(request);
    expect(id).toMatch(/^rtr_[a-f0-9]{32}$/);
    expect(id).not.toBe(longId);
  });

  it('rejects empty x-request-id', async () => {
    const { getRequestId } = await import('@/lib/request-id');
    const request = new Request('http://localhost', {
      headers: { 'x-request-id': '  ' },
    });
    const id = getRequestId(request);
    expect(id).toMatch(/^rtr_[a-f0-9]{32}$/);
  });

  it('generates new ID when no header present', async () => {
    const { getRequestId } = await import('@/lib/request-id');
    const request = new Request('http://localhost');
    const id = getRequestId(request);
    expect(id).toMatch(/^rtr_[a-f0-9]{32}$/);
  });
});

// ── errors.ts ─────────────────────────────────────────────────────

describe('error foundation', () => {
  it('AppError has correct defaults', async () => {
    const { AppError, ErrorCode } = await import('@/lib/errors');
    const err = new AppError('test error', ErrorCode.NOT_FOUND);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
    expect(err.message).toBe('test error');
  });

  it('INTERNAL errors are not operational', async () => {
    const { AppError, ErrorCode } = await import('@/lib/errors');
    const err = new AppError('crash', ErrorCode.INTERNAL);
    expect(err.isOperational).toBe(false);
    expect(err.statusCode).toBe(500);
  });

  it('errorResponse returns correct shape', async () => {
    const { AppError, ErrorCode, errorResponse } = await import('@/lib/errors');
    const err = new AppError('not found', ErrorCode.NOT_FOUND, { requestId: 'rtr_abc' });
    const response = errorResponse(err);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body.requestId).toBe('rtr_abc');
  });

  it('errorResponse sanitizes unknown errors in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { errorResponse } = await import('@/lib/errors');
    const response = errorResponse(new Error('secret details here'));
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
    expect(response.body).not.toHaveProperty('details');

    process.env.NODE_ENV = originalEnv;
  });

  it('stripSensitive redacts sensitive key=value pairs', async () => {
    const { stripSensitive } = await import('@/lib/errors');
    expect(stripSensitive('password=mysecret123')).toBe('password=[REDACTED]');
    expect(stripSensitive('token=abcdef')).toBe('token=[REDACTED]');
    expect(stripSensitive('DATABASE_URL=postgresql://user:pass@host/db')).toBe('DATABASE_URL=[REDACTED]');
  });

  it('stripSensitive preserves non-sensitive strings', async () => {
    const { stripSensitive } = await import('@/lib/errors');
    expect(stripSensitive('vehicle created successfully')).toBe('vehicle created successfully');
    expect(stripSensitive('status: active')).toBe('status: active');
  });

  it('responses never contain DATABASE_URL', async () => {
    const { AppError, ErrorCode, errorResponse } = await import('@/lib/errors');
    const err = new AppError('db error', ErrorCode.INTERNAL);
    const response = errorResponse(err);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('postgresql://');
    expect(serialized).not.toContain('DATABASE_URL=');
  });
});

// ── logger.ts ─────────────────────────────────────────────────────

describe('logger', () => {
  it('redacts sensitive context fields', async () => {
    const { logger } = await import('@/lib/logger');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.security('auth failure', {
      password: 'secret123',
      authorization: 'Bearer abc',
      userId: 'user_1',
    });

    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain('secret123');
    expect(output).not.toContain('Bearer abc');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('user_1');

    spy.mockRestore();
  });

  it('truncates long string values', async () => {
    const { logger } = await import('@/lib/logger');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const longValue = 'x'.repeat(300);
    logger.info('test', { data: longValue });

    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('...[truncated]');
    expect(output).not.toContain(longValue);

    spy.mockRestore();
  });

  it('includes structured fields', async () => {
    const { logger } = await import('@/lib/logger');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('request processed', {
      requestId: 'rtr_abc123',
      route: '/api/vehicles',
      method: 'GET',
    });

    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('rtr_abc123');
    expect(output).toContain('/api/vehicles');
    expect(output).toContain('GET');

    spy.mockRestore();
  });

  it('security level outputs to console.error', async () => {
    const { logger } = await import('@/lib/logger');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.security('suspicious IDOR attempt', { userId: 'u1', targetOrgId: 'o2' });

    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('SECURITY');
    expect(output).toContain('suspicious IDOR attempt');

    spy.mockRestore();
  });

  it('never logs Redis credentials', async () => {
    const { logger } = await import('@/lib/logger');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('redis check', {
      upstashRedisRestUrl: 'https://example.upstash.io',
      upstashRedisRestToken: 'secret-token-xyz',
    });

    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain('secret-token-xyz');
    expect(output).toContain('[REDACTED]');

    spy.mockRestore();
  });

  it('never logs DATABASE_URL', async () => {
    const { logger } = await import('@/lib/logger');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('db check', {
      databaseUrl: 'postgresql://user:pass@host/db',
    });

    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain('postgresql://');
    expect(output).not.toContain('user:pass');
    expect(output).toContain('[REDACTED]');

    spy.mockRestore();
  });
});

// ── redis.ts ──────────────────────────────────────────────────────

describe('redis abstraction', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null for get when not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { redis } = await import('@/lib/redis');
    const result = await redis.get('test-key');
    expect(result).toBeNull();
  });

  it('returns false for set when not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { redis } = await import('@/lib/redis');
    const result = await redis.set('key', 'value', 60);
    expect(result).toBe(false);
  });

  it('returns null for incr when not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { redis } = await import('@/lib/redis');
    const result = await redis.incr('counter');
    expect(result).toBeNull();
  });

  it('getHealth reports not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { redis } = await import('@/lib/redis');
    const health = await redis.getHealth();
    expect(health.available).toBe(false);
    expect(health.error).toBe('not configured');
  });

  it('handles Redis timeout gracefully', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'http://localhost:1';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

    const { redis } = await import('@/lib/redis');
    // Connection to localhost:1 will fail/timeout — should return null, not throw
    const result = await redis.get('test-key');
    expect(result).toBeNull();
  });

  it('handles Redis connection failure gracefully', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://invalid-url-that-does-not-exist.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

    const { redis } = await import('@/lib/redis');
    const result = await redis.incr('counter');
    // Should return null (not throw) on connection failure
    expect(result).toBeNull();
  });
});

// ── Health endpoint integration ──────────────────────────────────

describe('health/ready endpoint patterns', () => {
  it('env status does not expose secret values', async () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = 'super-secret-token';
    process.env.DATABASE_URL = 'postgresql://admin:password@host/prod';
    process.env.OPENAI_API_KEY = 'sk-proj-abc123';

    const { getEnvStatus } = await import('@/lib/env');
    const status = getEnvStatus();
    const serialized = JSON.stringify(status);

    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('admin:password');
    expect(serialized).not.toContain('sk-proj-abc123');
  });

  it('health responses do not contain DATABASE_URL', async () => {
    const { errorResponse } = await import('@/lib/errors');
    const { AppError, ErrorCode } = await import('@/lib/errors');

    const err = new AppError('health check', ErrorCode.SERVICE_UNAVAILABLE);
    const response = errorResponse(err, 'rtr_test');
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('postgresql://');
    expect(serialized).not.toContain('DATABASE_URL');
  });

  it('health responses do not contain Redis token', async () => {
    const { errorResponse } = await import('@/lib/errors');
    const { AppError, ErrorCode } = await import('@/lib/errors');

    const err = new AppError('redis down', ErrorCode.SERVICE_UNAVAILABLE);
    const response = errorResponse(err);
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('UPSTASH_REDIS_REST_TOKEN');
  });
});
