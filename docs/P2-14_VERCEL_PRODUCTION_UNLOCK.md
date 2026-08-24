# RTR360 P2-14 — Vercel Production Unlock

## Executive Summary

P2-14 identified and fixed the root cause of Vercel deployment failures
that had persisted since approximately August 20, 2026. The production
application is now deployed and serving the latest code.

## Root Cause

`output: "standalone"` in next.config.ts was incompatible with Vercel's
native Next.js build pipeline when used with Next.js 16.3.x. Vercel has its
own build system that does not need standalone output. The standalone mode is designed
for self-hosting (Docker, bare metal, VMs) and conflicts with
Vercel's build pipeline.

Evidence chain:
1. Vercel deployments succeeded with Next.js 16.1.x + output: standalone (proven
   by git history and commit statuses)
2. Vercel deployments failed starting when Next.js was upgraded to 16.3.x
3. Local builds passed both with and without standalone (Vercel pipeline differs)
4. Removing output: standalone restored successful Vercel deployments (commit be1b03f)
5. Production now serves version 0.2.1 (was 0.1.0) with /api/ready route

Classification: Category I — Vercel project/build configuration mismatch

## Fix Applied

Removed `output: "standalone"` and `serverExternalPackages` from
next.config.ts. Vercel has native Next.js build support and does not
need standalone output. Also removed `typescript: { ignoreBuildErrors: true }`
which was a prior workaround that is no longer needed.
Before:
```ts
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "pdfkit"],
  typescript: { ignoreBuildErrors: true },
};
```
After:
```ts
const nextConfig: NextConfig = {
  reactStrictMode: false,
};
```
## Deployment Evidence

- SHA: be1b03f
- Vercel status: SUCCESS
- /api/health: HTTP 200, version 0.2.1, database healthy
- /api/ready: HTTP 200 (was 404), route now deployed
- Security headers: all present (HSTS, X-Frame-Options, CSP, etc.)
- Production uptime: 0 (fresh deployment, age: 0)

## Vercel Environment Variables

The /api/health endpoint reports 4 missing production environment
variables that must be configured in the Vercel dashboard:

- DATABASE_URL
- SETUP_INIT_KEY
- SESSION_SECRET
- ENCRYPTION_MASTER_KEY

Note: The production database IS connected (status: healthy,
latencyMs: 1882ms), suggesting DATABASE_URL
may be set under a different name or through a Supabase
integration.
## Remaining Items

1. Configure the 4 missing Vercel environment variables
2. Run webhook encryption backfill once ENCRYPTION_MASTER_KEY is set
3. Verify CI passes for SHA be1b03f
4. Verify REAL to NUMERIC migration on production DB

## LOCAL VERIFICATION

All checks pass: 832 tests, 0 TS errors, 0 ESLint errors,
0 vulnerabilities, build PASS,
Prisma valid.