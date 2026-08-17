/* eslint-disable no-console -- logger IS the output layer */

/**
 * Structured logger for RTR 360.
 *
 * In development: forwards to console for visibility.
 * In production: forwards to console (replace with APM/monitoring integration).
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('Vehicle creation failed', { vehicleId, error });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function formatContext(ctx?: LogContext): string {
  if (!ctx || Object.keys(ctx).length === 0) return '';
  try {
    return ' ' + JSON.stringify(ctx);
  } catch {
    return ' [unserializable context]';
  }
}

export const logger = {
  debug(message: string, ctx?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${message}${formatContext(ctx)}`);
    }
  },

  info(message: string, ctx?: LogContext): void {
    console.info(`[INFO] ${message}${formatContext(ctx)}`);
  },

  warn(message: string, ctx?: LogContext): void {
    console.warn(`[WARN] ${message}${formatContext(ctx)}`);
  },

  error(message: string, ctx?: LogContext): void {
    // Logger IS the output layer for console
    console.error(`[ERROR] ${message}${formatContext(ctx)}`);
  },
};
