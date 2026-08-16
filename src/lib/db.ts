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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
