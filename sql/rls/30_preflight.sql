-- ============================================================
-- P0-③ RLS PREFLIGHT — run BEFORE applying the lockdown migration
-- ============================================================
-- Purpose: snapshot the current database security posture so the
-- operator (a) confirms the app connection path is safe for the
-- lockdown and (b) has a rollback reference.
-- Usage: psql "$DATABASE_URL" -f sql/rls/30_preflight.sql
-- ============================================================

\echo '=== PF1: current role (must be the table owner, e.g. postgres) ==='
SELECT current_user, session_user,
       rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
FROM pg_roles WHERE rolname = current_user;

\echo '=== PF2: who owns the public tables? (must include current_user) ==='
SELECT tableowner, count(*) AS tables_owned
FROM pg_tables WHERE schemaname='public'
GROUP BY tableowner ORDER BY tables_owned DESC;

\echo '=== PF3: current RLS state per table (expect mostly disabled pre-lockdown) ==='
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname='public'
ORDER BY tablename;

\echo '=== PF4: existing policies on public tables (expect none) ==='
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies WHERE schemaname='public';

\echo '=== PF5: current grants to anon/authenticated (rollback reference) ==='
SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
GROUP BY grantee, table_name
ORDER BY grantee, table_name;

\echo '=== PF6: storage buckets present (informational) ==='
SELECT CASE WHEN to_regclass('storage.buckets') IS NOT NULL
            THEN 'storage.buckets exists — check buckets:' END;
SELECT CASE WHEN to_regclass('storage.buckets') IS NULL THEN 'no storage schema (non-Supabase env)' END;
SELECT id, name, public FROM storage.buckets LIMIT 20;

\echo '=== PF7: active connections by role (who else is using the DB right now?) ==='
SELECT usename, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY usename ORDER BY connections DESC;

\echo '=== PF8: does any non-owner role hold grants? (surprises go here) ==='
SELECT grantee, count(*) AS grant_count
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee NOT IN (current_user, 'postgres')
GROUP BY grantee ORDER BY grant_count DESC;

\echo '=== PREFLIGHT COMPLETE — archive this output as the rollback reference ==='
