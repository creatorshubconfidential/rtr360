import { PrismaClient, Prisma } from '@prisma/client'

// ────────────────────────────────────────
// Decimal JSON Serialization Patch
// ────────────────────────────────────────
// Prisma Decimal fields are stored with full precision in the database.
// For JSON API responses, we serialize them as numbers so the frontend
// can use them directly without parsing strings.
// Precision is preserved at the DB level; the Number conversion is safe
// for financial values with up to 15 significant digits (Number.MAX_SAFE_INTEGER).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Prisma.Decimal.prototype as any).toJSON = function () {
  return Number(this);
};

// ────────────────────────────────────────
// Database URL Resolution
// ────────────────────────────────────────
// Priority:
//   1. DATABASE_URL (if it's a postgres/postgresql URL)
//   2. POSTGRES_PRISMA_URL (set by Supabase integration on Vercel)
//   3. POSTGRES_URL_NON_POOLING (direct connection, no PgBouncer)
//   4. POSTGRES_URL (pooled connection, fallback)
//
// For local dev: set DATABASE_URL in .env to your Supabase Postgres URL.
// For Vercel: POSTGRES_PRISMA_URL is auto-set by the Supabase integration.
function resolveDatabaseUrl(): string {
  // 1. Explicit DATABASE_URL — use if it's a PostgreSQL URL
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    return databaseUrl;
  }

  // 2. Supabase Vercel integration sets this (direct connection, Prisma-compatible)
  const prismaUrl = process.env.POSTGRES_PRISMA_URL;
  if (prismaUrl) {
    return prismaUrl;
  }

  // 3. Non-pooling URL (direct connection)
  const nonPoolingUrl = process.env.POSTGRES_URL_NON_POOLING;
  if (nonPoolingUrl) {
    return nonPoolingUrl;
  }

  // 4. Pooled URL (last resort — may have issues with Prisma)
  const poolUrl = process.env.POSTGRES_URL;
  if (poolUrl) {
    return poolUrl;
  }

  // No valid PostgreSQL URL found
  throw new Error(
    'No PostgreSQL DATABASE_URL found. ' +
    'Set DATABASE_URL or POSTGRES_PRISMA_URL in your environment. ' +
    'If using Supabase, connect the integration on Vercel or copy the connection string to .env.'
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolveDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === 'production' ? [] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
