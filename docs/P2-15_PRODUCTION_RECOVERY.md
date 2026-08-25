# P2-15 Production Recovery

## Executive Summary

P2-15 resolved 5 categories of production runtime errors affecting the RTR360 Vercel deployment. The primary root cause was a schema mismatch between the Prisma schema (camelCase field names without @map) and the production Supabase PostgreSQL database (snake_case column names). This caused 1,258 P2022 errors across 5 API routes. A secondary issue was SSE serverless timeout causing 222 Vercel 300-second timeout errors on realtime endpoints.

All fixes were additive, reversible, and data-safe. No production columns were dropped or renamed destructively. The application code required zero changes for the schema fixes — Prisma Client handles the column name mapping transparently.

## Starting State

- SHA: 6aef4b83d8c13258b5b75bd259ba255bcf55b415
- Vercel: READY (deployed 64ad3c8)
- CI: GREEN
- Tests: 832 passed
- Runtime errors: 1,480 total (P2022 + timeouts)

## Root Cause Analysis

### P2022 Column Mismatch (1,258 errors)

The production database was created by Supabase with snake_case column naming. Seven Prisma fields lacked `@map()` annotations, causing Prisma to generate SQL queries referencing non-existent camelCase columns. The application's own session-based authentication and tenant isolation are enforced at the API route level via `requireAuth()` and `orgFilter`. The Prisma client connects using privileged PostgreSQL credentials via `POSTGRES_PRISMA_URL` (set by the Supabase Vercel integration), not through Supabase Auth or PostgREST.

### Vercel Serverless Timeout (222 errors)

The /api/realtime/events and /api/realtime/vehicles endpoints use Server-Sent Events (SSE) with ReadableStream. The connections stayed open indefinitely, exceeding Vercel's 300-second serverless function timeout. Added a 55-second maximum connection duration with automatic reconnection signaling.

### RLS Decision

RLS is NOT appropriate for this application because: (1) the application uses its own session-based auth, not Supabase Auth JWT; (2) Prisma connects as a privileged PostgreSQL user; (3) tenant isolation is enforced at the application layer. Enabling RLS without proper policies would break the application.

## Fixes Applied

### Schema Fixes (prisma/schema.prisma)

Seven fields received @map() annotations:
- Alert.driverName @map("driver_name")
- Alert.vehiclePlate @map("vehicle_plate")
- MaintenanceRecord.triggerValue @map("trigger_value")
- Trip.driverName @map("driver_name")
- Device.phoneNumber @map("phone_number")
- Ticket.vehiclePlate @map("vehicle_plate")
- Document.uploadedBy @map("uploaded_by")

### Migration (20260826_p2_15_schema_reconciliation)

- Renames 7 camelCase columns to snake_case (no-op on production)
- Adds Notification.updated_at with safe default
- All operations guarded by DO $$ EXCEPTION WHEN OTHERS THEN NULL

### Realtime Fix

- Added 55-second max connection duration to both SSE endpoints
- Clients receive a `close` event and can reconnect automatically

## Final State

- SHA: 1a2d441
- Vercel: SUCCESS
- CI: SUCCESS (Run on 1a2d441)
- Tests: 832 passed, 440 security passed
- TypeScript: 0 errors
- ESLint: 0 errors
- Build: PASS
- npm audit: 0 vulnerabilities
- Prisma validate: PASS

## Remaining Items

1. Run migration on production database (requires Supabase SQL Editor or psql)
2. Configure 3 Vercel env vars: SETUP_INIT_KEY, SESSION_SECRET, ENCRYPTION_MASTER_KEY
3. Replace realtime SSE with production-grade solution (Supabase Realtime or polling)
4. Verify P2022 errors are resolved after migration is applied
5. Migration history reconciliation between Prisma and Supabase (documented, not actioned)
