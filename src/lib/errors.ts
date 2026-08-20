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
  QUEUE_ERROR: 'QUEUE_ERROR',
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
  [ErrorCode.QUEUE_ERROR]: 500,
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

// ── Queue-Specific Errors ────────────────────────────────────────

export class ValidationError extends AppError {
  public readonly details: ReadonlyArray<{ field: string; message: string }>;

  constructor(
    message: string,
    details: ReadonlyArray<{ field: string; message: string }>,
  ) {
    super(message, ErrorCode.VALIDATION);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, ErrorCode.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, ErrorCode.FORBIDDEN);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, ErrorCode.CONFLICT);
    this.name = 'ConflictError';
  }
}

export class QueueError extends AppError {
  constructor(message: string, code: ErrorCodeType = ErrorCode.QUEUE_ERROR) {
    super(message, code);
    this.name = 'QueueError';
  }
}

// ── Object Redaction (for logging) ───────────────────────────────

const SECRET_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /api[_-]?key/i,
  /database[_-]?url/i,
  /redis/i,
  /dsn/i,
  /cookie/i,
  /smtp[_-]?pass/i,
  /email[_-]?pass/i,
];

/**
 * Redact known secret patterns from an object before logging.
 * Returns a shallow clone with matching keys replaced by '[REDACTED]'.
 */
export function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactSecrets(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Serialize an error to a safe, JSON-serializable object.
 * Never exposes stack traces in production.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    };
  }
  return {
    name: 'UnknownError',
    message: String(error),
  };
}
