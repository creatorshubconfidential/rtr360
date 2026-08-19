import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { getEnvStatus, isRedisConfigured } from '@/lib/env';
import { isProduction } from '@/lib/env';

const START_TIME = Date.now();

/**
 * Liveness: application process is alive.
 * Always returns 200 if the process can respond.
 */
export async function GET() {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  // Database health — lightweight check
  let database: { status: string; latencyMs: number | null };
  try {
    const start = performance.now();
    await db.$queryRaw`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    database = { status: 'healthy', latencyMs };
  } catch {
    database = { status: 'unavailable', latencyMs: null };
  }

  // Redis health — optional dependency
  let redisHealth: { status: string; latencyMs: number | null } | null = null;
  if (isRedisConfigured()) {
    const health = await redis.getHealth();
    redisHealth = {
      status: health.available ? 'healthy' : 'degraded',
      latencyMs: health.latencyMs,
    };
  }

  // Environment status — no secret values exposed
  const envStatus = getEnvStatus();

  // Determine overall status
  const dbHealthy = database.status === 'healthy';
  const redisDegraded = redisHealth !== null && redisHealth.status === 'degraded';
  const envValid = envStatus.valid;

  let overallStatus: 'healthy' | 'degraded' | 'not_ready';
  if (!dbHealthy) {
    overallStatus = 'not_ready';
  } else if (redisDegraded || !envValid) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  const statusCode = overallStatus === 'not_ready' ? 503 : 200;

  const checks: Record<string, { status: string; latencyMs: number | null }> = {
    database,
  };

  if (redisHealth) {
    checks.redis = redisHealth;
  }

  const body: Record<string, unknown> = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime,
    version: process.env.npm_package_version || '0.2.1',
    checks,
    environment: {
      node: envStatus.environment,
      requiredPresent: Object.values(envStatus.required).filter(v => v.present).length,
      requiredTotal: Object.keys(envStatus.required).length,
      valid: envStatus.valid,
      ...(isProduction() && !envValid ? { envErrors: envStatus.errors } : {}),
    },
  };

  return NextResponse.json(body, { status: statusCode });
}
