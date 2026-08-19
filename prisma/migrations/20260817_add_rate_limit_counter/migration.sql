-- Create RateLimitCounter table for distributed rate limiting
-- Replaces in-memory-only rate limiting with database-backed counters
-- that work across multiple serverless function instances.

CREATE TABLE "RateLimitCounter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "reset_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimitCounter_key_key" ON "RateLimitCounter"("key");
CREATE INDEX "RateLimitCounter_reset_at_idx" ON "RateLimitCounter"("reset_at");
