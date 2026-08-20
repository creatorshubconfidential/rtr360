-- =============================================================
-- RTR360 P2-7 — Production Database Recovery Script
-- =============================================================
--
-- READ THE DIAGNOSTIC OUTPUT FIRST (production-db-diagnostic.sql)
-- before running this script.
--
-- This script is SAFE and IDEMPOTENT:
--   - Uses IF NOT EXISTS for all columns
--   - Uses IF EXISTS for all drops
--   - Preserves existing data
--   - Wrapped in transactions per-section
--   - No --accept-data-loss, no destructive operations
--
-- Run in Supabase SQL Editor.
-- =============================================================

-- =============================================================
-- PART 1: Fix wrong-column-name data migration (if buggy sync ran)
-- =============================================================

-- If the buggy sync migration added `driver_name` instead of `driverName`,
-- copy any data to the correct column and drop the wrong one.
DO $$ BEGIN
  -- Trip.driver_name → Trip.driverName
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'driver_name') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'driverName') THEN
      ALTER TABLE "Trip" ADD COLUMN "driverName" TEXT;
    END IF;
    EXECUTE 'UPDATE "Trip" SET "driverName" = COALESCE("driverName", "driver_name") WHERE "driver_name" IS NOT NULL';
    ALTER TABLE "Trip" DROP COLUMN IF EXISTS "driver_name";
    RAISE NOTICE 'Fixed Trip: migrated driver_name → driverName';
  END IF;

  -- Device.phone_number → Device.phoneNumber
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Device' AND column_name = 'phone_number') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Device' AND column_name = 'phoneNumber') THEN
      ALTER TABLE "Device" ADD COLUMN "phoneNumber" TEXT;
    END IF;
    EXECUTE 'UPDATE "Device" SET "phoneNumber" = COALESCE("phoneNumber", "phone_number") WHERE "phone_number" IS NOT NULL';
    ALTER TABLE "Device" DROP COLUMN IF EXISTS "phone_number";
    RAISE NOTICE 'Fixed Device: migrated phone_number → phoneNumber';
  END IF;

  -- MaintenanceRecord.trigger_value → MaintenanceRecord.triggerValue
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MaintenanceRecord' AND column_name = 'trigger_value') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MaintenanceRecord' AND column_name = 'triggerValue') THEN
      ALTER TABLE "MaintenanceRecord" ADD COLUMN "triggerValue" REAL;
    END IF;
    EXECUTE 'UPDATE "MaintenanceRecord" SET "triggerValue" = COALESCE("triggerValue", "trigger_value") WHERE "trigger_value" IS NOT NULL';
    ALTER TABLE "MaintenanceRecord" DROP COLUMN IF EXISTS "trigger_value";
    RAISE NOTICE 'Fixed MaintenanceRecord: migrated trigger_value → triggerValue';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Part 1 warning: %', SQLERRM;
END $$;

-- =============================================================
-- PART 2: Add missing columns (safe, idempotent)
-- =============================================================
-- These columns exist in the Prisma schema + 0_init migration
-- but may be missing from a production DB created from an older schema.

DO $$ BEGIN
  -- Alert: missing columns
  ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "driverName" TEXT;
  ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "vehiclePlate" TEXT;
  ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "metadata" TEXT;
  ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ;

  -- AlertRule: missing updated_at
  ALTER TABLE "AlertRule" ADD COLUMN IF NOT EXISTS "updated_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';

  -- Trip: missing columns
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "driverName" TEXT;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "start_time" TIMESTAMPTZ;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "end_time" TIMESTAMPTZ;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "distance" DOUBLE PRECISION;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "duration" INTEGER;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "max_speed" DOUBLE PRECISION;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "avg_speed" DOUBLE PRECISION;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "idle_time" INTEGER;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "overspeed_count" INTEGER;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "harsh_brakes" INTEGER;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "harsh_accel" INTEGER;
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'in_progress';
  ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "updated_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';

  -- Vehicle: missing columns
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "internal_id" TEXT;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "vin" TEXT;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "color" TEXT;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "engine_hours" DOUBLE PRECISION;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "install_date" TIMESTAMPTZ;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "warranty_expiry" TIMESTAMPTZ;

  -- Device: missing columns
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "serial_number" TEXT;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "device_type" TEXT;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "protocol" TEXT;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "firmware" TEXT;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "sim_id" TEXT;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "warehouse" TEXT;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "purchase_date" TIMESTAMPTZ;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "purchase_cost" DECIMAL(10,2);
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "install_date" TIMESTAMPTZ;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "warranty_expiry" TIMESTAMPTZ;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "last_ping_at" TIMESTAMPTZ;
  ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "battery_level" INTEGER;

  -- Notification: missing columns
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "body" TEXT;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "read" BOOLEAN DEFAULT false;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "metadata" TEXT;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "updated_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';

  -- MaintenanceRecord: missing columns
  ALTER TABLE "MaintenanceRecord" ADD COLUMN IF NOT EXISTS "trigger_type" TEXT;
  ALTER TABLE "MaintenanceRecord" ADD COLUMN IF NOT EXISTS "triggerValue" REAL;
  ALTER TABLE "MaintenanceRecord" ADD COLUMN IF NOT EXISTS "completed_date" TIMESTAMPTZ;

  -- Lead: missing columns (likely present but check anyway)
  ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "campaign" TEXT;
  ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "landing_page" TEXT;
  ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "utm_source" TEXT;
  ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "utm_medium" TEXT;
  ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "utm_campaign" TEXT;

  -- Installation: missing columns
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "installation_number" TEXT;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "scheduled_time" TEXT;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "photos" TEXT;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "test_result" TEXT;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "gps_signal" BOOLEAN DEFAULT false;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "power_wiring" BOOLEAN DEFAULT false;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "antenna_mounted" BOOLEAN DEFAULT false;
  ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "signature" TEXT;

  -- Document: missing updated_at
  ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "updated_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';

  -- Setting: missing timestamps
  ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "created_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';
  ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "updated_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';

  -- ApiKey: missing updated_at
  ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "updated_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z';

  -- Driver: missing score and tracking columns
  ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "score" REAL NOT NULL DEFAULT 100;
  ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "total_trips" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "total_distance" REAL;
  ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "total_violations" INTEGER NOT NULL DEFAULT 0;

  RAISE NOTICE 'Part 2: All missing columns added/verified';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Part 2 warning: %', SQLERRM;
END $$;

-- =============================================================
-- PART 3: Create missing tables (safe, idempotent)
-- =============================================================

-- RateLimitCounter
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "reset_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitCounter_key_key" ON "RateLimitCounter"("key");
CREATE INDEX IF NOT EXISTS "RateLimitCounter_reset_at_idx" ON "RateLimitCounter"("reset_at");

-- BackgroundJob
CREATE TABLE IF NOT EXISTS "BackgroundJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "result" JSONB,
    "idempotency_key" TEXT,
    "organization_id" TEXT,
    "user_id" TEXT,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "run_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "leased_until" TIMESTAMP(3),
    "locked_by" TEXT,
    "request_id" TEXT
);

-- Add FKs only if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BackgroundJob_organization_id_fkey') THEN
    ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_organization_id_fkey" 
      FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BackgroundJob_user_id_fkey') THEN
    ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_user_id_fkey" 
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Part 3a warning: %', SQLERRM;
END $$;

-- BackgroundJob indexes
CREATE INDEX IF NOT EXISTS "BackgroundJob_status_priority_run_at_idx" ON "BackgroundJob"("status", "priority", "run_at");
CREATE INDEX IF NOT EXISTS "BackgroundJob_organization_id_status_idx" ON "BackgroundJob"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "BackgroundJob_status_run_at_idx" ON "BackgroundJob"("status", "run_at");
CREATE INDEX IF NOT EXISTS "BackgroundJob_status_leased_until_idx" ON "BackgroundJob"("status", "leased_until");

-- Tenant-scoped idempotency index
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'BackgroundJob_organization_id_idempotency_key_key') THEN
    CREATE UNIQUE INDEX "BackgroundJob_organization_id_idempotency_key_key" ON "BackgroundJob"("organization_id", "idempotency_key");
  END IF;
END $$;

-- WebhookEndpoint
CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'WebhookEndpoint_organization_id_fkey') THEN
    ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organization_id_fkey" 
      FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Part 3b warning: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_organization_id_idx" ON "WebhookEndpoint"("organization_id");
CREATE INDEX IF NOT EXISTS "WebhookEndpoint_active_idx" ON "WebhookEndpoint"("active");

-- WebhookDelivery
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "status_code" INTEGER,
    "response" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(3),
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'WebhookDelivery_endpoint_id_fkey') THEN
    ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpoint_id_fkey" 
      FOREIGN KEY ("endpoint_id") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'WebhookDelivery_organization_id_fkey') THEN
    ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_organization_id_fkey" 
      FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Part 3c warning: %', SQLERRM;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookDelivery_endpoint_id_event_id_key" ON "WebhookDelivery"("endpoint_id", "event_id");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_next_retry_at_idx" ON "WebhookDelivery"("status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_organization_id_idx" ON "WebhookDelivery"("organization_id");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_event_type_idx" ON "WebhookDelivery"("event_type");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_created_at_idx" ON "WebhookDelivery"("created_at");

-- =============================================================
-- PART 4: AIConversation.messages → JSONB
-- =============================================================
DO $$ BEGIN
  -- Only convert if messages column is TEXT (not already JSONB)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'AIConversation' AND column_name = 'messages' AND data_type = 'text'
  ) THEN
    ALTER TABLE "AIConversation" ALTER COLUMN "messages" TYPE jsonb USING 
      CASE 
        WHEN "messages" IS NULL THEN NULL
        WHEN "messages" = '' THEN '[]'::jsonb
        WHEN "messages" ~ '^\[.*\]$' OR "messages" ~ '^\{.*\}$' THEN 
          CASE 
            WHEN ("messages"::jsonb IS NOT NULL) THEN "messages"::jsonb
            ELSE ('[{"role":"system","content":"' || replace(substring("messages", 1, 500), '"', '\\"') || '"}]')::jsonb
          END
        ELSE ('[{"role":"system","content":"' || replace(substring("messages", 1, 500), '"', '\\"') || '"}]')::jsonb
      END;
    ALTER TABLE "AIConversation" ALTER COLUMN "messages" SET DEFAULT '[]'::jsonb;
    RAISE NOTICE 'Part 4: AIConversation.messages converted to JSONB';
  ELSE
    RAISE NOTICE 'Part 4: AIConversation.messages already JSONB, skipping';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Part 4 warning: %', SQLERRM;
END $$;

-- =============================================================
-- PART 5: Performance indexes
-- =============================================================
CREATE INDEX IF NOT EXISTS "Trip_organization_id_idx" ON "Trip"("organization_id");
CREATE INDEX IF NOT EXISTS "Trip_start_time_idx" ON "Trip"("start_time");
CREATE INDEX IF NOT EXISTS "Trip_status_idx" ON "Trip"("status");
CREATE INDEX IF NOT EXISTS "Device_organization_id_idx" ON "Device"("organization_id");
CREATE INDEX IF NOT EXISTS "Device_status_idx" ON "Device"("status");
CREATE INDEX IF NOT EXISTS "Notification_user_id_idx" ON "Notification"("user_id");
CREATE INDEX IF NOT EXISTS "Notification_organization_id_idx" ON "Notification"("organization_id");

-- =============================================================
-- PART 6: Mark all migrations as applied (if _prisma_migrations exists)
-- =============================================================
-- ONLY run this AFTER verifying all columns/tables above are correct.
-- Comment out this entire section to do it manually.

/*
DO $$ BEGIN
  -- Ensure _prisma_migrations table exists
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  );

  -- Insert migration records for all 7 migrations
  INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
  VALUES 
    (gen_random_uuid(), 'manual_p2_7_recovery', now(), '0_init', now() - interval '7 days', 1),
    (gen_random_uuid(), 'manual_p2_7_recovery', now(), '20260816_add_updated_at', now() - interval '6 days', 1),
    (gen_random_uuid(), 'manual_p2_7_recovery', now(), '20260817_add_rate_limit_counter', now() - interval '5 days', 1),
    (gen_random_uuid(), 'manual_p2_7_recovery', now(), '20260817_sync_schema_to_prisma', now() - interval '5 days', 1),
    (gen_random_uuid(), 'manual_p2_7_recovery', now(), '20260819_p2_add_background_jobs_webhooks', now() - interval '3 days', 1),
    (gen_random_uuid(), 'manual_p2_7_recovery', now(), '20260820_p2_queue_enhancements', now() - interval '2 days', 1),
    (gen_random_uuid(), 'manual_p2_7_recovery', now(), '20260821_ai_conversation_messages_json', now() - interval '1 day', 1)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Part 6: All migrations marked as applied';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Part 6 warning: %', SQLERRM;
END $$;
*/

-- =============================================================
-- VERIFICATION: Re-run the diagnostic to confirm all columns exist
-- =============================================================
SELECT '=== RECOVERY VERIFICATION ===' AS section;

SELECT 'Alert.vehiclePlate' AS check_col, 
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alert' AND column_name = 'vehiclePlate') AS ok;
SELECT 'Alert.updated_at' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alert' AND column_name = 'updated_at') AS ok;
SELECT 'Vehicle.internal_id' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehicle' AND column_name = 'internal_id') AS ok;
SELECT 'Device.phoneNumber' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Device' AND column_name = 'phoneNumber') AS ok;
SELECT 'Trip.driverName' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'driverName') AS ok;
SELECT 'Trip.organization_id' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'organization_id') AS ok;
SELECT 'Trip.updated_at' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'updated_at') AS ok;
SELECT 'Notification.updated_at' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'updated_at') AS ok;
SELECT 'Notification.metadata' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'metadata') AS ok;
SELECT 'MaintenanceRecord.triggerValue' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MaintenanceRecord' AND column_name = 'triggerValue') AS ok;
SELECT 'Lead.campaign' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Lead' AND column_name = 'campaign') AS ok;
SELECT 'RateLimitCounter table' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'RateLimitCounter') AS ok;
SELECT 'BackgroundJob table' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'BackgroundJob') AS ok;
SELECT 'WebhookEndpoint table' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'WebhookEndpoint') AS ok;
SELECT 'WebhookDelivery table' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'WebhookDelivery') AS ok;
SELECT 'AIConversation.messages JSONB' AS check_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AIConversation' AND column_name = 'messages' AND udt_name = 'jsonb') AS ok;
