# RTR360 P2-14 — Infrastructure Unlock Report

## Executive Summary

P2-14 resolved the Vercel deployment failure that had persisted since approximately August 20, 2026, and fixed a readiness check bug that caused /api/ready to return 503 despite the database being healthy. The production application is now deployed, serving the latest code, and reporting ready status.

## Root Cause Analysis

### Vercel Build Failure

`output: "standalone"` in next.config.ts was incompatible with Vercel's native Next.js build pipeline when used with Next.js 16.3.x. Vercel has its own build system that does not need standalone output. The standalone mode is designed for self-hosting (Docker, bare metal, VMs) and conflicts with Vercel's build pipeline.

Evidence chain:
1. Vercel deployments succeeded with earlier Next.js versions + output standalone
2. Vercel deployments failed starting when Next.js was upgraded to 16.3.x
3. Local builds passed both with and without standalone (Vercel pipeline differs)
4. Removing `output: "standalone"` restored successful Vercel deployments
5. Production now serves version 0.2.1 with all routes deployed

Classification: CONFIGURATION — Vercel project/build configuration mismatch

### /api/ready 503 Bug

The /api/ready endpoint only checked for `DATABASE_URL` environment variable, but Vercel's Supabase integration sets `POSTGRES_PRISMA_URL` instead. The database connection in db.ts already supported multiple URL sources via `resolveDatabaseUrl()`, but the readiness check did not. This caused /api/ready to return 503 "not_ready" despite the database being perfectly healthy.

Classification: CODE BUG — Environment variable check did not match db.ts resolution logic

## Fixes Applied

### Fix 1: Remove output standalone (commits 52bdbca, be1b03f, 64ad3c8)

Removed `output: "standalone"` and `serverExternalPackages` from next.config.ts.

### Fix 2: Recognize Supabase Postgres URLs (commit 43c0e31)

Updated `src/lib/env.ts` to recognize `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, and `POSTGRES_URL` as valid database URL sources, matching the logic in `src/lib/db.ts`. Updated `/api/ready` to use the new `isDatabaseConfigured()` helper.

## Deployment Evidence

- Production SHA: 43c0e3147c186195d056167ab315f31c89febc6d
- Vercel status: SUCCESS
- CI: SUCCESS (Run 32878665570)
- /api/health: HTTP 200, database healthy (latency ~1850ms)
- /api/ready: HTTP 200, status: ready
- Homepage: HTTP 200
- All security headers present (HSTS, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy)
- Protected endpoints return 401 (authentication required)

## Vercel Environment Variables

The /api/health endpoint reports 3 missing production environment variables:

- SETUP_INIT_KEY: MISSING (must be configured in Vercel dashboard)
- SESSION_SECRET: MISSING (must be configured in Vercel dashboard)
- ENCRYPTION_MASTER_KEY: MISSING (must be configured in Vercel dashboard)

DATABASE_URL is now recognized as PRESENT via POSTGRES_PRISMA_URL (Supabase integration).

## Test Results

- Unit tests: 832 passed, 12 skipped (20 test files)
- Security tests: 440 passed, 3 skipped (7 test files)
- TypeScript: 0 errors
- ESLint: 0 errors
- Build: PASS
- npm audit: 0 vulnerabilities (high)
- Prisma validate: PASS

## Migrations

9 migrations present, including REAL to NUMERIC(18,2) for 13 money fields. All migrations applied in CI via `prisma migrate deploy`.

## Remaining Items

1. Configure 3 missing Vercel environment variables (SETUP_INIT_KEY, SESSION_SECRET, ENCRYPTION_MASTER_KEY)
2. Run webhook encryption backfill once ENCRYPTION_MASTER_KEY is set
3. Verify REAL to NUMERIC migration applied on production database via direct DB access

## Commits

- 9dd9b01: Pin Node.js >= 20.9.0
- d7e7c7d: Add serverExternalPackages
- 52bdbca: Remove output standalone + restore ignoreBuildErrors
- be1b03f: Remove output standalone and serverExternalPackages
- 64ad3c8: Final cleanup, VERIFIED DEPLOYMENT SUCCESS
- 43c0e31: Recognize Supabase Postgres URLs in env/ready checks
