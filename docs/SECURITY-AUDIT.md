# SECURITY-AUDIT.md — RTR360

> **Audit Date:** 2026-08-16
> **Severity:** P0=Critical (exploitable now), P1=High (should fix before production), P2=Medium (hardening)
> **Scope:** Full codebase — API routes, frontend, database, infrastructure, git history

---

## P0 — CRITICAL (3 findings)

### P0-1: Privilege Escalation via Client-Supplied `role` (Users POST)
- **Route:** `POST /api/users`
- **Impact:** Any `org_owner` can create a user with role `super_admin`, gaining full platform access to all tenants' data.
- **Root Cause:** Request body destructures `role` directly. The validation only checks if the role is in the allowlist, not if the caller has permission to assign that role.
- **Exploit:**
  ```json
  POST /api/users
  { "email": "attacker@evil.com", "name": "pwned", "role": "super_admin", "password": "Pass1234!" }
  ```
- **Fix:** Never accept `role` from client. Enforce role hierarchy server-side. Org owners can only assign roles <= their own level.

### P0-2: Privilege Escalation via Client-Supplied `role` (Users PATCH)
- **Route:** `PATCH /api/users/[id]`
- **Impact:** Same as P0-1. Any org user can escalate any user in their org to `super_admin`.
- **Root Cause:** `if (role !== undefined && VALID_ROLES.includes(role)) updateData.role = role;` — no permission check.
- **Fix:** Same as P0-1.

### P0-3: Cross-Tenant Invoice PDF Access (IDOR)
- **Route:** `GET /api/invoices/[id]/pdf`
- **Impact:** Any authenticated user can access any other tenant's invoice PDF by iterating UUIDs. Leaks billing address, VAT TRN, line items, amounts.
- **Root Cause:** No `organizationId` check on the fetched invoice.
- **Exploit:** `GET /api/invoices/<any-uuid>/pdf` — returns the PDF regardless of tenant.
- **Fix:** Add `if (user.role !== 'super_admin' && invoice.organizationId !== user.organizationId) return 404;`

---

## P1 — HIGH (10 findings)

### P1-1: Cross-Tenant Revenue Forecast Data Leak
- **Route:** `GET /api/analytics/revenue-forecast`
- **Impact:** Every authenticated user sees ALL active subscriptions across ALL organizations.
- **Fix:** Add `...orgFilter` to the subscriptions query.

### P1-2: Missing Vehicle Ownership Verification (Maintenance POST)
- **Route:** `POST /api/maintenance`
- **Impact:** Org user can create maintenance records against another tenant's vehicles.
- **Fix:** Verify `vehicle.organizationId === user.organizationId`.

### P1-3: Missing Vehicle/Device Ownership Verification (Installations POST)
- **Route:** `POST /api/installations`
- **Impact:** Org user can link another tenant's vehicles and devices.
- **Fix:** Verify vehicle and device belong to user's organization.

### P1-4: AI Conversation Ownership Bypass
- **Route:** `GET/DELETE /api/ai/conversations/[id]`
- **Impact:** If `conversation.userId` is null, any authenticated user can read/delete the conversation.
- **Fix:** Always verify org ownership regardless of userId.

### P1-5: Settings GET Has No Access Control
- **Route:** `GET /api/settings`
- **Impact:** Any authenticated user (even viewer) can read all platform settings.
- **Fix:** Add admin role check to GET.

### P1-6: No RBAC on Write Operations
- **Routes:** 40+ routes (all POST/PUT/PATCH/DELETE except admin)
- **Impact:** `viewer` role can create vehicles, delete drivers, create invoices, update tickets.
- **Fix:** Implement permission-based authorization. Restrict write operations to appropriate roles.

### P1-7: No Rate Limiting on Non-Auth Routes
- **Routes:** 56 of 57 routes
- **Impact:** Brute-force on GET endpoints, DoS on expensive analytics routes, mass create/delete.
- **Fix:** Apply `rateLimiter.api()` to all routes. Use stricter limits on expensive endpoints.

### P1-8: Auth Token in localStorage (Not HttpOnly Cookies)
- **Files:** 24 frontend files
- **Impact:** XSS attack can exfiltrate the token. HttpOnly cookies are immune to XSS token theft.
- **Fix:** Migrate all auth to cookie-only. Remove localStorage token usage.

### P1-9: Token Leaked in SSE URL
- **File:** `RealtimeEventToasts.tsx`
- **Impact:** Token appears in server access logs, browser history, proxy logs.
- **Fix:** Use cookie auth for SSE (EventSource sends cookies automatically).

### P1-10: Caddyfile SSRF via `XTransformPort`
- **File:** `Caddyfile`
- **Impact:** Any request to `:81?XTransformPort=6379` proxies to internal services. Full internal network scan.
- **Fix:** Remove the `XTransformPort` handler entirely.

---

## P2 — MEDIUM (18 findings)

### P2-1: Zero Test Infrastructure
- **Impact:** No way to verify security fixes don't regress. No way to prove tenant isolation works.

### P2-2: `ignoreBuildErrors: true` with 326 TypeScript Errors
- **Impact:** Type errors silently shipped to production. Null pointer from untyped object could leak data.

### P2-3: ESLint is a No-Op (29/35 Rules Disabled)
- **Impact:** `exhaustive-deps` off means stale closures. `no-console` off means debug leaks.

### P2-4: No Audit Logging on Write Operations
- **Impact:** No forensic trail for security incidents.

### P2-5: In-Memory Rate Limiting (Not Production-Safe)
- **Impact:** Bypassed in multi-instance deployments.

### P2-6: XSS Risk in Invoice PDF HTML Template
- **Route:** `GET /api/invoices/[id]/pdf`
- **Impact:** HTML interpolation without escaping.

### P2-7: CSP Allows `unsafe-eval` and `unsafe-inline`
- **File:** `middleware.ts`

### P2-8: `db/custom.db` (328KB SQLite) Tracked in Git
- **Impact:** Database with all user data committed to repository.

### P2-9: `.env` File Tracked in Git
- **Impact:** Contains `DATABASE_URL`. Even if the current value is a local SQLite path, the pattern is dangerous.

### P2-10: 151 Artifact Files Tracked in Git (14.1MB)
- **Files:** `tool-results/`, `upload/`, `download/`

### P2-11: `robots.txt` Allows Full Crawl of Authenticated SaaS

### P2-12: Quotation Number Collision Risk (4-digit random)

### P2-13: Ticket/Installation Number Race Conditions

### P2-14: `db:push --accept-data-loss` in package.json Scripts

### P2-15: dnd-kit v6/v10 Major Version Mismatch

### P2-16: Tailwind v3/v4 Hybrid Configuration

### P2-17: `reactStrictMode: false` Hides Effect Bugs

### P2-18: `log: ['query']` in Production DB Client

---

## Tenant Isolation Test Matrix (Required)

| Test Case | Expected Result | Current Status |
|-----------|---------------|----------------|
| Cross-tenant GET (vehicles) | 403/404 | PASS (inline filter) |
| Cross-tenant GET (invoice PDF) | 403/404 | **FAIL (P0-3)** |
| Cross-tenant POST (users with role) | 403 | **FAIL (P0-1)** |
| Cross-tenant PATCH (users with role) | 403 | **FAIL (P0-2)** |
| Cross-tenant POST (maintenance) | 403 | **FAIL (P1-2)** |
| Cross-tenant POST (installations) | 403 | **FAIL (P1-3)** |
| Cross-tenant GET (revenue forecast) | 403/404 | **FAIL (P1-1)** |
| Cross-tenant GET (AI conversations) | 403/404 | **FAIL (P1-4)** |
| Viewer creates invoice | 403 | **FAIL (P1-6)** |
| Viewer deletes driver | 403 | **FAIL (P1-6)** |
| Org owner assigns super_admin | 403 | **FAIL (P0-1)** |

**Result: 3/11 tests pass. 8/11 tests FAIL.**