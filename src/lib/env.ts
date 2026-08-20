/**
 * Centralized environment variable validation for RTR 360.
 *
 * Separates REQUIRED from OPTIONAL variables.
 * Validates relationships (e.g. Redis URL requires token).
 * Never prints secret values.
 * Distinguishes development / test / production environments.
 */

// ── Types ────────────────────────────────────────────────────────

interface EnvStatus {
  valid: boolean;
  environment: string;
  required: Record<string, { present: boolean }>;
  optional: Record<string, { present: boolean }>;
  errors: string[];
}

interface EnvConfig {
  environment: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  databaseUrl: string;
  setupInitKey: string;
  redisUrl: string;
  redisToken: string;
  sentryDsn: string;
  openaiApiKey: string;
  sessionSecret: string;
  emailProvider: string;
  emailSmtpHost: string;
  emailSmtpPort: string;
  emailSmtpUser: string;
  emailSmtpPass: string;
  emailFromAddress: string;
  emailFromName: string;
}

// ── Internal ──────────────────────────────────────────────────────

const NODE_ENV = process.env.NODE_ENV ?? 'development';

function isProduction(): boolean {
  return NODE_ENV === 'production';
}

function isTest(): boolean {
  return NODE_ENV === 'test';
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(value: string | undefined): string {
  return value ?? '';
}

function redact(value: string): string {
  if (value.length === 0) return '[not set]';
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

// ── Validation ────────────────────────────────────────────────────

function validateEnv(): EnvStatus {
  const errors: string[] = [];
  const requiredVars: Record<string, { present: boolean }> = {};
  const optionalVars: Record<string, { present: boolean }> = {};

  // REQUIRED in production, relaxed in dev/test
  const checkRequired = (name: string, value: string | undefined) => {
    const present = Boolean(value);
    requiredVars[name] = { present };
    if (!present && isProduction()) {
      errors.push(`${name} is required in production`);
    }
  };

  // OPTIONAL
  const checkOptional = (name: string, value: string | undefined) => {
    optionalVars[name] = { present: Boolean(value) };
  };

  checkRequired('DATABASE_URL', process.env.DATABASE_URL);
  checkRequired('SETUP_INIT_KEY', process.env.SETUP_INIT_KEY);
  checkOptional('UPSTASH_REDIS_REST_URL', process.env.UPSTASH_REDIS_REST_URL);
  checkOptional('UPSTASH_REDIS_REST_TOKEN', process.env.UPSTASH_REDIS_REST_TOKEN);
  checkOptional('SENTRY_DSN', process.env.SENTRY_DSN);
  checkOptional('OPENAI_API_KEY', process.env.OPENAI_API_KEY);
  checkOptional('SESSION_SECRET', process.env.SESSION_SECRET);
  checkOptional('EMAIL_PROVIDER', process.env.EMAIL_PROVIDER);
  checkOptional('EMAIL_SMTP_HOST', process.env.EMAIL_SMTP_HOST);
  checkOptional('EMAIL_SMTP_PORT', process.env.EMAIL_SMTP_PORT);
  checkOptional('EMAIL_SMTP_USER', process.env.EMAIL_SMTP_USER);
  checkOptional('EMAIL_SMTP_PASS', process.env.EMAIL_SMTP_PASS);
  checkOptional('EMAIL_FROM_ADDRESS', process.env.EMAIL_FROM_ADDRESS);
  checkOptional('EMAIL_FROM_NAME', process.env.EMAIL_FROM_NAME);

  // Relationship validation: Redis URL requires token
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && !redisToken) {
    errors.push('UPSTASH_REDIS_REST_URL is set but UPSTASH_REDIS_REST_TOKEN is missing');
  }
  if (!redisUrl && redisToken) {
    errors.push('UPSTASH_REDIS_REST_TOKEN is set but UPSTASH_REDIS_REST_URL is missing');
  }

  return {
    valid: errors.length === 0 || !isProduction(),
    environment: NODE_ENV,
    required: requiredVars,
    optional: optionalVars,
    errors,
  };
}

function getEnvStatus(): EnvStatus {
  return validateEnv();
}

function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

// ── Frozen config object ─────────────────────────────────────────

function buildConfig(): EnvConfig {
  return Object.freeze({
    environment: NODE_ENV,
    isProduction: isProduction(),
    isDevelopment: !isProduction() && !isTest(),
    isTest: isTest(),
    databaseUrl: optional(process.env.DATABASE_URL),
    setupInitKey: optional(process.env.SETUP_INIT_KEY),
    redisUrl: optional(process.env.UPSTASH_REDIS_REST_URL),
    redisToken: optional(process.env.UPSTASH_REDIS_REST_TOKEN),
    sentryDsn: optional(process.env.SENTRY_DSN),
    openaiApiKey: optional(process.env.OPENAI_API_KEY),
    sessionSecret: optional(process.env.SESSION_SECRET),
    emailProvider: optional(process.env.EMAIL_PROVIDER),
    emailSmtpHost: optional(process.env.EMAIL_SMTP_HOST),
    emailSmtpPort: optional(process.env.EMAIL_SMTP_PORT),
    emailSmtpUser: optional(process.env.EMAIL_SMTP_USER),
    emailSmtpPass: optional(process.env.EMAIL_SMTP_PASS),
    emailFromAddress: optional(process.env.EMAIL_FROM_ADDRESS),
    emailFromName: optional(process.env.EMAIL_FROM_NAME),
  });
}

export const env = buildConfig();

export { validateEnv, getEnvStatus, isRedisConfigured, isProduction, isTest };
export type { EnvConfig, EnvStatus };
