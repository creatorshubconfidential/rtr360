# ARCHITECTURE-AUDIT.md — RTR360

> **Audit Date:** 2026-08-16
> **Auditor:** MIANX.AI Agent 1 (Architect)
> **Branch:** main | **Commit:** 2665430

---

## 1. Executive Summary

RTR360 is a single-page application (SPA) built with Next.js 16 App Router, serving both the API layer and the frontend from a single codebase. The application uses a client-side state machine for routing (no URL-based navigation), SQLite for local development (with a planned PostgreSQL migration to Supabase), and a monolithic Prisma ORM for all database operations. The architecture is functionally complete for a prototype but has significant structural issues that prevent production deployment.

**Overall Architecture Grade: D+ (Prototype-quality, not production-grade)**

---

## 2. Tech Stack Inventory

| Layer | Technology | Version | Status |
|-------|-----------|---------|--------|
| Framework | Next.js (App Router) | 16 | UPGRADE — `ignoreBuildErrors: true` ships broken types |
| Language | TypeScript | 5.x | FIX — 326 errors, `noImplicitAny: false` undermines strict mode |
| UI Framework | React | 19 | KEEP |
| Styling | Tailwind CSS | 4 (via @tailwindcss/postcss) | FIX — v3/v4 config hybrid, content paths miss `./src/**` |
| UI Components | shadcn/ui (Radix) | latest | KEEP |
| Icons | Lucide React | latest | KEEP |
| ORM | Prisma | 6 | FIX — zero indexes, 15 broken FKs, Float for money |
| Database (dev) | SQLite | 3.x | UPGRADE — no enums, no Decimal, no migrations |
| Database (prod) | PostgreSQL (Supabase) | planned | MISSING — no migration files exist |
| Auth | bcryptjs + DB sessions | latest | FIX — tokens in localStorage, not HttpOnly cookies |
| Maps | Leaflet + React-Leaflet | latest | KEEP |
| Charts | Recharts | latest | KEEP |
| Animation | Framer Motion | latest | KEEP |
| Forms | React Hook Form + Zod | latest | UPGRADE — Zod v4 may have ecosystem incompatibilities |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | v6 + v10 | FIX — major version mismatch |
| Runtime | Bun | latest | KEEP |
| Linting | ESLint | v9 (flat config) | FIX — 29/35 rules disabled, effectively a no-op |
| Testing | None | N/A | MISSING — zero test files, no test framework |
| CI/CD | GitHub Actions (Datadog only) | N/A | MISSING — no build/test/lint pipeline |
| Containerization | None | N/A | MISSING — no Dockerfile, no docker-compose |

---

## 3. Application Architecture

### 3.1 Routing

**Pattern:** Single-page application with client-side state machine.

```
User visits / → page.tsx renders
  → Checks localStorage('rtr_token')
    → If token: calls GET /api/auth/me
      → If valid: renders Home (sidebar + view switch)
      → If invalid: clears token, shows LoginScreen
    → If no token: shows LoginScreen
```

**Issues:**
- **No URL-based routing.** All navigation is via `useState<ViewType>`. The browser URL never changes (always `/`). No deep-linking, no browser back/forward, no bookmarkable views.
- **God component.** `page.tsx` is ~1,950 lines containing LoginScreen, SidebarNav, DashboardView, VehiclesView, LeadsView, AdminDashboard, and the main Home component.
- **Duplicated types and constants.** page.tsx defines its own `UserSession`, `DashboardStats`, `Lead`, `Vehicle`, `Alert` interfaces and `STATUS_COLORS`, `PRIORITY_COLORS`, `EMIRATES` constants instead of importing from `@/lib/`.

**Classification:** REBUILD the routing to use Next.js App Router properly, or at minimum extract inline views into separate files.

### 3.2 Authentication Flow

```
Login:  POST /api/auth/login { email, password }
        → bcryptjs.verify()
        → Session created in DB (randomBytes(48) token)
        → Token returned in JSON response
        → Frontend stores in localStorage('rtr_token')
        → HttpOnly cookie also set (rtr_session)

API calls:  Authorization: Bearer <token> header
            OR cookie fallback (getAuthUser reads both)

Logout:   POST /api/auth/logout
          → Session deleted from DB
          → Cookie cleared
          → Frontend clears localStorage
```

**Issues:**
- **Token in localStorage.** 24 frontend files read/write `localStorage.getItem('rtr_token')`. This violates the spec requirement for HttpOnly cookies and exposes tokens to XSS exfiltration. The HttpOnly cookie is set on login, but the frontend ignores it and uses localStorage instead.
- **No session expiry handling.** If the token expires mid-session, API calls fail silently. No 401 interceptor to redirect to login.
- **No password reset flow.** No `POST /api/auth/forgot-password` or `POST /api/auth/reset-password`.
- **No email verification.** Users are created as active without email confirmation.
- **No brute-force protection on login.** Rate limiting exists (5 req/min) but no account lockout, no suspicious login detection.

**Classification:** FIX — Migrate to cookie-only auth, add 401 interceptor, add password reset.

### 3.3 Multi-Tenancy

**Pattern:** Organization-based tenant isolation. Every entity has an `organizationId` field.

```typescript
// src/lib/tenant.ts
export function getTenantFilter(user: UserSession): Record<string, unknown> {
  if (user.role === 'super_admin') return {};  // Bypass for super admin
  if (user.organizationId) return { organizationId: user.organizationId };
  return { organizationId: '__none__' };  // Impossible filter for orgless users
}
```

**Issues:**
- **`getTenantFilter()` exists but is used by only 1 route.** All other routes implement ad-hoc inline tenant filtering.
- **3 routes have verified tenant isolation bugs** (see SECURITY-AUDIT.md P0-1, P0-2, P0-3, P1-1).
- **No centralized enforcement.** There is no middleware or wrapper that automatically applies tenant filters. Each route author must remember to add the filter.
- **Trip and Activity models lack `organizationId`.** Must join through Vehicle/Lead to determine tenant.

**Classification:** FIX — Enforce `getTenantFilter()` usage on all routes, add `organizationId` to Trip and Activity.

### 3.4 Authorization (RBAC)

**Pattern:** 8 roles defined as string constants. No permission model exists.

```typescript
type Role = 'super_admin' | 'platform_admin' | 'operations_manager' |
            'sales_manager' | 'fleet_manager' | 'dispatcher' | 'viewer' | 'org_owner';
```

**Issues:**
- **No permission-based authorization.** Only 4 routes check roles (admin routes, audit-logs, settings, users POST). A `viewer` can create vehicles, delete drivers, create invoices.
- **No centralized RBAC helper.** Role checks are scattered `if` statements in individual routes.
- **Privilege escalation possible.** Users POST and PATCH routes accept `role` from the client body, allowing any org_owner to create a super_admin.
- **No role hierarchy.** There is no defined hierarchy (e.g., org_owner > fleet_manager > viewer).

**Classification:** REBUILD — Create Role/Permission models and a centralized `requirePermission()` middleware.

### 3.5 Frontend Architecture

**Pattern:** 23 view components + 3 inline views in page.tsx. Single `authFetch` pattern (but duplicated 20+ times).

**Issues:**
- **Duplicated `authFetch` in 20+ files.** Only 3 views import from `@/lib/api`. The rest define identical local copies.
- **No shared error handling.** ~13 views have silent `catch {}` blocks.
- **No frontend role guards.** All views are accessible to any authenticated user.
- **No loading skeletons on ~8 views** (use plain text "Loading...").
- **No URL routing** (see 3.1).

**Classification:** UPGRADE — Consolidate authFetch, add role guards, extract inline views.

### 3.6 Real-Time Architecture

**Pattern:** Server-Sent Events (SSE) via `EventSource` API.

```
Frontend: new EventSource('/api/realtime/events?token=${token}')
Backend:  GET /api/realtime/events → Streams SSE events every 3 seconds
```

**Issues:**
- **Token in URL query parameter.** EventSource doesn't support custom headers. Token is exposed in server logs, browser history, and proxy logs.
- **No authentication verification on the SSE endpoint for token-in-URL pattern.** The endpoint reads the token from query params.
- **Polling simulation.** The SSE endpoint doesn't use a real push mechanism. It polls the database every 3 seconds and sends diffs.

**Classification:** FIX — Use cookie auth for SSE, or implement a short-lived ticket endpoint.

---

## 4. Infrastructure

### 4.1 Database
- **Development:** SQLite (`db/custom.db`, 328KB, **tracked in git**)
- **Production:** PostgreSQL on Supabase (planned, no migration files exist)
- **Migrations:** NONE. Schema changes applied via `prisma db push` (destructive, no rollback)

### 4.2 Reverse Proxy
- **Caddyfile** on port 81 with `XTransformPort` SSRF vulnerability
- No TLS, no rate limiting, no logging at proxy level

### 4.3 Deployment
- **No Dockerfile.** No containerization.
- **No vercel.json.** No Vercel configuration.
- **No deployment pipeline.** Only a Datadog synthetic test workflow exists in CI.
- **Build output:** `standalone` mode for self-hosted deployment.

### 4.4 Environment
- **`.env` tracked in git** (contains `DATABASE_URL`)
- **No `.env.example`** — no documentation of required environment variables
- **`db/`, `tool-results/`, `upload/`, `download/` tracked in git** (14.1MB of artifacts)

---

## 5. Code Metrics

| Metric | Value |
|--------|-------|
| Total files in `src/` | ~95 |
| API routes | 57 |
| View components | 23 + 3 inline |
| UI components (shadcn) | 45+ |
| Lib files | 8 |
| DB models | 31 |
| Lines in page.tsx | ~1,950 |
| TypeScript errors | 326 |
| ESLint rules disabled | 29/35 |
| Test files | 0 |
| Migration files | 0 |
| Git-tracked artifacts | 151 files (14.1MB) |

---

## 6. Architectural Decisions Required

| Decision | Current State | Recommendation |
|----------|---------------|----------------|
| Database | SQLite (dev) + PostgreSQL (planned) | Migrate to PostgreSQL now; create proper migrations |
| Auth token storage | localStorage + HttpOnly cookie (dual) | HttpOnly cookie only; remove localStorage usage |
| Routing | Client-side state machine | Next.js App Router with proper file-based routing |
| RBAC | String roles, no permissions | Permission-based model with Role/Permission tables |
| Tenant isolation | Ad-hoc per-route | Centralized `withTenantScope()` wrapper |
| API validation | Manual checks | Zod schemas on all routes |
| Error handling | Inconsistent | Standardized error middleware |
| Audit logging | Model exists, never written to | Automatic audit on all write operations |
| Real-time | SSE with token in URL | Cookie-based SSE or WebSocket with auth |
| Configuration | `.env` file, no example | `.env.example` + environment validation at startup |