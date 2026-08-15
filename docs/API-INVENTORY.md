# API-INVENTORY.md — RTR360

> **Audit Date:** 2026-08-16
> **Total Routes:** 57 | **Methods:** GET=35, POST=22, PATCH=18, DELETE=12
> **Legend:** Auth=authenticated, Tenant=org-scoped, RBAC=role-checked, IDOR=ownership-verified, Valid=input-validated, Rate=rate-limited, Audit=audit-logged

---

## Authentication & User Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 1 | `/api/route.ts` | GET | No | N/A | No | N/A | No | No | No | Returns API status. No auth required. |
| 2 | `/api/auth/login` | POST | Implicit | N/A | N/A | N/A | Manual | Strict(5/min) | No | Working correctly. |
| 3 | `/api/auth/logout` | POST | No | N/A | N/A | N/A | No | No | No | No auth check on logout endpoint. |
| 4 | `/api/auth/me` | GET | Yes | N/A | N/A | N/A | No | No | No | Returns current user session. Working. |
| 5 | `/api/users` | GET, POST | Yes | Yes | POST:admin only | N/A | Manual | No | No | **P0:** POST accepts client-supplied `role` and `organizationId` — privilege escalation. |
| 6 | `/api/users/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | Manual(PATCH) | No | No | **P0:** PATCH accepts client-supplied `role` — privilege escalation. |

## Admin Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 7 | `/api/admin/organizations` | GET, POST | Yes | N/A | super_admin | N/A | Manual | No | No | Duplicated auth pattern (doesn't use getAuthUser). |
| 8 | `/api/admin/organizations/[id]` | GET, PATCH, DELETE | Yes | N/A | super_admin | N/A | Manual(PATCH) | No | No | PATCH: no input validation on fields. |
| 9 | `/api/admin/organizations/[id]/usage` | GET | Yes | N/A | super_admin | N/A | No | No | No | Working. |
| 10 | `/api/admin/organizations/[id]/branding` | GET, PUT | Yes | N/A | super_admin | N/A | No | No | No | PUT: no input validation. |
| 11 | `/api/admin/platform-stats` | GET | Yes | N/A | super_admin | N/A | No | No | No | Working. |

## Fleet Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 12 | `/api/vehicles` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Working but no RBAC (viewer can create). |
| 13 | `/api/devices` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | POST: no `organizationId` set (intentional for warehouse). |
| 14 | `/api/devices/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | Manual | No | No | Working. |
| 15 | `/api/drivers` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | No RBAC. |
| 16 | `/api/drivers/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | Manual | No | No | Working. |
| 17 | `/api/trips` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Trip model lacks `organizationId` — relies on vehicle join. |
| 18 | `/api/trips/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | No | No | No | Working. |
| 19 | `/api/geofences` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Working. |
| 20 | `/api/geofences/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | No | No | No | Working. |
| 21 | `/api/technicians` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | No RBAC. |
| 22 | `/api/technicians/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | Manual | No | No | Working. |

## CRM Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 23 | `/api/leads` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | POST: no org requirement check. |
| 24 | `/api/leads/[id]` | GET, PATCH | Yes | Yes | No | Yes | Manual | No | No | Working. |
| 25 | `/api/contacts` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Working. |
| 26 | `/api/pipeline` | GET | Yes | Yes | No | N/A | No | No | No | Returns leads grouped by stage. Working. |
| 27 | `/api/activities` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Uses `getTenantFilter()` — good. But POST: no `organizationId` set. |
| 28 | `/api/contracts` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Working. |
| 29 | `/api/contracts/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | Manual(PATCH) | No | No | PATCH: no status validation against allowlist. |

## Quotations & Invoices

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 30 | `/api/quotations` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Quotation number: Math.random() 4-digit collision risk (P2). |
| 31 | `/api/quotations/[id]` | GET, PATCH | Yes | Yes | No | Yes | Manual | No | No | Working. |
| 32 | `/api/invoices` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | POST: super_admin accepts orgId from body without validation. |
| 33 | `/api/invoices/[id]` | GET, PATCH | Yes | Yes | No | Yes | Manual(PATCH) | No | No | Working. |
| 34 | `/api/invoices/[id]/pdf` | GET | Yes | **No** | No | **No** | No | No | No | **P0:** No tenant check. Any user can access any org's invoice PDF. |

## Operations Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 35 | `/api/maintenance` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | **P1:** POST doesn't verify vehicle belongs to user's org. |
| 36 | `/api/maintenance/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | Manual | No | No | Working. |
| 37 | `/api/installations` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | **P1:** POST doesn't verify vehicle/device org ownership. |
| 38 | `/api/installations/[id]` | PATCH | Yes | Yes | No | Yes | Manual(status) | No | No | Working. |
| 39 | `/api/alert-rules` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Working. |
| 40 | `/api/alert-rules/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | No | No | No | Working. |

## Support & Notifications

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 41 | `/api/tickets` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | Ticket number: count-based race condition (P2). |
| 42 | `/api/tickets/[id]` | PATCH, DELETE | Yes | Yes | No | Yes | Manual | No | No | Working. |
| 43 | `/api/notifications` | GET, POST | Yes | Yes | No | N/A | Manual(id) | No | No | Working. |

## Billing Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 44 | `/api/subscriptions` | GET, POST | Yes | Yes | No | N/A | Manual | No | No | No RBAC (viewer can create subscriptions). |
| 45 | `/api/subscriptions/[id]` | GET, PATCH | Yes | Yes | No | Yes | Manual | No | No | Working. |

## Analytics Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 46 | `/api/analytics/revenue-forecast` | GET | Yes | **Partial** | No | N/A | No | No | No | **P1:** Subscriptions query has NO tenant filter. Cross-tenant data leak. |
| 47 | `/api/analytics/maintenance-prediction` | GET | Yes | Yes | No | N/A | No | No | No | Working (rule-based prediction). |
| 48 | `/api/analytics/driver-trends` | GET | Yes | Yes | No | N/A | No | No | No | Working. |
| 49 | `/api/analytics/fleet-health` | GET | Yes | Yes | No | N/A | No | No | No | Working. |

## Dashboard, Reports, Settings

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 50 | `/api/dashboard/stats` | GET | Yes | Yes | No | N/A | No | No | No | Working. |
| 51 | `/api/reports` | GET | Yes | Yes | No | N/A | No | No | No | Inconsistent org filter pattern vs getTenantFilter(). |
| 52 | `/api/settings` | GET, PUT | Yes | N/A | PUT:admin | N/A | Manual(PUT) | No | No | **P1:** GET has no role check — any user reads all platform settings. |
| 53 | `/api/audit-logs` | GET | Yes | N/A | Admin | N/A | No | No | No | Working. But audit log is never written to by any route. |

## AI Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 54 | `/api/ai/chat` | GET, POST | Yes | Yes | No | N/A | Manual(POST) | No | No | Rule-based chatbot, not real AI. No rate limiting. ~15 DB queries per POST. |
| 55 | `/api/ai/conversations/[id]` | GET, DELETE | Yes | Partial | No | Partial | No | No | No | **P1:** Ownership bypass when `userId` is null. |

## Real-Time Routes

| # | Route | Methods | Auth | Tenant | RBAC | IDOR | Valid | Rate | Audit | Issues |
|---|-------|---------|------|--------|------|------|-------|------|-------|--------|
| 56 | `/api/realtime/events` | GET | Yes | Yes | No | N/A | No | No | No | Token passed as URL query param — logged everywhere. |
| 57 | `/api/realtime/vehicles` | GET | Yes | Yes | No | N/A | No | No | No | Working. |

---

## Coverage Summary

| Check | Routes With | Routes Without | Coverage |
|-------|-------------|---------------|----------|
| Authentication | 55/57 | 2 (route.ts, auth/logout) | 96% |
| Tenant Isolation | 49/55 | 6 (admin routes, settings, invoice PDF, revenue-forecast) | 89% |
| RBAC | 5/57 | 52 | 9% |
| IDOR Protection | 24/26 | 2 (invoice PDF, AI conversations) | 92% |
| Input Validation | 40/57 | 17 | 70% |
| Rate Limiting | 1/57 | 56 | 2% |
| Audit Logging | 0/57 | 57 | 0% |

## Response Format Inconsistencies

| Pattern | Used By |
|---------|----------|
| `Response.json({ data, total, page, limit })` | Most list routes |
| `Response.json({ success: true, data })` | Some create routes |
| `NextResponse.json({ error: '...' })` | Admin routes |
| `Response.json({ error: '...' })` | Most other routes |
| `new Response(JSON.stringify(data))` | Invoice PDF route |
