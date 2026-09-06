-- Keep QuotationItem aligned with the database security posture.
-- RLS is enabled on the other public application tables; this migration
-- closes the gap introduced when QuotationItem was created during schema reconciliation.
ALTER TABLE "QuotationItem" ENABLE ROW LEVEL SECURITY;
