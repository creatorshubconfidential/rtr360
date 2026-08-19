-- P2 Enterprise Infrastructure: Background Jobs & Webhooks
-- Adds tables for async job processing and webhook delivery tracking.

-- CreateTable: BackgroundJob
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "result" JSONB,
    "idempotency_key" TEXT UNIQUE,
    "organization_id" TEXT,
    "user_id" TEXT,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "run_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BackgroundJob_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: WebhookEndpoint
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: WebhookDelivery
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "status_code" INTEGER,
    "response" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(3),
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WebhookDelivery_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: BackgroundJob
CREATE INDEX "BackgroundJob_type_status_idx" ON "BackgroundJob"("type", "status");
CREATE INDEX "BackgroundJob_status_priority_run_at_idx" ON "BackgroundJob"("status", "priority", "run_at");
CREATE INDEX "BackgroundJob_organization_id_idx" ON "BackgroundJob"("organization_id");
CREATE INDEX "BackgroundJob_created_at_idx" ON "BackgroundJob"("created_at");

-- CreateIndex: WebhookEndpoint
CREATE INDEX "WebhookEndpoint_organization_id_idx" ON "WebhookEndpoint"("organization_id");
CREATE INDEX "WebhookEndpoint_active_idx" ON "WebhookEndpoint"("active");

-- CreateIndex: WebhookDelivery
CREATE UNIQUE INDEX "WebhookDelivery_endpoint_id_event_id_key" ON "WebhookDelivery"("endpoint_id", "event_id");
CREATE INDEX "WebhookDelivery_status_next_retry_at_idx" ON "WebhookDelivery"("status", "next_retry_at");
CREATE INDEX "WebhookDelivery_organization_id_idx" ON "WebhookDelivery"("organization_id");
CREATE INDEX "WebhookDelivery_event_type_idx" ON "WebhookDelivery"("event_type");
CREATE INDEX "WebhookDelivery_created_at_idx" ON "WebhookDelivery"("created_at");