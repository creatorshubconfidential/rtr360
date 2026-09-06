-- ============================================================
-- P0-③ TIER 2 — RLS-SUBJECT APPLICATION ROLE + TENANT POLICIES
-- ============================================================
-- ⚠️  OPERATOR-GATED — DO NOT EXECUTE AUTOMATICALLY.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- RTR360 uses custom DB-backed session authentication (Session table +
-- requireAuth()). Supabase auth (auth.uid(), auth.jwt()) is NOT the
-- identity source, therefore auth.uid()-based policies CANNOT be used —
-- attempting it would map every request to NULL and either block the
-- app or create a false sense of security. This fact is documented in
-- docs/P0-3_RLS_DATABASE_SECURITY.md (Architecture verdict).
--
-- The application currently connects as the table owner (Supabase
-- `postgres` role), which is exempt from RLS. Tier 1 (migration
-- 20260906000000_p03_database_security_lockdown) closes the external
-- surface: anon/authenticated are deny-all.
--
-- Tier 2 adds defense-in-depth for the APPLICATION path itself:
-- a dedicated, non-owner database role that IS subject to RLS, with
-- transaction-local tenant context set by the application after
-- requireAuth() succeeds:
--
--     SET LOCAL rtr.org_id = '<organizationId>'
--     (SET LOCAL = transaction-scoped: cannot leak across pooled
--      connections; absent setting ⇒ policies evaluate NULL ⇒ deny.)
--
-- ROLLLOUT PRECONDITIONS (all mandatory, see runbook §Tier 2):
--   P1. Staging database available with a production-like snapshot.
--   P2. Application switched to wrap request queries in a transaction
--       that sets `SET LOCAL rtr.org_id` (app change — see below).
--   P3. Cross-tenant regression suite green against staging.
--   P4. Rollback path understood (DATABASE_URL revert + re-login check).
--
-- APPLICATION-SIDE CONTRACT (to be implemented before activating):
--   After requireAuth(), before the first query of the request:
--     await prisma.$transaction(async (tx) => {
--       if (user.organizationId) {
--         await tx.$executeRaw`SELECT set_config('rtr.org_id', ${user.organizationId}, true)`;
--       } else {
--         await tx.$executeRaw`SELECT set_config('rtr.org_id', '', true)`;
--       }
--       /* ...request queries against tx... */
--     });
--   super_admin / platform operations intentionally keep using the
--   privileged migration connection (DATABASE_URL) and are audited.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Dedicated application role (NOT a superuser, NOT table owner)
-- ------------------------------------------------------------
-- Set a strong password in production; never commit it.
-- Supabase pooler hostname: use the same project pooler as DATABASE_URL.
DO $$
BEGIN
  IF to_regrole('rtr_app') IS NULL THEN
    EXECUTE 'CREATE ROLE rtr_app LOGIN PASSWORD ''SET_BY_OPERATOR''';
    RAISE NOTICE 'Created role rtr_app — CHANGE THE PASSWORD BEFORE USE';
  END IF;
END $$;

-- Role hardening: connection + statement limits
ALTER ROLE rtr_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Grant connect/usage only (no object grants yet — explicit GRANTs below)
GRANT USAGE ON SCHEMA public TO rtr_app;

-- ------------------------------------------------------------
-- 2. Tenant-context helper functions (SECURITY DEFINER, locked down)
-- ------------------------------------------------------------
-- Reads the transaction-local setting. Returns NULL when absent
-- (fail-closed: NULL never equals a real organization id).
CREATE OR REPLACE FUNCTION public.rtr_current_org_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(current_setting('rtr.org_id', true), '');
$$;

-- True when the caller's tenant context matches the row's org id.
-- NULL org context ⇒ false ⇒ deny (fail-closed).
CREATE OR REPLACE FUNCTION public.rtr_org_matches(org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id IS NOT NULL
     AND org_id = NULLIF(current_setting('rtr.org_id', true), '');
$$;

REVOKE ALL ON FUNCTION public.rtr_current_org_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rtr_org_matches(text)   FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rtr_current_org_id() TO rtr_app;
GRANT  EXECUTE ON FUNCTION public.rtr_org_matches(text) TO rtr_app;

-- ------------------------------------------------------------
-- 3. Tenant-scoped table policies (direct organizationId columns)
-- ------------------------------------------------------------
-- Applied to: every table whose rows carry organization_id.
-- Only rtr_app gets object grants (owner keeps full access for
-- migrations/maintenance; service_role keeps platform access).
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Branch','Contact','Opportunity','Vehicle','Driver','Technician',
    'Installation','Geofence','AlertRule','Alert','MaintenanceRecord',
    'Subscription','Invoice','Quotation','Ticket','Contract','Document',
    'WebhookEndpoint','WebhookDelivery'
  ];
  tenant_nullable_tables text[] := ARRAY[
    'User','AuditLog','Lead','Activity','Device','SIM','Trip',
    'Notification','ApiKey','AIConversation','BackgroundJob'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS p03_tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY p03_tenant_isolation ON public.%I
        FOR ALL TO rtr_app
        USING (public.rtr_org_matches(organization_id::text))
        WITH CHECK (public.rtr_org_matches(organization_id::text))
    $f$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO rtr_app', t);
  END LOOP;

  -- Nullable organizationId columns: NULL rows are NEVER visible to
  -- rtr_app (fail-closed; warehouse devices/SIMs are managed via the
  -- privileged path or an explicit warehouse policy if product requires).
  FOREACH t IN ARRAY tenant_nullable_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS p03_tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY p03_tenant_isolation ON public.%I
        FOR ALL TO rtr_app
        USING (organization_id IS NOT NULL AND public.rtr_org_matches(organization_id::text))
        WITH CHECK (organization_id IS NOT NULL AND public.rtr_org_matches(organization_id::text))
    $f$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO rtr_app', t);
  END LOOP;

  RAISE NOTICE 'Tier 2: tenant policies installed on % tables',
    array_length(tenant_tables, 1) + array_length(tenant_nullable_tables, 1);
END $$;

-- ------------------------------------------------------------
-- 4. Tenant-derived: QuotationItem (org via quotation_id → Quotation)
-- ------------------------------------------------------------
ALTER TABLE public."QuotationItem" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p03_tenant_isolation ON public."QuotationItem";
CREATE POLICY p03_tenant_isolation ON public."QuotationItem"
  FOR ALL TO rtr_app
  USING (
    EXISTS (
      SELECT 1 FROM public."Quotation" q
      WHERE q.id = "QuotationItem".quotation_id
        AND public.rtr_org_matches(q.organization_id::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Quotation" q
      WHERE q.id = "QuotationItem".quotation_id
        AND public.rtr_org_matches(q.organization_id::text)
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public."QuotationItem" TO rtr_app;

-- ------------------------------------------------------------
-- 5. Global / control tables — read-only for rtr_app
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  global_readonly text[] := ARRAY['Plan','Setting'];
BEGIN
  FOREACH t IN ARRAY global_readonly LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO rtr_app', t);
  END LOOP;
END $$;

-- Session / RateLimitCounter / BackgroundJob platform paths:
-- Session lookup happens BEFORE tenant context exists (login), so it is
-- granted intentionally and narrowly: SELECT only (login reads, app never
-- writes sessions through rtr_app).
GRANT SELECT ON public."Session" TO rtr_app;
GRANT SELECT, UPDATE ON public."RateLimitCounter" TO rtr_app;

-- ------------------------------------------------------------
-- 6. Sequences (if any serial columns exist now or later)
-- ------------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rtr_app;

-- ------------------------------------------------------------
-- 7. FORCE RLS on identity-critical tables (owner included)
-- ------------------------------------------------------------
-- Session, ApiKey, User, AuditLog: even the OWNER must go through
-- policies on these tables. ⚠️ This affects the postgres role too:
-- enable ONLY after app smoke tests pass on staging, and only together
-- with owner policies (see §8). Kept separate so operators can adopt §1-6
-- without breaking maintenance paths.
-- ALTER TABLE public."Session"  FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public."ApiKey"   FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public."User"     FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public."AuditLog" FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 8. Owner-path policies (required IF §7 FORCE RLS is activated)
-- ------------------------------------------------------------
-- These give the postgres role full access when RLS is forced, keeping
-- migrations/maintenance functional while non-owner rtr_app stays scoped.
-- CREATE POLICY p03_owner_full_access ON public."Session"
--   FOR ALL TO postgres USING (true) WITH CHECK (true);
-- (repeat per table in §7)

-- ============================================================
-- END TIER 2 — after staging validation, run 20_verify_rls.sql
-- with MODE=tier2 (documented in runbook) before production.
-- ============================================================
