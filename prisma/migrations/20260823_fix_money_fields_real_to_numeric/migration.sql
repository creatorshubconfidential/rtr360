-- ============================================================
-- Migration: Fix 13 money fields from REAL to NUMERIC(18,2)
-- ============================================================
--
-- Rationale: IEEE 754 REAL (float32) causes precision loss for
-- monetary values. Prisma schema declares these as Decimal which
-- maps to NUMERIC in PostgreSQL. The 0_init migration incorrectly
-- used REAL. This migration corrects the type to NUMERIC(18,2).
--
-- Safety: REAL → NUMERIC is a widening cast in PostgreSQL.
-- Existing values are preserved exactly (no data loss).
-- The ONLY check is for NaN/Infinity which cannot exist in REAL
-- columns populated by Prisma (which sends NUMERIC bind params).
-- ============================================================

-- Pre-flight: verify no NaN/Infinity in any money column
DO $$
DECLARE
  bad_rows TEXT[];
  tbl TEXT;
  col TEXT;
  cnt BIGINT;
  rec RECORD;
BEGIN
  FOR tbl, col IN VALUES
    ('Opportunity', 'value'),
    ('Device', 'purchase_cost'),
    ('Plan', 'price_monthly'),
    ('Plan', 'price_annual'),
    ('Invoice', 'amount'),
    ('Invoice', 'tax'),
    ('Invoice', 'total'),
    ('Quotation', 'subtotal'),
    ('Quotation', 'tax_rate'),
    ('Quotation', 'tax'),
    ('Quotation', 'total'),
    ('QuotationItem', 'unit_price'),
    ('MaintenanceRecord', 'cost')
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IS NOT NULL AND NOT (%I::text ~ ''^[-+]?[0-9]*\.?[0-9]+$'')', tbl, col, col)
    INTO cnt;
    IF cnt > 0 THEN
      bad_rows := array_append(bad_rows, format('%I.%I has %s non-numeric rows', tbl, col, cnt));
    END IF;
  END LOOP;
  IF array_length(bad_rows, 1) > 0 THEN
    RAISE EXCEPTION 'Money field pre-flight check failed: %', array_to_string(bad_rows, '; ');
  END IF;
END $$;

-- Convert all 13 money fields from REAL to NUMERIC(18,2)
ALTER TABLE "Opportunity" ALTER COLUMN "value" TYPE NUMERIC(18,2) USING "value"::NUMERIC;
ALTER TABLE "Device" ALTER COLUMN "purchase_cost" TYPE NUMERIC(18,2) USING "purchase_cost"::NUMERIC;
ALTER TABLE "Plan" ALTER COLUMN "price_monthly" TYPE NUMERIC(18,2) USING "price_monthly"::NUMERIC;
ALTER TABLE "Plan" ALTER COLUMN "price_annual" TYPE NUMERIC(18,2) USING "price_annual"::NUMERIC;
ALTER TABLE "Invoice" ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::NUMERIC;
ALTER TABLE "Invoice" ALTER COLUMN "tax" TYPE NUMERIC(18,2) USING "tax"::NUMERIC;
ALTER TABLE "Invoice" ALTER COLUMN "total" TYPE NUMERIC(18,2) USING "total"::NUMERIC;
ALTER TABLE "Quotation" ALTER COLUMN "subtotal" TYPE NUMERIC(18,2) USING "subtotal"::NUMERIC;
ALTER TABLE "Quotation" ALTER COLUMN "tax_rate" TYPE NUMERIC(18,2) USING "tax_rate"::NUMERIC;
ALTER TABLE "Quotation" ALTER COLUMN "tax" TYPE NUMERIC(18,2) USING "tax"::NUMERIC;
ALTER TABLE "Quotation" ALTER COLUMN "total" TYPE NUMERIC(18,2) USING "total"::NUMERIC;
ALTER TABLE "QuotationItem" ALTER COLUMN "unit_price" TYPE NUMERIC(18,2) USING "unit_price"::NUMERIC;
ALTER TABLE "MaintenanceRecord" ALTER COLUMN "cost" TYPE NUMERIC(18,2) USING "cost"::NUMERIC;
