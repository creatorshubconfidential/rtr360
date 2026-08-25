-- P2-15: Schema Reconciliation
-- ============================================================
-- Resolves P2022 runtime errors caused by Prisma column name mismatch.
--
-- ROOT CAUSE: The production database (Supabase) was created with
-- snake_case column names. The Prisma schema had several camelCase
-- fields without @map(), causing Prisma to query non-existent columns.
--
-- STRATEGY:
--   - Prisma schema now has @map() for all affected fields
--   - This migration handles the DB side: rename camelCase → snake_case
--     on databases created by Prisma migrations (0_init, sync).
--   - On production (Supabase, already snake_case), these are no-ops.
--   - Also adds Notification.updated_at which is missing from production.
--
-- SAFETY:
--   - All renames use DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN NULL;
--   - Notification.updated_at uses ADD COLUMN IF NOT EXISTS
--   - No DROP, no data loss, no destructive operations
-- ============================================================

-- 1. Alert: driverName → driver_name
DO $$ BEGIN
  ALTER TABLE "Alert" RENAME COLUMN "driverName" TO "driver_name";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Alert: vehiclePlate → vehicle_plate
DO $$ BEGIN
  ALTER TABLE "Alert" RENAME COLUMN "vehiclePlate" TO "vehicle_plate";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. MaintenanceRecord: triggerValue → trigger_value
DO $$ BEGIN
  ALTER TABLE "MaintenanceRecord" RENAME COLUMN "triggerValue" TO "trigger_value";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Trip: driverName → driver_name
DO $$ BEGIN
  ALTER TABLE "Trip" RENAME COLUMN "driverName" TO "driver_name";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Device: phoneNumber → phone_number
DO $$ BEGIN
  ALTER TABLE "Device" RENAME COLUMN "phoneNumber" TO "phone_number";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Ticket: vehiclePlate → vehicle_plate
DO $$ BEGIN
  ALTER TABLE "Ticket" RENAME COLUMN "vehiclePlate" TO "vehicle_plate";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. Document: uploadedBy → uploaded_by
--    Also rename the FK constraint to match the new column name
DO $$ BEGIN
  ALTER TABLE "Document" RENAME COLUMN "uploadedBy" TO "uploaded_by";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Document" RENAME CONSTRAINT "Document_uploadedBy_fkey" TO "Document_uploaded_by_fkey";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. Notification: add updated_at (missing from production)
DO $$ BEGIN
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 9. Update the 20260817_sync migration's camelCase ADD COLUMN to snake_case
--    (in case sync migration was applied with camelCase columns)
DO $$ BEGIN
  ALTER TABLE "Trip" RENAME COLUMN "driverName" TO "driver_name";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Device" RENAME COLUMN "phoneNumber" TO "phone_number";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "MaintenanceRecord" RENAME COLUMN "triggerValue" TO "trigger_value";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
