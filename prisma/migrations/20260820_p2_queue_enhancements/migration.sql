-- P2-2 Queue Engine: Enhance BackgroundJob for durable queue operations
--
-- Changes:
--   1. Add leased_until column for lease-based stale job recovery
--   2. Replace global idempotency UNIQUE with tenant-scoped composite UNIQUE
--   3. Update organization FK to ON DELETE CASCADE
--   4. Replace indexes with queue-optimized versions

-- 1. Add leased_until column
ALTER TABLE "BackgroundJob" ADD COLUMN "leased_until" TIMESTAMP(3);

-- 2. Drop global idempotency unique constraint
--    PostgreSQL names it automatically based on column name
ALTER TABLE "BackgroundJob" DROP CONSTRAINT IF EXISTS "BackgroundJob_idempotency_key_key";

-- 3. Add tenant-scoped idempotency constraint
--    Same org + same key = duplicate. NULL org is a distinct group.
CREATE UNIQUE INDEX "BackgroundJob_organization_id_idempotency_key_key" ON "BackgroundJob"("organization_id", "idempotency_key");

-- 4. Update organization FK to CASCADE
ALTER TABLE "BackgroundJob" DROP CONSTRAINT IF EXISTS "BackgroundJob_organization_id_fkey";
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Drop old indexes and create queue-optimized ones
DROP INDEX IF EXISTS "BackgroundJob_type_status_idx";
DROP INDEX IF EXISTS "BackgroundJob_status_priority_run_at_idx";
DROP INDEX IF EXISTS "BackgroundJob_organization_id_idx";
DROP INDEX IF EXISTS "BackgroundJob_created_at_idx";

-- Queue polling: claim ready jobs ordered by priority ASC then runAt ASC
CREATE INDEX "BackgroundJob_status_priority_run_at_idx" ON "BackgroundJob"("status", "priority", "run_at");

-- Tenant isolation: scope reads by organization + status
CREATE INDEX "BackgroundJob_organization_id_status_idx" ON "BackgroundJob"("organization_id", "status");

-- Scheduled jobs: find jobs whose runAt has passed
CREATE INDEX "BackgroundJob_status_run_at_idx" ON "BackgroundJob"("status", "run_at");

-- Stale lease recovery: find PROCESSING jobs with expired leases
CREATE INDEX "BackgroundJob_status_leased_until_idx" ON "BackgroundJob"("status", "leased_until");
