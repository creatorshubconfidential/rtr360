-- ============================================================
-- P0-③ RLS VERIFICATION — run AFTER applying the lockdown
-- ============================================================
-- Usage (Supabase SQL editor or psql as postgres):
--     psql "$DATABASE_URL" -f sql/rls/20_verify_rls.sql
-- Output: one FAILED row per violated check, then a final verdict row.
-- Exit semantics for CI: FAIL_COUNT must be 0.
--   (CI hint: pipe through `grep -q 'FAIL_COUNT | 0'`)
-- ============================================================

WITH checks AS (
  -- C1: every public table has RLS enabled
  SELECT 'C1_RLS_ENABLED_ALL_PUBLIC_TABLES' AS check_id,
         tablename AS object_name,
         CASE WHEN rowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
  FROM pg_tables WHERE schemaname = 'public'

  UNION ALL
  -- C2: zero permissive policies granted to anon/authenticated on public tables
  SELECT 'C2_NO_POLICIES_FOR_POSTGREST_ROLES',
         schemaname || '.' || tablename,
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (roles::text ILIKE '%anon%' OR roles::text ILIKE '%authenticated%')
  GROUP BY schemaname, tablename

  UNION ALL
  -- C3: anon has no table privileges in public schema
  SELECT 'C3_ANON_ZERO_TABLE_PRIVILEGES',
         table_name,
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'anon'
  GROUP BY table_name

  UNION ALL
  -- C4: authenticated has no table privileges in public schema
  SELECT 'C4_AUTHENTICATED_ZERO_TABLE_PRIVILEGES',
         table_name,
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'authenticated'
  GROUP BY table_name

  UNION ALL
  -- C5: PUBLIC has no table privileges in public schema
  SELECT 'C5_PUBLIC_ZERO_TABLE_PRIVILEGES',
         table_name,
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'PUBLIC'
  GROUP BY table_name

  UNION ALL
  -- C6: anon has no schema USAGE on public
  SELECT 'C6_ANON_NO_SCHEMA_USAGE',
         'public',
         CASE WHEN has_schema_privilege('anon', 'public', 'USAGE')
              THEN 'FAIL' ELSE 'PASS' END

  UNION ALL
  -- C7: authenticated has no schema USAGE on public
  SELECT 'C7_AUTHENTICATED_NO_SCHEMA_USAGE',
         'public',
         CASE WHEN has_schema_privilege('authenticated', 'public', 'USAGE')
              THEN 'FAIL' ELSE 'PASS' END

  UNION ALL
  -- C8: identity tables have RLS enabled (redundant with C1 but explicit)
  SELECT 'C8_IDENTITY_TABLES_RLS', t.tablename,
         CASE WHEN t.rowsecurity THEN 'PASS' ELSE 'FAIL' END
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename IN ('User', 'Session', 'ApiKey', 'AuditLog')

  UNION ALL
  -- C9: anon/authenticated cannot read Session table (session hijack path)
  SELECT 'C9_SESSION_TABLE_LOCKED',
         'Session',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
           WHERE table_schema='public' AND table_name='Session'
             AND grantee IN ('anon','authenticated','PUBLIC')
             AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
         ) THEN 'FAIL' ELSE 'PASS' END

  UNION ALL
  -- C10: anon/authenticated cannot read ApiKey table (credential theft path)
  SELECT 'C10_APIKEY_TABLE_LOCKED',
         'ApiKey',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
           WHERE table_schema='public' AND table_name='ApiKey'
             AND grantee IN ('anon','authenticated','PUBLIC')
             AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
         ) THEN 'FAIL' ELSE 'PASS' END

  UNION ALL
  -- C11: storage.objects locked for anon/authenticated (guarded)
  SELECT 'C11_STORAGE_OBJECTS_LOCKED',
         'storage.objects',
         CASE
           WHEN to_regclass('storage.objects') IS NULL THEN 'PASS'  -- non-Supabase env
           WHEN EXISTS (
             SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='storage' AND table_name='objects'
               AND grantee IN ('anon','authenticated','PUBLIC')
               AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
           ) THEN 'FAIL' ELSE 'PASS'
         END

  UNION ALL
  -- C12: application connection is the table owner (RLS-exempt path intact)
  SELECT 'C12_APP_ROLE_IS_OWNER',
         current_user,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_tables t
           JOIN pg_roles r ON r.rolname = t.tableowner
           WHERE t.schemaname='public' AND r.rolname = current_user
         ) THEN 'PASS' ELSE 'FAIL' END
)
SELECT check_id, object_name, result
FROM checks
WHERE result = 'FAIL'
UNION ALL
SELECT 'VERDICT', 'FAIL_COUNT', count(*)::text
FROM checks WHERE result = 'FAIL';
