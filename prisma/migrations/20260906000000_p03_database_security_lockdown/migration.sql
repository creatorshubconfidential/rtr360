-- ============================================================
-- P0-③ DATABASE SECURITY LOCKDOWN — Tier 1 (fail-closed)
-- ============================================================
-- Purpose:
--   Close the Supabase PostgREST / Data API attack surface.
--   The application authenticates via its own DB-backed session layer
--   (custom cookie sessions resolved by requireAuth()) and talks to the
--   database exclusively through Prisma as a privileged role.
--   The anon / authenticated PostgREST roles are therefore NEVER a
--   legitimate data path. This migration enforces fail-closed denial:
--
--   1. ENABLE ROW LEVEL SECURITY on every table in schema public
--      (idempotent; dynamic loop also covers tables added later).
--      With RLS enabled and ZERO permissive policies, every
--      non-owner role gets deny-all by PostgreSQL semantics.
--   2. REVOKE all table/sequence/schema-usage/function privileges from
--      anon, authenticated and PUBLIC. Defense in depth: even if a
--      permissive policy were added by mistake later, missing grants
--      still block access.
--   3. ALTER DEFAULT PRIVILEGES so future tables/sequences are NOT
--      re-exposed to anon/authenticated.
--   4. Lock down Supabase Storage (storage.objects) for anon/authenticated.
--      The application has no Supabase Storage client; operator dashboard
--      access uses service_role and remains unaffected.
--
-- Safety properties:
--   * Idempotent — safe to re-run (ENABLE/REVOKE are idempotent).
--   * Portable — every optional object (anon/authenticated roles,
--     storage schema) is guarded with to_regrole/to_regclass so the
--     migration also runs on plain PostgreSQL (CI, local dev).
--   * Non-breaking for the app — the application role is the table
--     owner; owners are exempt from RLS unless FORCE RLS is used
--     (this migration deliberately does NOT use FORCE RLS).
--     Tenant isolation for the application path is enforced at the
--     data layer (see src/lib/tenant.ts + P0-①/P0-② test matrix).
--   * No destructive statements — no data is read, modified or dropped.
--
-- Verification: sql/rls/20_verify_rls.sql  (must report FAIL_COUNT = 0)
-- Preflight:    sql/rls/30_preflight.sql   (run BEFORE deploying)
-- Runbook:      docs/P0-3_RLS_DATABASE_SECURITY.md
-- Tier 2 (optional RLS-subject app role + GUC tenant context):
--               sql/rls/10_tier2_tenant_policies.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enable RLS on every table in schema public (dynamic, idempotent)
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  enabled_count int := 0;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    enabled_count := enabled_count + 1;
  END LOOP;
  RAISE NOTICE 'P0-3 lockdown: RLS enabled on % table(s) (others already enabled)', enabled_count;
END $$;

-- ------------------------------------------------------------
-- 2. Revoke PostgREST role privileges on schema public
-- ------------------------------------------------------------
DO $$
BEGIN
  -- PUBLIC pseudo-role (catch-all hardening)
  EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC';
  EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON SCHEMA public FROM PUBLIC';

  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon';
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
  END IF;

  RAISE NOTICE 'P0-3 lockdown: public schema privileges revoked from anon/authenticated/PUBLIC';
END $$;

-- ------------------------------------------------------------
-- 3. Default privileges: future objects start locked down
-- ------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC';

  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon';
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated';
  END IF;

  RAISE NOTICE 'P0-3 lockdown: default privileges locked for future objects';
END $$;

-- ------------------------------------------------------------
-- 4. Supabase Storage lockdown (guarded — optional schema)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE 'REVOKE ALL PRIVILEGES ON storage.objects FROM anon';
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE 'REVOKE ALL PRIVILEGES ON storage.objects FROM authenticated';
    END IF;
    EXECUTE 'REVOKE ALL PRIVILEGES ON storage.objects FROM PUBLIC';
    RAISE NOTICE 'P0-3 lockdown: storage.objects revoked from anon/authenticated/PUBLIC';
  ELSE
    RAISE NOTICE 'P0-3 lockdown: storage schema not present (non-Supabase environment) — skipped';
  END IF;
END $$;
