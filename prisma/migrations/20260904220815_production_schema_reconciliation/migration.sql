-- RTR360 production schema reconciliation
-- Applied to production Supabase on 2026-09-04 22:08 UTC.
-- QuotationItem was defined in Prisma but missing from production, causing P2021 on /api/quotations.
-- This migration is intentionally additive and idempotent.

CREATE TABLE IF NOT EXISTS "QuotationItem" (
  "id" text NOT NULL,
  "quotation_id" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "description" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" numeric NOT NULL,
  CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuotationItem_quotation_id_idx"
  ON "QuotationItem"("quotation_id");

DO $$ BEGIN
  ALTER TABLE "QuotationItem"
    ADD CONSTRAINT "QuotationItem_quotation_id_fkey"
    FOREIGN KEY ("quotation_id") REFERENCES "Quotation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
