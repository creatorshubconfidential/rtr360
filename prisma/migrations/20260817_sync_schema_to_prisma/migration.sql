-- Sync database schema to match Prisma schema (replaces runtime ALTER TABLE in seed-demo)
-- All columns below already exist in the Prisma schema; this migration ensures the DB is aligned.

-- Trip: additional operational fields
DO $$ BEGIN
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
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Device: extended tracking fields
DO $$ BEGIN
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
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Vehicle: extended identification and maintenance tracking
DO $$ BEGIN
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "internal_id" TEXT;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "vin" TEXT;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "color" TEXT;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "engine_hours" DOUBLE PRECISION;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "install_date" TIMESTAMPTZ;
  ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "warranty_expiry" TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Notification: user and org scope
DO $$ BEGIN
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "body" TEXT;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "read" BOOLEAN DEFAULT false;
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "metadata" TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- MaintenanceRecord: trigger-based scheduling
DO $$ BEGIN
  ALTER TABLE "MaintenanceRecord" ADD COLUMN IF NOT EXISTS "trigger_type" TEXT;
  ALTER TABLE "MaintenanceRecord" ADD COLUMN IF NOT EXISTS "triggerValue" REAL;
  ALTER TABLE "MaintenanceRecord" ADD COLUMN IF NOT EXISTS "completed_date" TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Installation: field service verification
DO $$ BEGIN
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
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Indexes for performance and tenant isolation
CREATE INDEX IF NOT EXISTS "Trip_organization_id_idx" ON "Trip"("organization_id");
CREATE INDEX IF NOT EXISTS "Trip_start_time_idx" ON "Trip"("start_time");
CREATE INDEX IF NOT EXISTS "Trip_status_idx" ON "Trip"("status");
CREATE INDEX IF NOT EXISTS "Device_organization_id_idx" ON "Device"("organization_id");
CREATE INDEX IF NOT EXISTS "Device_status_idx" ON "Device"("status");
CREATE INDEX IF NOT EXISTS "Notification_user_id_idx" ON "Notification"("user_id");
CREATE INDEX IF NOT EXISTS "Notification_organization_id_idx" ON "Notification"("organization_id");
