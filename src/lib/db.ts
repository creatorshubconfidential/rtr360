import { PrismaClient, Prisma } from '@prisma/client'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

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
// Database Path Resolution
// ────────────────────────────────────────
// Local dev: uses .env DATABASE_URL (file:./db/custom.db)
// Vercel/production: uses /tmp (writable ephemeral filesystem)
function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL;

  // If DATABASE_URL is a PostgreSQL/MySQL URL, use it as-is
  if (envUrl && (envUrl.startsWith('postgres://') || envUrl.startsWith('postgresql://') || envUrl.startsWith('mysql://'))) {
    return envUrl;
  }

  // For SQLite: ensure the directory is writable
  // On Vercel, only /tmp is writable
  const isVercel = !!process.env.VERCEL;
  const dbPath = isVercel
    ? '/tmp/rtr360.db'
    : path.join(process.cwd(), 'db', 'custom.db');

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return `file:${dbPath}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

/**
 * Ensure database schema is pushed (tables exist).
 * Runs once per process lifetime.
 */
function ensureSchema(): void {
  if (globalForPrisma.dbInitialized) return;
  globalForPrisma.dbInitialized = true;

  try {
    // Only auto-push for SQLite (safe for dev/demo)
    const url = resolveDatabaseUrl();
    if (url.startsWith('file:')) {
      execSync('npx prisma db push --skip-generate --accept-data-loss 2>&1', {
        stdio: 'pipe',
        timeout: 30000,
        cwd: path.join(__dirname, '../../'),
      });
    }
  } catch (_e) {
    // Schema push failed — tables may already exist or DB is locked
    // Non-fatal: the app will show a 500 on first request if tables are truly missing
  }
}

ensureSchema();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolveDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === 'production' ? [] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
