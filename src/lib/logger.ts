/* eslint-disable no-console -- logger IS the output layer */

/**
 * Structured logger for RTR 360.
 *
 * In development: forwards to console for visibility.
 * In production: forwards to console (replace with APM/monitoring integration).
 *
 * SECURITY level is for authorization failures, tenant violations,
 * suspicious IDOR attempts, authentication abuse, setup abuse, rate-limit abuse.
 *
 * DO NOT log: passwords, tokens, API keys, DATABASE_URL,
 * Authorization headers, cookies, full request bodies, OpenAI/Redis credentials.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('Vehicle creation failed', { vehicleId, requestId });
 *   logger.security('Tenant boundary violation', { userId, targetOrgId, requestId });
 */

// ── Types ────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'security';

interface LogContext {
  [key: string]: unknown;
}

interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  organizationId?: string;
  userId?: string;
  route?: string;
  method?: string;
  event?: string;
  [key: string]: unknown;
}

// ── Sensitive fields to redact from context ───────────────────────

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'setCookie',
  'databaseUrl',
  'upstashRedisRestUrl',
  'upstashRedisRestToken',
  'sentryDsn',
  'openaiApiKey',
  'sessionSecret',
  'connectionString',
]);

function redactContext(ctx: LogContext): LogContext {
  if (!ctx || Object.keys(ctx).length === 0) return ctx;
  const redacted: LogContext = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (SENSITIVE_KEYS.has(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 256) {
      redacted[key] = value.slice(0, 256) + '...[truncated]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

// ── Formatting ────────────────────────────────────────────────────

function buildStructuredLog(
  level: LogLevel,
  message: string,
  ctx?: LogContext
): StructuredLog {
  const base: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (ctx) {
    const safe = redactContext(ctx);
    if (safe.requestId !== undefined) base.requestId = String(safe.requestId);
    if (safe.organizationId !== undefined) base.organizationId = String(safe.organizationId);
    if (safe.userId !== undefined) base.userId = String(safe.userId);
    if (safe.route !== undefined) base.route = String(safe.route);
    if (safe.method !== undefined) base.method = String(safe.method);
    if (safe.event !== undefined) base.event = String(safe.event);
    for (const [key, value] of Object.entries(safe)) {
      if (!(key in base)) {
        base[key] = value;
      }
    }
  }
  return base;
}

function formatOutput(entry: StructuredLog): string {
  const prefix = `[${entry.level.toUpperCase()}] ${entry.message}`;
  // Strip message from structured data to avoid duplication
  const { message: _msg, level: _lvl, timestamp: _ts, ...meta } = entry;
  const metaKeys = Object.keys(meta);
  if (metaKeys.length === 0) return prefix;
  try {
    return `${prefix} ${JSON.stringify(meta)}`;
  } catch {
    return `${prefix} [unserializable context]`;
  }
}

// ── Logger ───────────────────────────────────────────────────────

interface LoggerInstance {
  debug(message: string, ctx?: LogContext): void;
  info(message: string, ctx?: LogContext): void;
  warn(message: string, ctx?: LogContext): void;
  error(message: string, ctx?: LogContext): void;
  security(message: string, ctx?: LogContext): void;
  child(boundCtx: LogContext): LoggerInstance;
}

function createLogger(boundCtx?: LogContext): LoggerInstance {
  return {
    debug(message: string, ctx?: LogContext): void {
      if (process.env.NODE_ENV !== 'production') {
        const entry = buildStructuredLog('debug', message, boundCtx ? { ...boundCtx, ...ctx } : ctx);
        console.debug(formatOutput(entry));
      }
    },

    info(message: string, ctx?: LogContext): void {
      const entry = buildStructuredLog('info', message, boundCtx ? { ...boundCtx, ...ctx } : ctx);
      console.info(formatOutput(entry));
    },

    warn(message: string, ctx?: LogContext): void {
      const entry = buildStructuredLog('warn', message, boundCtx ? { ...boundCtx, ...ctx } : ctx);
      console.warn(formatOutput(entry));
    },

    error(message: string, ctx?: LogContext): void {
      const entry = buildStructuredLog('error', message, boundCtx ? { ...boundCtx, ...ctx } : ctx);
      console.error(formatOutput(entry));
    },

    security(message: string, ctx?: LogContext): void {
      const entry = buildStructuredLog('security', message, boundCtx ? { ...boundCtx, ...ctx } : ctx);
      console.error(formatOutput(entry));
    },

    child(nestedCtx: LogContext): LoggerInstance {
      return createLogger(boundCtx ? { ...boundCtx, ...nestedCtx } : nestedCtx);
    },
  };
}

export const logger = createLogger();

export type { LogLevel, LogContext, StructuredLog };
