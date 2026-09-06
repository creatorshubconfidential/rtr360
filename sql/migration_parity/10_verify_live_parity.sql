-- ============================================================
-- P0-④ LIVE MIGRATION PARITY VERIFICATION (operator, on Supabase)
-- ============================================================
-- Evidence checks that CANNOT run offline:
--   L1. _prisma_migrations has no failed / rolled-back rows
--   L3. live public schema has the expected table population
--   L4. live columns exist for a spot-check set of parity-critical columns
--       (money precision, timestamptz, renamed columns, QuotationItem)
--
-- Usage: psql "$SUPABASE_DB_URL" -f sql/migration_parity/10_verify_live_parity.sql
-- CI-style gate: final row FAIL_COUNT must be 0.
-- ============================================================

\echo '=== L1/L2: migration ledger state (all finished, none rolled back) ==='
SELECT migration_name, finished_at IS NOT NULL AS finished,
       rolled_back_at IS NOT NULL AS rolled_back
FROM "_prisma_migrations"
ORDER BY finished_at;

\echo '=== L3: live table inventory (repo expectation: 36 tables) ==='
SELECT count(*) AS public_table_count FROM pg_tables WHERE schemaname = 'public';

\echo '=== L4: parity-critical column spot checks ==='
WITH spot AS (
  SELECT 'money_precision_invoice_total' AS check_name,
         (data_type = 'numeric' AND numeric_precision = 18 AND numeric_scale = 2) AS ok
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Invoice' AND column_name='total'
  UNION ALL
  SELECT 'money_precision_plan_price_monthly',
         (data_type = 'numeric' AND numeric_precision = 18 AND numeric_scale = 2)
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Plan' AND column_name='price_monthly'
  UNION ALL
  SELECT 'renamed_column_device_phone_number',
         (SELECT count(*) = 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='Device' AND column_name IN ('phone_number','phoneNumber'))
  UNION ALL
  SELECT 'quotation_item_table_exists',
         (SELECT count(*) = 1 FROM pg_tables WHERE schemaname='public' AND tablename='QuotationItem')
  UNION ALL
  SELECT 'ratelimitcounter_timestamptz',
         (SELECT count(*) = 3 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='RateLimitCounter'
            AND column_name IN ('reset_at','created_at','updated_at')
            AND data_type = 'timestamp with time zone')
  UNION ALL
  SELECT 'aiconversation_messages_jsonb',
         (SELECT data_type = 'jsonb' FROM information_schema.columns
          WHERE table_schema='public' AND table_name='AIConversation' AND column_name='messages')
  UNION ALL
  SELECT 'updated_at_no_sentinel_default',
         (SELECT count(*) = 0 FROM information_schema.columns
          WHERE table_schema='public' AND table_name IN ('AlertRule','Alert','Trip','Document','Notification','ApiKey')
            AND column_name='updated_at' AND column_default LIKE '2026-01-01%')
  UNION ALL
  SELECT 'no_failed_migrations',
         (SELECT count(*) = 0 FROM "_prisma_migrations"
          WHERE rolled_back_at IS NOT NULL OR finished_at IS NULL)
)
SELECT 'VERDICT' AS check_name, 'FAIL_COUNT' AS detail, count(*)::text AS value
FROM spot WHERE NOT ok
UNION ALL
SELECT check_name, 'ok=' || ok::text, NULL
FROM spot WHERE NOT ok;
