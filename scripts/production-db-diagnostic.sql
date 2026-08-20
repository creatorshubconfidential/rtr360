-- =============================================================
-- RTR360 P2-7 — Production Database Diagnostic Script
-- =============================================================
--
-- RUN THIS FIRST against your Supabase production database.
-- This script is READ-ONLY — it only queries, never modifies.
--
-- Usage: Connect to Supabase SQL Editor → paste → run
--
-- =============================================================

-- 1. Check if _prisma_migrations table exists
SELECT '=== PRISMA MIGRATIONS TABLE ===' AS section;
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
) AS prisma_migrations_table_exists;

-- 2. If it exists, show applied migrations
SELECT '=== APPLIED MIGRATIONS ===' AS section;
SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations
ORDER BY started_at;

-- 3. Check for missing tables (expected by Prisma schema)
SELECT '=== MISSING TABLES ===' AS section;
SELECT table_name
FROM (VALUES 
  ('Organization'), ('Branch'), ('User'), ('AuditLog'), ('Lead'), ('Contact'),
  ('Opportunity'), ('Activity'), ('Vehicle'), ('Driver'), ('Device'), ('SIM'),
  ('Technician'), ('Installation'), ('Trip'), ('Geofence'), ('AlertRule'),
  ('Alert'), ('MaintenanceRecord'), ('Plan'), ('Subscription'), ('Invoice'),
  ('Quotation'), ('QuotationItem'), ('Ticket'), ('Contract'), ('Document'),
  ('Notification'), ('Session'), ('Setting'), ('ApiKey'), ('AIConversation'),
  ('RateLimitCounter'), ('BackgroundJob'), ('WebhookEndpoint'), ('WebhookDelivery')
) AS expected(table_name)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = expected.table_name
);

-- 4. Check for missing columns that cause P2022 errors
SELECT '=== MISSING COLUMNS (P2022 CAUSES) ===' AS section;

SELECT 'Alert.updated_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alert' AND column_name = 'updated_at') AS exists_now;

SELECT 'Alert.vehiclePlate' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alert' AND column_name = 'vehiclePlate') AS exists_now;

SELECT 'Alert.driverName' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alert' AND column_name = 'driverName') AS exists_now;

SELECT 'AlertRule.updated_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AlertRule' AND column_name = 'updated_at') AS exists_now;

SELECT 'Vehicle.internal_id' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehicle' AND column_name = 'internal_id') AS exists_now;

SELECT 'Device.phoneNumber' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Device' AND column_name = 'phoneNumber') AS exists_now;

SELECT 'Trip.driverName' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'driverName') AS exists_now;

SELECT 'Trip.organization_id' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'organization_id') AS exists_now;

SELECT 'Trip.updated_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'updated_at') AS exists_now;

SELECT 'Lead.campaign' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Lead' AND column_name = 'campaign') AS exists_now;

SELECT 'Notification.updated_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'updated_at') AS exists_now;

SELECT 'Notification.user_id' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'user_id') AS exists_now;

SELECT 'Notification.organization_id' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'organization_id') AS exists_now;

SELECT 'Notification.body' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'body') AS exists_now;

SELECT 'Notification.metadata' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'metadata') AS exists_now;

SELECT 'MaintenanceRecord.triggerValue' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MaintenanceRecord' AND column_name = 'triggerValue') AS exists_now;

SELECT 'MaintenanceRecord.trigger_type' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MaintenanceRecord' AND column_name = 'trigger_type') AS exists_now;

SELECT 'MaintenanceRecord.completed_date' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MaintenanceRecord' AND column_name = 'completed_date') AS exists_now;

SELECT 'Document.updated_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Document' AND column_name = 'updated_at') AS exists_now;

SELECT 'Setting.created_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Setting' AND column_name = 'created_at') AS exists_now;

SELECT 'Setting.updated_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Setting' AND column_name = 'updated_at') AS exists_now;

SELECT 'ApiKey.updated_at' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ApiKey' AND column_name = 'updated_at') AS exists_now;

-- 5. Check for WRONG columns (added by buggy sync migration)
SELECT '=== WRONG COLUMNS (FROM BUGGY SYNC MIGRATION) ===' AS section;
SELECT 'Trip.driver_name (WRONG — should be driverName)' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'driver_name') AS exists_now;

SELECT 'Device.phone_number (WRONG — should be phoneNumber)' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Device' AND column_name = 'phone_number') AS exists_now;

SELECT 'MaintenanceRecord.trigger_value (WRONG — should be triggerValue)' AS column_check,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MaintenanceRecord' AND column_name = 'trigger_value') AS exists_now;

-- 6. Check BackgroundJob columns (P2 queue)
SELECT '=== BACKGROUND JOB COLUMNS ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'BackgroundJob'
ORDER BY ordinal_position;

-- 7. Check AIConversation.messages type
SELECT '=== AI CONVERSATION MESSAGES TYPE ===' AS section;
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'AIConversation' AND column_name = 'messages';

-- 8. Check RLS status on all tables
SELECT '=== RLS STATUS ===' AS section;
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 9. Row counts for key tables
SELECT '=== ROW COUNTS ===' AS section;
SELECT 'Organization' AS table_name, COUNT(*) FROM "Organization"
UNION ALL SELECT 'User', COUNT(*) FROM "User"
UNION ALL SELECT 'Vehicle', COUNT(*) FROM "Vehicle"
UNION ALL SELECT 'Driver', COUNT(*) FROM "Driver"
UNION ALL SELECT 'Device', COUNT(*) FROM "Device"
UNION ALL SELECT 'Trip', COUNT(*) FROM "Trip"
UNION ALL SELECT 'Alert', COUNT(*) FROM "Alert"
UNION ALL SELECT 'Notification', COUNT(*) FROM "Notification"
UNION ALL SELECT 'BackgroundJob', COUNT(*) FROM "BackgroundJob"
UNION ALL SELECT 'WebhookEndpoint', COUNT(*) FROM "WebhookEndpoint"
UNION ALL SELECT 'WebhookDelivery', COUNT(*) FROM "WebhookDelivery"
UNION ALL SELECT 'AIConversation', COUNT(*) FROM "AIConversation"
UNION ALL SELECT 'RateLimitCounter', COUNT(*) FROM "RateLimitCounter";

-- 10. Check for orphaned wrong-name columns
SELECT '=== DATA IN WRONG COLUMNS (needs migration) ===' AS section;
SELECT 
  (SELECT COUNT(*) FROM "Trip" WHERE "driver_name" IS NOT NULL) AS trip_driver_name_rows,
  (SELECT COUNT(*) FROM "Device" WHERE "phone_number" IS NOT NULL) AS device_phone_number_rows,
  (SELECT COUNT(*) FROM "MaintenanceRecord" WHERE "trigger_value" IS NOT NULL) AS maint_trigger_value_rows;
