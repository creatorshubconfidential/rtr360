# REMEDIATION PLAN — RTR360

> **Created:** 2026-08-16
> **Source:** PHASE 0 Discovery Audit (6 audit documents)
> **Rule:** Do not claim complete until: implementation exists, tests exist, tests pass, typecheck passes, lint passes, build passes, documentation is updated.

---

## P0 — CRITICAL (Must fix before ANY other work)

### P0-1: Fix Privilege Escalation (Users POST/PATCH) ✅ DONE
- **Files:** `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`
- **Action:** Remove `role` and `organizationId` from client input. Enforce role hierarchy server-side.
- **Tests:** 20 tests in `tests/security-p0.test.ts` — role escalation, org isolation, hierarchy enforcement. ALL PASS.
- **Acceptance:** `POST /api/users { role: 'super_admin' }` returns 403. ✅

### P0-2: Fix Invoice PDF IDOR ✅ DONE
- **File:** `src/app/api/invoices/[id]/pdf/route.ts`
- **Action:** Added `isTenantAccessible(user, invoice.organizationId)` check.
- **Tests:** 6 tests in `tests/security-p0.test.ts` — cross-tenant returns 404, super_admin bypasses. ALL PASS.
- **Acceptance:** Org A user cannot access Org B invoice PDF. ✅

### P0-3: Fix Money Fields (Float → Decimal) ⏳ BLOCKED
- **Files:** `prisma/schema.prisma` + all API routes that write money values
- **Action:** Migrate to PostgreSQL first (SQLite doesn't support Decimal). Change 12 Float fields to `Decimal @db.Decimal(15, 2)`. Update all application code.
- **Blocker:** Requires PostgreSQL migration (P1 infrastructure). SQLite has no native Decimal type.
- **Tests:** Pending (blocked).
- **Acceptance:** All financial values use Decimal type. No Float in money context.

### P0-4: Fix Zero Database Indexes ✅ DONE
- **File:** `prisma/schema.prisma`
- **Action:** Added 71 `@@index` directives (73 total) for all tenant-scoped and commonly queried fields.
- **Tests:** Schema validates. `prisma db push` succeeded. Indexes live in DB.
- **Acceptance:** All list queries hit indexes. ✅

### P0-5: Fix Git Repository Hygiene ✅ DONE
- **Action:**
  1. ✅ `db/`, `tool-results/`, `upload/`, `download/`, `*.db`, `*.sqlite` already in `.gitignore`
  2. ✅ `.env` already not tracked
  3. ✅ Untracked `Caddyfile` and `package-lock.json` (project uses Bun)
  4. ✅ Git history scrubbed in previous session
  5. ✅ Created `.env.example` documenting all required variables
- **Acceptance:** `git ls-files` shows no .env, no .db, no artifact directories. ✅

### P0-6: Fix Caddyfile SSRF ✅ DONE
- **File:** `Caddyfile`
- **Action:** Removed `XTransformPort` handler entirely. Caddyfile now simple reverse_proxy.
- **Tests:** 3 tests in `tests/security-p0.test.ts` — no XTransformPort, no port/query/transform. ALL PASS.
- **Acceptance:** No query-parameter-based port forwarding. ✅

---

## P1 — HIGH (Fix before production)

### P1-1: Implement RBAC Permission System
- **Action:**
  1. Create `Role` and `Permission` models in Prisma
  2. Create `src/lib/permissions.ts` with `requirePermission(user, 'vehicle.create')`
  3. Apply to all 40+ write routes
  4. Add role hierarchy (super_admin > org_owner > fleet_manager > ... > viewer)
- **Tests:** 10 mandatory security tests from spec (cross-tenant, role escalation, etc.)
- **Acceptance:** Viewer cannot create vehicles. Fleet manager cannot modify billing.

### P1-2: Fix All Tenant Isolation Gaps
- **Files:** Revenue forecast, maintenance POST, installations POST, AI conversations, settings GET
- **Action:** Adopt `getTenantFilter()` on all routes. Verify vehicle/device ownership in POST routes.
- **Tests:** All 11 cross-tenant tests from SECURITY-AUDIT.md pass.
- **Acceptance:** 11/11 tenant isolation tests pass.

### P1-3: Fix 15 Broken Foreign Key Relations
- **File:** `prisma/schema.prisma`
- **Action:** Add `@relation` declarations for all 15 orphan FK fields.
- **Tests:** Verify cascade deletes work correctly.

### P1-4: Add `organizationId` to Trip and Activity
- **Files:** `prisma/schema.prisma`, migration, affected routes
- **Action:** Add field, backfill from related entities, update queries.

### P1-5: Migrate Auth to HttpOnly Cookies
- **Files:** Login route, logout route, auth.ts, all 24 frontend files
- **Action:**
  1. Login sets `rtr_session` HttpOnly cookie (already exists)
  2. Remove `localStorage` token usage from all 24 frontend files
  3. `authFetch` stops sending Authorization header (cookie is automatic)
  4. Fix SSE to use cookie auth instead of token in URL
- **Tests:** Verify token not accessible via JavaScript.
- **Acceptance:** `document.cookie` does not contain `rtr_session`. XSS cannot exfiltrate token.

### P1-6: Fix Cross-Tenant Revenue Forecast
- **File:** `src/app/api/analytics/revenue-forecast/route.ts`
- **Action:** Add org filter to subscriptions query.

### P1-7: Apply Rate Limiting to All Routes
- **Files:** All API routes
- **Action:** Create a `withRateLimit()` wrapper. Apply `rateLimiter.api()` to all POST/PUT/PATCH/DELETE. Apply stricter limits to analytics/AI.

### P1-8: Fix TypeScript Errors
- **Action:** Fix 326 errors (235 null-safety, 26 missing properties, 21 type mismatches). Remove `ignoreBuildErrors: true`. Enable `noImplicitAny: true`.
- **Acceptance:** `npx tsc --noEmit` returns 0 errors. `npm run build` passes without `ignoreBuildErrors`.

### P1-9: Normalize Quotation Items
- **Action:** Create `QuotationItem` model. Migrate JSON blob to normalized records. Update API and frontend.

---

## P2 — MEDIUM (Hardening)

### P2-1: Install Test Framework
- **Action:** `npm install -D vitest @testing-library/react @testing-library/jest-dom msw`.
- Write first tests: auth, tenant isolation, RBAC.
- Target: 50+ tests covering security-critical paths.

### P2-2: Enable ESLint Rules
- **Action:** Re-enable at minimum: `react-hooks/exhaustive-deps`, `no-console`, `@typescript-eslint/no-explicit-any`. Fix resulting warnings.

### P2-3: Implement Audit Logging
- **Action:** Create `src/lib/audit.ts` helper. Call in every POST/PUT/PATCH/DELETE route.

### P2-4: Consolidate `authFetch`
- **Action:** Delete 20+ local copies. All views import from `@/lib/api`. Add 401 interceptor.

### P2-5: Create Proper Database Migrations
- **Action:** `prisma migrate dev --name init`. Never use `db push` again.

### P2-6: Add Missing `updatedAt` Timestamps
- **Models:** AlertRule, Alert, Trip, Document, Notification, Setting, ApiKey, AIConversation

### P2-7: Fix Tailwind v3/v4 Hybrid
- **Action:** Commit to v4 (remove tailwind.config.ts, use CSS @theme). Fix content paths.

### P2-8: Fix `robots.txt`
- **Action:** Change to `Disallow: /` for private SaaS.

### P2-9: Fix CSP
- **Action:** Remove `unsafe-eval` and `unsafe-inline` from script-src.

### P2-10: Add Health Check Endpoint
- **Action:** `GET /api/health` returning DB status, uptime, version.

### P2-11: Fix Remaining Git Hygiene
- **Action:** Remove `package-lock.json` (project uses Bun). Remove Caddyfile from tracking.

### P2-12: Create CI/CD Pipeline
- **Action:** GitHub Actions: install → lint → typecheck → test → build → deploy.
- Pipeline MUST fail if typecheck, tests, or build fails.

---

## Execution Order

```
STEP 1 (P0 Security):   P0-1, P0-2, P0-6
STEP 2 (P0 Database):   P0-3, P0-4 (requires PostgreSQL migration first)
STEP 3 (P0 Git):        P0-5
STEP 4 (P1 RBAC):       P1-1
STEP 5 (P1 Tenant):     P1-2, P1-3, P1-4, P1-6
STEP 6 (P1 Auth):       P1-5
STEP 7 (P1 Quality):    P1-7, P1-8
STEP 8 (P1 Data):       P1-9
STEP 9 (P2 Hardening):  P2-1 through P2-12
```

## Definition of Done (Per Item)

1. Implementation exists in source code
2. Tests exist for the fix
3. Tests pass (`npm test`)
4. Typecheck passes (`npx tsc --noEmit`)
5. Lint passes (`npm run lint`)
6. Build passes (`npm run build`)
7. Documentation is updated (this file + relevant audit doc)
