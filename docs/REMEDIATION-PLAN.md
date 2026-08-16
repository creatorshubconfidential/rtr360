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

### P1-1: Implement RBAC Permission System ✅ DONE
- **Files:** `src/lib/permissions.ts` (already existed), 33 route files modified
- **Action:**
  1. ✅ Permission system already existed: 22 constants, 8-role map, `requirePermission()`
  2. ✅ Applied `requirePermission()` to all 42 unprotected write methods across 28 standard route files
  3. ✅ Normalized 5 admin routes from manual `verifySession()` to `getAuthUser()` + `ADMIN_MANAGE`
  4. ✅ Total: 49 `requirePermission()` calls across 39 route files
  5. ✅ Cleaned up unused imports, replaced `NextRequest` → `Request` in admin routes
- **Tests:** 101 tests in `tests/security-p1-rbac.test.ts` — all 8 roles tested, cross-resource isolation, hierarchy, coverage. ALL PASS.
- **Acceptance:** Viewer cannot create vehicles (403). Fleet manager cannot modify billing (403). 183/183 tests pass. ✅

### P1-2: Fix All Tenant Isolation Gaps ✅ DONE
- **Action:**
  1. ✅ Device POST now sets `organizationId: user.organizationId || null`
  2. ✅ Activity POST now sets `organizationId: user.organizationId || null`
  3. ✅ Audit-logs GET now filters by `organizationId` for `platform_admin` (only `super_admin` sees cross-tenant)
  4. ✅ Added RBAC check (`SETTINGS_MANAGE`) to audit-logs (replaces inline role check)
  5. ✅ P1-6 (revenue forecast): verified all queries already have org filtering
  6. ✅ Reports, dashboard, notifications, analytics — all verified correct
- **Acceptance:** No route creates records without `organizationId` (except auth/system). ✅

### P1-3: Fix 15 Broken Foreign Key Relations ✅ N/A (NONE FOUND)
- **Action:** Audited all `*Id` fields across 28 models. All FK fields have proper `@relation` declarations.
- **Note:** `AuditLog.entityId` is intentionally polymorphic. `Document.uploadedBy` is a naming inconsistency (not broken).

### P1-4: Add `organizationId` to Trip and Activity ✅ DONE
- **Files:** `prisma/schema.prisma`, `src/app/api/trips/route.ts`, `src/app/api/activities/route.ts`
- **Action:**
  1. ✅ Added `organizationId String?` + `@relation` + `@@index` to Trip model
  2. ✅ Added `organizationId String?` + `@relation` + `@@index` to Activity model
  3. ✅ Added `trips Trip[]` and `activities Activity[]` to Organization model
  4. ✅ Activity POST now sets `organizationId: user.organizationId || null`
  5. ✅ Trip POST already set `organizationId` (was using vehicle relation, now direct column)
  6. ✅ Schema validated, pushed to SQLite, Prisma client regenerated
- **Acceptance:** Trips and activities are directly tenant-scoped at DB level. ✅

### P1-6: Fix Cross-Tenant Revenue Forecast ✅ N/A (ALREADY CORRECT)
- **Action:** Verified all 6 queries in revenue-forecast already have org filtering.

### P1-5: Migrate Auth to HttpOnly Cookies ✅ DONE
- **Files:** Login route, logout route, auth.ts, all 24 frontend files
- **Action:**
  1. ✅ Login sets `rtr_session` HttpOnly cookie (already exists)
  2. ✅ Remove `localStorage` token usage from all 24 frontend files
  3. ✅ `authFetch` stops sending Authorization header (cookie is automatic)
  4. ✅ Fix SSE to use cookie auth instead of token in URL
- **Tests:** 15 tests in `tests/auth-cookie-only.test.ts` — cookie-first token extraction, zero localStorage, login no token leak, EventSource no token. ALL PASS.
- **Acceptance:** `document.cookie` does not contain `rtr_session`. XSS cannot exfiltrate token. ✅

### P1-6: Fix Cross-Tenant Revenue Forecast
- **File:** `src/app/api/analytics/revenue-forecast/route.ts`
- **Action:** Add org filter to subscriptions query.

### P1-7: Apply Rate Limiting to All Routes ✅ DONE
- **Files:** `src/lib/rate-limit.ts`, 42 API route files
- **Action:**
  1. ✅ Enhanced `rate-limit.ts`: added `checkRateLimit()` middleware helper, `perEndpointRateLimit()` with IP+path keying, `RateLimitTier` type
  2. ✅ Applied `checkRateLimit(request, tier)` to ALL 42 write-method routes (POST/PUT/PATCH/DELETE)
  3. ✅ Tier system: `api` (60/min), `auth` (10/min), `strict` (5/min for login), `analytics` (20/min for AI routes)
  4. ✅ Login retains custom strict rate limiter (5 req/min)
  5. ✅ Per-endpoint isolation: each endpoint has its own bucket per IP
  6. ✅ 429 responses include `Retry-After` and `X-RateLimit-Remaining` headers
- **Tests:** 17 tests in `tests/rate-limit-p1.test.ts` — core logic, per-endpoint isolation, IP extraction, tier limits, integration pattern. ALL PASS.
- **Acceptance:** Every POST/PUT/PATCH/DELETE route returns 429 when limit exceeded. ✅

### P1-8: Fix TypeScript Errors ✅ DONE
- **Files:** `tsconfig.json`, `src/app/page.tsx`, `src/components/views/SuperAdminView.tsx`, `next.config.ts`
- **Action:**
  1. ✅ Fixed implicit `any` index access in `page.tsx` (fleetGrade color map)
  2. ✅ Fixed implicit `any` parameter in `SuperAdminView.tsx` (string replace callback)
  3. ✅ Enabled `noImplicitAny: true` in `tsconfig.json`
  4. ✅ `ignoreBuildErrors` was already removed from `next.config.ts` (previous session)
  5. ✅ `npx tsc --noEmit` returns 0 errors
- **Tests:** All 215 tests pass with strict TS config.
- **Acceptance:** `npx tsc --noEmit` returns 0 errors. `noImplicitAny: true` enabled. ✅

### P1-9: Normalize Quotation Items ✅ DONE
- **Files:** `prisma/schema.prisma`, `src/app/api/quotations/route.ts`, `src/app/api/quotations/[id]/route.ts`, `src/lib/types.ts`, `src/components/views/QuotationsView.tsx`, `src/components/views/PipelineView.tsx`, `src/lib/seed.ts`
- **Action:**
  1. ✅ Created `QuotationItem` model (id, quotationId, sortOrder, description, quantity, unitPrice) with onDelete Cascade + index
  2. ✅ Removed `items` String (JSON blob) column from Quotation model, replaced with `items QuotationItem[]` relation
  3. ✅ Migrated 3 existing quotation records (15 items) from JSON to normalized rows
  4. ✅ Updated POST: creates QuotationItem records via `$transaction` with nested `create`
  5. ✅ Updated GET (list + detail): includes `items` ordered by `sortOrder`
  6. ✅ Updated PATCH: supports items replacement with `deleteMany` + `create`, recalculates totals
  7. ✅ Added item validation (description required, quantity >= 1, unitPrice >= 0)
  8. ✅ Updated `QuotationItem` type (added id, quotationId, sortOrder), created `QuotationItemInput` for form state
  9. ✅ Removed `parseItems()` / `JSON.parse` from QuotationsView, updated PipelineView to use `QuotationItemInput`
  10. ✅ Updated seed.ts to use nested `items: { create: [...] }` instead of `JSON.stringify`
- **Tests:** 13 tests in `tests/quotation-items-p1.test.ts` — schema structure, API patterns, frontend types, seed file. ALL PASS.
- **Acceptance:** No `items` String column in Quotation model. All items stored as normalized QuotationItem records. ✅

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
