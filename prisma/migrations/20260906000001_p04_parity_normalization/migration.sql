-- ============================================================
-- P0-④ MIGRATION PARITY NORMALIZATION
-- ============================================================
-- Drift source: 20260816_add_updated_at added NOT NULL timestamp
-- columns with a sentinel DEFAULT '2026-01-01T00:00:00.000Z'.
-- The Prisma schema declares:
--   * updated_at  as @updatedAt        → NO SQL default (app-managed)
--   * Setting.created_at as @default(now()) → DEFAULT CURRENT_TIMESTAMP
-- A sentinel default is actively harmful: any INSERT that forgets to
-- set updatedAt would silently receive 2026-01-01, corrupting
-- "recently updated" queries and audit semantics.
--
-- Safety: metadata-only (no data read/write; rows keep their values;
-- the application always supplies these values via Prisma).
-- Idempotent: DROP/SET DEFAULT succeed whether or not a default exists.
-- ============================================================

-- 1. Drop sentinel defaults from app-managed @updatedAt columns
ALTER TABLE "AlertRule"    ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "Alert"        ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "Trip"         ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "Document"     ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "Notification" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "Setting"      ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "ApiKey"       ALTER COLUMN "updated_at" DROP DEFAULT;

-- 2. Align Setting.created_at with @default(now())
ALTER TABLE "Setting"      ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
