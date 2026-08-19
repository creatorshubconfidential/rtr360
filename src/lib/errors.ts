/**
 * Centralized application error types for RTR 360.
 *
 * Separates expected application errors from unexpected internal errors.
 * Production responses must never leak: stack, SQL, Prisma internals,
 * environment variables, filesystem paths, or secrets.
 */

// ── Error Codes ───────────────────────────────────────────────────

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── HTTP status mapping ───────────────────────────────────────────

const ERROR_STATUS: Record<ErrorCodeType, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VALIDATION]: 400,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
};

// ── Application Error ─────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly requestId?: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.INTERNAL,
    options?: { requestId?: string; statusCode?: number; cause?: Error }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options?.statusCode ?? ERROR_STATUS[code] ?? 500;
    this.requestId = options?.requestId;
    this.isOperational = code !== ErrorCode.INTERNAL;
  }
}

// ── Error factory ─────────────────────────────────────────────────

export function appError(
  message: string,
  code: ErrorCodeType = ErrorCode.INTERNAL,
  options?: { requestId?: string; statusCode?: number; cause?: Error }
): AppError {
  return new AppError(message, code, options);
}

// ── Response builder ───────────────────────────────────────────────

export function errorResponse(
  error: unknown,
  requestId?: string
): { status: number; body: Record<string, unknown> } {
  const isProduction = process.env.NODE_ENV === 'production';
  const effectiveRequestId = requestId ?? (error instanceof AppError ? error.requestId : undefined);

  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        ...(effectiveRequestId ? { requestId: effectiveRequestId } : {}),
        ...(error.statusCode === 429 ? { retryAfter: 60 } : {}),
      },
    };
  }

  const sanitized = sanitizeError(error);
  return {
    status: 500,
    body: {
      error: isProduction ? 'Internal server error' : sanitized.message,
      code: ErrorCode.INTERNAL,
      ...(effectiveRequestId ? { requestId: effectiveRequestId } : {}),
      ...(isProduction ? {} : { details: sanitized.details }),
    },
  };
}

// ── Sanitization ──────────────────────────────────────────────────

const SENSITIVE_RULES: RegExp[] = [
  /password\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /secret\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /token\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /api[_-]?key\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /authorization\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /cookie\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /database[_-]?url\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /redis\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /upstash\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /sentry\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /openai\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /session[_-]?secret\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
  /bearer\s+(\S+)/gi,
  /connection[_-]?string\s*[=:]\s*(?:['"]?)([^'"\s,}]{4,})/gi,
];

function sanitizeError(
  error: unknown
): { message: string; details: string | undefined } {
  if (error instanceof Error) {
    return {
      message: stripSensitive(error.message),
      details: process.env.NODE_ENV === 'production'
        ? undefined
        : stripSensitive(error.stack ?? ''),
    };
  }

  if (typeof error === 'string') {
    return { message: stripSensitive(error), details: undefined };
  }

  return { message: 'Unknown error', details: undefined };
}

/**
 * Remove sensitive values from a string.
 * Replaces values in recognized sensitive key=value pairs.
 */
export function stripSensitive(input: string): string {
  let result = input;
  for (const pattern of SENSITIVE_RULES) {
    result = result.replace(pattern, (fullMatch: string, captured: string) => {
      return fullMatch.replace(captured, '[REDACTED]');
    });
  }
  return result;
}

export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) return error.isOperational;
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    return (
      name === 'notfounderror' ||
      name === 'validationerror' ||
      name === 'prismaclientknownrequesterror'
    );
  }
  return false;
}
