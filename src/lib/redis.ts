/**
 * Centralized Redis abstraction for RTR 360.
 *
 * Upstash REST API compatible.
 * Configurable timeout. Circuit breaker on consecutive failures.
 * Never becomes a single point of failure — all methods return null on error.
 *
 * Usage:
 *   import { redis } from '@/lib/redis';
 *   await redis.get('key');
 *   await redis.set('key', 'value', 60);
 */

import { isRedisConfigured } from '@/lib/env';

// ── Types ────────────────────────────────────────────────────────

interface RedisConfig {
  url: string;
  token: string;
  timeoutMs: number;
}

interface PipelineCommand extends Array<string> {
  0: string; // command
  1: string; // first arg (key)
}

interface HealthResult {
  available: boolean;
  latencyMs: number | null;
  error: string | null;
}

// ── Configuration ────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 3000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

function getConfig(): RedisConfig | null {
  if (!isRedisConfigured()) return null;
  return {
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

// ── Circuit Breaker ──────────────────────────────────────────────

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) return false;
  if (Date.now() >= circuitOpenUntil) {
    // Cooldown elapsed — allow one probe request
    consecutiveFailures = CIRCUIT_BREAKER_THRESHOLD - 1;
    return false;
  }
  return true;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

// ── Core HTTP transport ──────────────────────────────────────────

async function redisFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const config = getConfig();
  if (!config) return null;
  if (isCircuitOpen()) return null;

  const url = `${config.url}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      recordFailure();
      return null;
    }

    recordSuccess();
    return response;
  } catch {
    recordFailure();
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Get a string value by key.
 * Returns the value or null if unavailable.
 */
async function get(key: string): Promise<string | null> {
  const response = await redisFetch(`/GET/${encodeURIComponent(key)}`);
  if (!response) return null;

  try {
    const data = await response.json() as { result: string | null };
    return data.result;
  } catch {
    return null;
  }
}

/**
 * Set a string value with optional TTL (seconds).
 * Returns true if successful, false otherwise.
 */
async function set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const commands: PipelineCommand[] = [['SET', key, value]];
  if (ttlSeconds !== undefined && ttlSeconds > 0) {
    commands.push(['EXPIRE', key, String(ttlSeconds)]);
  }
  return pipeline(commands);
}

/**
 * Delete a key.
 * Returns true if successful, false otherwise.
 */
async function del(key: string): Promise<boolean> {
  const response = await redisFetch(`/DEL/${encodeURIComponent(key)}`);
  if (!response) return false;

  try {
    const data = await response.json() as { result: number };
    return data.result > 0;
  } catch {
    return false;
  }
}

/**
 * Atomically increment a key.
 * Returns the new value, or null if unavailable.
 */
async function incr(key: string): Promise<number | null> {
  const response = await redisFetch(`/INCR/${encodeURIComponent(key)}`);
  if (!response) return null;

  try {
    const data = await response.json() as { result: string | number };
    const value = typeof data.result === 'number'
      ? data.result
      : parseInt(String(data.result), 10);
    return isNaN(value) ? null : value;
  } catch {
    return null;
  }
}

/**
 * Set TTL on a key.
 * Returns true if successful, false otherwise.
 */
async function expire(key: string, ttlSeconds: number): Promise<boolean> {
  const response = await redisFetch(`/EXPIRE/${encodeURIComponent(key)}/${ttlSeconds}`);
  if (!response) return false;

  try {
    const data = await response.json() as { result: number };
    return data.result === 1;
  } catch {
    return false;
  }
}

/**
 * Atomically increment a key and set its TTL in one round-trip.
 * Returns the new value, or null if unavailable.
 */
async function incrWithExpire(key: string, ttlSeconds: number): Promise<number | null> {
  const response = await redisFetch('/pipeline', {
    method: 'POST',
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(ttlSeconds)],
    ]),
  });
  if (!response) return null;

  try {
    const results = await response.json() as Array<{ result: string | number }>;
    const incrResult = results[0]?.result;
    const value = typeof incrResult === 'number'
      ? incrResult
      : parseInt(String(incrResult), 10);
    return isNaN(value) ? null : value;
  } catch {
    return null;
  }
}

/**
 * Execute a pipeline of commands in a single round-trip.
 * Returns true if all commands succeeded, false otherwise.
 */
async function pipeline(commands: PipelineCommand[]): Promise<boolean> {
  const response = await redisFetch('/pipeline', {
    method: 'POST',
    body: JSON.stringify(commands),
  });
  if (!response) return false;

  try {
    await response.json();
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a pipeline and return the raw results array.
 * Returns null if the pipeline failed.
 */
async function pipelineResults(
  commands: PipelineCommand[]
): Promise<Array<{ result: string | number }> | null> {
  const response = await redisFetch('/pipeline', {
    method: 'POST',
    body: JSON.stringify(commands),
  });
  if (!response) return null;

  try {
    const results = await response.json() as Array<{ result: string | number }>;
    return results;
  } catch {
    return null;
  }
}

/**
 * Check Redis health. Returns availability and latency.
 */
async function getHealth(): Promise<HealthResult> {
  const config = getConfig();
  if (!config) {
    return { available: false, latencyMs: null, error: 'not configured' };
  }
  if (isCircuitOpen()) {
    return { available: false, latencyMs: null, error: 'circuit breaker open' };
  }

  const start = performance.now();
  const response = await redisFetch('/PING');
  const latencyMs = Math.round(performance.now() - start);

  if (!response) {
    return { available: false, latencyMs, error: 'connection failed' };
  }

  try {
    const data = await response.json() as { result: string };
    if (data.result === 'PONG') {
      return { available: true, latencyMs, error: null };
    }
    return { available: false, latencyMs, error: 'unexpected response' };
  } catch {
    return { available: false, latencyMs, error: 'parse error' };
  }
}

// ── Export singleton ─────────────────────────────────────────────

export const redis = {
  get,
  set,
  del,
  incr,
  expire,
  incrWithExpire,
  pipeline,
  pipelineResults,
  getHealth,
} as const;

export type { RedisConfig, PipelineCommand, HealthResult };
