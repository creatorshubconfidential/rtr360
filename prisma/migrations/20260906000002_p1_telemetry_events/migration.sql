-- ============================================================
-- P1 — REAL TELEMETRY: TelemetryEvent table + Device position cache
-- ============================================================
-- Additive & idempotent. No destructive statements.
--   * TelemetryEvent: one row per device position report. Unique
--     (device_id, device_time) gives idempotency / replay protection.
--   * Device.new columns: SHA-256 device key hash (ingestion credential,
--     raw never stored) + cached latest position for fast realtime reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS "TelemetryEvent" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "organization_id" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "speed" REAL,
    "heading" REAL,
    "device_time" TIMESTAMP(3) NOT NULL,
    "server_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelemetryEvent_device_id_device_time_key"
  ON "TelemetryEvent"("device_id", "device_time");

CREATE INDEX IF NOT EXISTS "TelemetryEvent_vehicle_id_device_time_idx"
  ON "TelemetryEvent"("vehicle_id", "device_time");

CREATE INDEX IF NOT EXISTS "TelemetryEvent_organization_id_device_time_idx"
  ON "TelemetryEvent"("organization_id", "device_time");

CREATE INDEX IF NOT EXISTS "TelemetryEvent_device_time_idx"
  ON "TelemetryEvent"("device_time");

DO $$ BEGIN
  ALTER TABLE "TelemetryEvent"
    ADD CONSTRAINT "TelemetryEvent_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "Device"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TelemetryEvent"
    ADD CONSTRAINT "TelemetryEvent_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TelemetryEvent"
    ADD CONSTRAINT "TelemetryEvent_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Device: credential hash + latest-position cache
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "device_key_hash" TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "last_lat" REAL;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "last_lng" REAL;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "last_speed" REAL;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "last_heading" REAL;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "last_device_time" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Device_device_key_hash_key" ON "Device"("device_key_hash");
