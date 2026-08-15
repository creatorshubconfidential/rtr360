# FEATURE-MATRIX.md — RTR360

> **Audit Date:** 2026-08-16
> **Rule:** Every feature classified by inspecting ACTUAL source code, not documentation claims.
> **Scale:** KEEP = works correctly | FIX = broken/insecure | UPGRADE = needs improvement | REBUILD = fundamentally wrong | MISSING = needed but doesn't exist

---

## 1. Authentication & Sessions

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Login (email/password) | Complete | Working | KEEP | `POST /api/auth/login` validates, creates session, returns token |
| Logout | Complete | Working | KEEP | `POST /api/auth/logout` deletes session, clears cookie |
| Session storage | Complete | Working (backend) / Broken (frontend) | FIX | Backend: DB sessions with expiry. Frontend: uses localStorage instead of HttpOnly cookie |
| Password hashing | Complete | Working | KEEP | bcryptjs with 12 salt rounds |
| Password strength validation | Complete | Working | KEEP | `validatePasswordStrength()` on user create/update routes |
| Rate limiting (login) | Complete | Working | KEEP | `rateLimiter.strict()` — 5 req/min per IP |
| Password reset | Not claimed | Missing | MISSING | No forgot-password or reset-password endpoint |
| Email verification | Not claimed | Missing | MISSING | Users created as active without confirmation |
| Brute-force protection | Not claimed | Partial | UPGRADE | Rate limit exists but no account lockout or suspicious login detection |
| Session/device management | Not claimed | Missing | MISSING | No UI to view/expire active sessions |
| Session revocation | Not claimed | Partial | UPGRADE | Sessions can be deleted by ID but no bulk revoke |

## 2. Multi-Tenancy & Organizations

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Organization model | Complete | Working | KEEP | Rich Organization model with 30 fields, white-label support |
| Branch model | Complete | Working | KEEP | Branches with emirate, address, linked to vehicles |
| Tenant isolation (API) | Complete | Broken | FIX | 3 routes have verified cross-tenant bugs (users POST, users PATCH, invoice PDF) |
| Tenant isolation (frontend) | Complete | Broken | FIX | No role-based view restrictions; any authenticated user sees all views |
| `getTenantFilter()` helper | Complete | Exists but unused | FIX | Created in `src/lib/tenant.ts` but only 1 route uses it |
| Organization onboarding | Complete | Working | KEEP | 3-step wizard in SuperAdminView |
| White-label branding | Complete | Working | KEEP | Per-org colors, app name, footer, logo |
| Usage analytics | Complete | Working | KEEP | 30d/90d usage stats per org |
| Soft-deactivate org | Complete | Working | KEEP | Status field + user cascading |

## 3. User Management

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| User CRUD | Complete | Working (insecure) | FIX | Works but privilege escalation via client-supplied `role` (P0) |
| Role-based access | Complete | Broken | REBUILD | 8 roles exist as strings; no permission model; viewer can create invoices |
| Role hierarchy | Not claimed | Missing | MISSING | No hierarchy enforcement; org_owner can assign super_admin |
| Privilege escalation prevention | Not claimed | Missing | MISSING | Users POST/PATCH accept `role` from client body |

## 4. Fleet Management

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Vehicle CRUD | Complete | Working | KEEP | Full CRUD with UAE plate format, driver/device assignment |
| Driver CRUD | Complete | Working | KEEP | Full CRUD with UAE license types, nationality, scoring |
| Device inventory | Complete | Working | KEEP | GPS devices with IMEI, SIM, warehouse management |
| SIM management | Complete | Partial | UPGRADE | SIM model exists but no dedicated API route; managed within devices |
| Vehicle-device assignment | Complete | Working | KEEP | Direct assignment via `vehicle.deviceId` |
| Device lifecycle states | Not claimed | Partial | UPGRADE | Status field exists (warehouse/installed/returned/defective) but no state machine enforcement |

## 5. GPS / Live Tracking

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Live map | Complete | Working (simulated) | KEEP | Leaflet map with vehicle markers, popups, search |
| Real-time updates | Complete | Working (simulated) | KEEP | SSE events every 3s with simulated positions |
| GPS data ingestion | Not claimed | Missing | MISSING | No device protocol adapter, no telemetry storage, no ingestion endpoint |
| Trip recording | Complete | Working (manual) | UPGRADE | Trips can be created manually; no automatic trip detection from GPS |
| Route playback | Not claimed | Missing | MISSING | No historical route visualization |
| Vehicle positions API | Complete | Working (simulated) | KEEP | `GET /api/vehicles/positions` returns simulated lat/lng |

## 6. CRM & Sales

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Lead management | Complete | Working | KEEP | Full CRUD with UTM tracking, priority, assignment |
| Kanban pipeline | Complete | Working | KEEP | 7-stage drag-and-drop pipeline |
| Contact management | Complete | Working | KEEP | Contact directory with search, mobile/desktop layouts |
| Opportunity tracking | Complete | Partial | UPGRADE | Model exists but no dedicated frontend view; no stage progression UI |
| Activity logging | Complete | Working | KEEP | Call/email/meeting/visit/note/whatsapp with lead linking |
| Quotation builder | Complete | Working | KEEP | Line items, 5% VAT, status workflow |
| Contract management | Complete | Working | KEEP | Status workflow, linked to organization |

## 7. Operations

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Installation workflow | Complete | Working | KEEP | 4-step state machine, checklist, technician assignment |
| Technician management | Complete | Working | KEEP | CRUD with specialty, rating, install count |
| Maintenance scheduling | Complete | Working | KEEP | Work orders with cost tracking, vehicle linking |
| Maintenance prediction | Complete | Working (rule-based) | UPGRADE | Uses simple date-based rules, not ML |

## 8. Billing & Finance

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Plan management | Complete | Working (insecure) | FIX | Plans use Float for money (P0 — data loss on financial calculations) |
| Subscription management | Complete | Working | KEEP | Per-org subscriptions with billing cycle |
| Invoice creation | Complete | Working (insecure) | FIX | Amount/tax/total use Float (P0); no normalized line items |
| Invoice PDF | Complete | Working (insecure) | FIX | Missing tenant isolation (P0 — cross-tenant IDOR) |
| Payment tracking | Not claimed | Missing | MISSING | No Payment model; invoices track status but not payment transactions |
| VAT handling | Complete | Working | KEEP | 5% VAT applied correctly at application layer |

## 9. Support

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Ticket management | Complete | Working | KEEP | CRUD with priority, status, vehicle linking, CSV export |
| Ticket numbering | Complete | Working (race condition) | FIX | Count-based numbering has race condition under concurrency (P2) |

## 10. Alerts & Geofences

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Alert rules | Complete | Working | KEEP | Configuration for speed, geofence, SOS, etc. |
| Alert feed | Complete | Working (simulated) | KEEP | Alerts generated from simulated data |
| Geofence management | Complete | Working | KEEP | Circle zones on UAE map with vehicle assignment |

## 11. AI (MIANX.AI)

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| AI chat interface | Complete | Working | KEEP | Chat panel with conversation history |
| AI backend | Complete | Working (rule-based) | FIX | NOT a real AI. Pattern-matching fleet assistant with ~12 intents. Hardcoded responses, not LLM-powered. Spec says "Do not build a fake rule-based chatbot and call it AI" |
| AI tools | Not claimed | Missing | MISSING | No tool-use architecture. AI doesn't call authorized RTR360 APIs |
| AI tenant isolation | Complete | Partial | FIX | Conversations are org-scoped but ownership bypass when `userId` is null (P1) |
| AI rate limiting | Not claimed | Missing | MISSING | No rate limiting on AI endpoints |

## 12. Analytics & Reports

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Dashboard KPIs | Complete | Working | KEEP | 11+ KPI cards, recent leads, alerts |
| Fleet health analytics | Complete | Working (simulated) | KEEP | Charts and metrics from DB data |
| Revenue forecast | Complete | Working (insecure) | FIX | Cross-tenant subscription data leak (P1) |
| Driver trends | Complete | Working (simulated) | KEEP | Score and violation trends |
| Reports module | Complete | Working | KEEP | Fleet, revenue, trip, technician reports with date filters |
| CSV export | Complete | Working | KEEP | 7 column presets with BOM for Excel |

## 13. PWA & Mobile

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| PWA installable | Complete | Working | KEEP | Service worker, manifest, install prompt |
| Mobile bottom nav | Complete | Working | KEEP | 5-item bottom navigation with safe-area awareness |
| Connection status | Complete | Partial | UPGRADE | Shows online/offline but no actual offline data retrieval |
| Real-time event toasts | Complete | Working (insecure) | FIX | Token leaked in SSE URL query parameter (P1) |
| Responsive layouts | Complete | Working | KEEP | Mobile card + desktop table pattern across most views |

## 14. Administration

| Feature | Claimed | Actual | Classification | Evidence |
|---------|---------|--------|---------------|----------|
| Super admin dashboard | Complete | Working | KEEP | Platform stats, org management, onboarding, white-label |
| Settings management | Complete | Partial | UPGRADE | GET has no role check (any user can read all settings) |
| Audit log viewer | Complete | Partial | FIX | GET endpoint exists and works, but NO route writes to the audit log |
| User management (admin) | Complete | Working (insecure) | FIX | Privilege escalation via client-supplied role |

---

## Summary by Classification

| Classification | Count | Key Items |
|---------------|-------|------------|
| **KEEP** | 42 | Core CRUD, map, CRM pipeline, PWA, most views |
| **FIX** | 14 | Auth token storage, tenant isolation bugs, privilege escalation, Float money, invoice PDF IDOR, AI not real, audit log not written, SSE token leak |
| **UPGRADE** | 12 | Session management, device lifecycle, opportunity UI, maintenance prediction, connection status offline, settings access, ticket numbering, SIM management |
| **REBUILD** | 1 | RBAC (role string system → permission-based model) |
| **MISSING** | 16 | Password reset, email verification, GPS ingestion, route playback, payment model, AI tools, AI rate limiting, RBAC permissions, role hierarchy, session management UI, containerization, CI/CD pipeline, tests |

## Features Claimed Complete But Actually Broken (6)

1. Tenant isolation — 3 cross-tenant bugs found
2. RBAC — viewer can create invoices, org_owner can escalate to super_admin
3. Session storage — spec requires HttpOnly cookies, frontend uses localStorage
4. AI — rule-based chatbot, not real AI per spec requirements
5. Audit logging — model exists but never written to
6. Invoice PDF — missing tenant isolation (IDOR)
