import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRedisConfigured, isProduction } from '@/lib/env';

/**
 * Readiness: critical dependencies are usable.
 * Returns 200 if the application can serve requests,
 * 503 if critical dependencies are down.
 *
 * Database is always critical.
 * Redis is optional — its absence does not affect readiness.
 */
export async function GET() {
  const checks: Record<string, { status: string; critical: boolean }> = {};
  let ready = true;

  // Database is critical
  try {
    const start = performance.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'healthy', critical: true };
  } catch {
    checks.database = { status: 'unavailable', critical: true };
    ready = false;
  }

  // Redis is optional — report but don't affect readiness
  if (isRedisConfigured()) {
    try {
      const { redis } = await import('@/lib/redis');
      const health = await redis.getHealth();
      checks.redis = {
        status: health.available ? 'healthy' : 'degraded',
        critical: false,
      };
    } catch {
      checks.redis = { status: 'degraded', critical: false };
    }
  }

  // In production, check required env vars
  if (isProduction()) {
    const hasDbUrl = Boolean(process.env.DATABASE_URL);
    if (!hasDbUrl) {
      checks.env_database_url = { status: 'missing', critical: true };
      ready = false;
    }
  }

  const statusCode = ready ? 200 : 503;

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: statusCode }
  );
}
