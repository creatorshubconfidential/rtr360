# RTR360 P2-16 — RLS Architecture Execution Plan

## Decision

**Do not enable RLS on production yet.** The live Supabase database currently has RLS disabled on all 34 public tables, and the Supabase security advisor reports this as a critical external security finding. However, RTR360 uses custom database-backed sessions and Prisma for server-side access, so blindly enabling RLS would either block the application or create an incomplete isolation model.

## Live evidence

- Supabase project: `rtr360`
- Project ref: `hwmvxjmdqkkupcirsjuw`
- Region: `ap-northeast-1`
- PostgreSQL: 17.6.1.155
- Public tables: 34
- RLS enabled: 0/34
- Public RLS policies: 0
- Supabase Security Advisor: `rls_disabled_in_public` critical/error findings
- `anon` and `authenticated` currently have broad table privileges on the public schema

## Architecture constraint

RTR360's application authentication is custom DB-backed session authentication. The session token is stored in the `Session` table and resolved to a `UserSession` containing `id`, `role`, and `organizationId`. The application database client is Prisma.

This means the normal Supabase policy pattern using `auth.uid()` is not currently the correct identity source. The RLS design must first establish a trusted PostgreSQL transaction context containing the authenticated application user and organization.

## Required target architecture

1. Keep route-level authentication and RBAC as the application authorization layer.
2. Add a database tenant-context mechanism that is set only after `requireAuth()` succeeds.
3. Establish `app.user_id` and `app.organization_id` as transaction-local settings using `set_config(..., true)` / `current_setting(...)`.
4. Ensure the Prisma request runs inside the same transaction in which tenant context is established.
5. Move protected application traffic to a database role that is subject to RLS (not a role that bypasses RLS).
6. Keep migrations, maintenance, and controlled service operations on a separate privileged path.
7. Add deny-by-default RLS policies and explicit organization predicates.
8. Add cross-tenant regression tests before production activation.

## Table classification

### Tenant-owned tables

Organization, Branch, Contact, Opportunity, Quotation, Contract, SIM, Driver, Device, Vehicle, Geofence, AlertRule, Alert, Technician, Installation, MaintenanceRecord, Subscription, Invoice, Ticket, Document, Webhook, Integration.

### Tenant-derived tables

Lead, Activity, Trip, Notification, AuditLog, WebhookDelivery, AIConversation. These require relationship-aware policies because some rows do not contain a non-null organization_id or derive tenant ownership through another relation.

### Global / control tables

Plan, Setting.

### Security-sensitive identity tables

User, Session, ApiKey.

These require special treatment and should never receive broad public CRUD policies.

## Production safety rule

The following generic remediation is intentionally **NOT executed**:

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
```

Enabling RLS without policies can immediately block legitimate access. Conversely, incorrect policies can create a false sense of security. The policy design must be deployed only after the application transaction-context implementation and isolation tests are complete.

## Security hardening candidate

Because the current architecture is server-side Prisma and the repository audit reports no Supabase client/PostgREST database usage, a separate hardening option is to revoke unnecessary `anon`/`authenticated` table privileges. This must be validated against every public API/client dependency before execution.

Candidate pattern (DO NOT RUN automatically):

```sql
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
```

This is a deliberate production change and must be validated against any Supabase REST, generated client, Storage integration, or other service that may depend on these roles.

## Required implementation tests

- Tenant A cannot SELECT Tenant B rows.
- Tenant A cannot UPDATE Tenant B rows.
- Tenant A cannot DELETE Tenant B rows.
- A user with organization_id NULL cannot access tenant-owned rows.
- Cross-tenant foreign-key IDs cannot be used to bypass policies.
- Session, ApiKey, and User data are never publicly readable.
- Webhook secrets are never publicly readable.
- WebhookDelivery is isolated through its Webhook → Organization relationship.
- AIConversation is isolated by user and/or organization according to product rules.
- Organization membership changes immediately affect database access.
- Privileged maintenance paths remain functional.
- Existing application tests and PostgreSQL integration tests remain green.

## Rollout sequence

1. Implement transaction-local tenant context in application code.
2. Introduce an RLS-subject application database role.
3. Add policies in a development/staging database.
4. Run cross-tenant security tests.
5. Run the full 832+ test suite and PostgreSQL integration suite.
6. Verify application smoke tests with RLS enabled in staging.
7. Apply production policies and enable RLS.
8. Re-run Supabase Security Advisor.
9. Verify all production API paths and background workers.
10. Record final evidence and change the production security verdict to GREEN only after successful verification.

## Current verdict

**YELLOW / NOT SAFE YET.**

The production database is healthy, but database-level tenant isolation is not currently enforced. No production RLS DDL was executed during P2-16.
