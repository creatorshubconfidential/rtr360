-- ============================================================
-- P0-③ EMERGENCY ROLLBACK — ONLY IF the app is broken post-lockdown
-- ============================================================
-- ⚠️  RE-OPENS the Supabase PostgREST surface. Use only to restore
-- service during an incident, then re-apply the lockdown and fix root
-- cause. Every execution MUST be recorded in the incident log.
--
-- Root-cause triage FIRST (most likely causes of app breakage):
--   1. App connects as a NON-owner role  → PF1/PF2 in 30_preflight.sql
--      Fix properly: connect as owner, or adopt Tier 2 policies
--      (sql/rls/10_tier2_tenant_policies.sql) for that role.
--   2. A product path needs PostgREST/anon access that we did not know
--      about → document it, then add an EXPLICIT, tenant-scoped policy
--      instead of full rollback.
-- ============================================================

-- Step 1: re-grant schema usage (restores PostgREST reachability)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Step 2: re-grant table/sequence privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Step 3 (optional, most invasive): disable RLS again
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
--   LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;

-- Step 4: verify app recovers (health endpoint + login + one tenant page)
-- Step 5: re-apply prisma/migrations/20260906000000_p03_database_security_lockdown
--         and run sql/rls/20_verify_rls.sql (FAIL_COUNT must be 0)
