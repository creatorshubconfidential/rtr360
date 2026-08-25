# Production Schema Reconciliation — P2-15

## Summary

The production database (Supabase PostgreSQL) uses snake_case column names, but 7 Prisma fields lacked `@map()` annotations, causing Prisma to query non-existent camelCase columns. This resulted in P2022 runtime errors.

## Classification

All 7 mismatches are **Category A: Prisma mapping bug** — the production DB columns are correctly named in snake_case; the Prisma schema was missing the `@map()` annotation.

## Affected Fields

| Model | Prisma Field | Expected Column | Actual Column | Fix |
|-------|-------------|----------------|-------------|-----|
| Alert | driverName | driverName | driver_name | Add @map("driver_name") |
| Alert | vehiclePlate | vehiclePlate | vehicle_plate | Add @map("vehicle_plate") |
| MaintenanceRecord | triggerValue | triggerValue | trigger_value | Add @map("trigger_value") |
| Trip | driverName | driverName | driver_name | Add @map("driver_name") |
| Device | phoneNumber | phoneNumber | phone_number | Add @map("phone_number") |
| Ticket | vehiclePlate | vehiclePlate | vehicle_plate | Add @map("vehicle_plate") |
| Document | uploadedBy | uploadedBy | uploaded_by | Add @map("uploaded_by") |
| Notification | updatedAt | updated_at | MISSING | Migration adds column |

## Error Trace

1. **Notification.updated_at** (1201 errors) — Column missing from production DB. The 0_init migration did not include updated_at. The 20260816 migration adds it, but production was not created by Prisma migrations.

2. **Alert.vehiclePlate** (15 errors) — /api/dashboard/alerts queries this field. Prisma looked for `vehiclePlate` column, production has `vehicle_plate`.

3. **MaintenanceRecord.triggerValue** (17 errors) — /api/analytics/maintenance-prediction queries this field. Prisma looked for `triggerValue`, production has `trigger_value`.

4. **Trip.driverName** (3 errors) — /api/analytics/driver-trends queries this field. Prisma looked for `driverName`, production has `driver_name`.

5. **Alert.driverName** (included in same queries as vehiclePlate) — same pattern.

## Migration

`20260826_p2_15_schema_reconciliation`:
- Renames 7 camelCase columns to snake_case (no-op on production, safe for Prisma-migrated DBs)
- Adds `Notification.updated_at` with safe default
- All operations guarded by `DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN NULL`

## No Application Code Changes Required

Prisma abstracts column name mapping. The application code continues to use camelCase field names (`alert.driverName`). Prisma Client translates these to the correct snake_case column names at query time.
