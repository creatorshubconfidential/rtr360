# RTR 360 — P2-3 Queue API Documentation

## Architecture

The queue system is built on PostgreSQL as the single source of truth.
Redis is optional for caching. Jobs are persisted in the `BackgroundJob` table
and processed by long-running workers using `SELECT FOR UPDATE SKIP LOCKED`.

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Queue Engine | `src/lib/queue.ts` | Enqueue, claim, complete, fail, retry, cancel, stats |
| Worker | `src/lib/worker.ts` | Polling loop, handler dispatch, graceful shutdown |
| Job Types | `src/lib/job-types.ts` | Static registry with Zod payload schemas |
| Email Handler | `src/lib/handlers/email-handler.ts` | Provider-agnostic email delivery |
| Notification Handler | `src/lib/handlers/notification-handler.ts` | In-app notification creation |
| Maintenance Handler | `src/lib/handlers/maintenance-handler.ts` | Static task allowlist execution |
| Webhook Handler | `src/lib/handlers/webhook-handler.ts` | Tenant-scoped webhook job processing |
| Handler Registry | `src/lib/handlers/register.ts` | Connects handlers to worker |
| Webhook Delivery | `src/lib/webhook-delivery.ts` | HTTP delivery, signing, SSRF protection |

## Endpoints

### POST /api/jobs

Enqueue a new background job.

**Auth**: Required + `JOBS_MANAGE` permission
**Rate Limit**: Strict tier (5/min)

Request body:
```json
{
  "type": "email",
  "payload": {
    "to": "user@example.com",
    "subject": "Invoice Created",
    "templateId": "invoice_created"
  },
  "priority": 5,
  "runAt": "2026-08-20T12:00:00Z",
  "maxAttempts": 3,
  "idempotencyKey": "invoice-123"
}
```

**NEVER accept from client**: `organizationId`, `userId`, `status`, `attempt`, `lockedBy`, `leasedUntil`, `completedAt`, `failedAt`, `id`, `createdAt`, `updatedAt`, `result`, `lastError`

**Server-derived fields**:
- `organizationId` from `session.user.organizationId`
- `userId` from `session.user.id`
- `requestId` from `x-request-id` header or generated

### GET /api/jobs

List jobs with pagination and filtering.

**Auth**: Required + `JOBS_MANAGE` permission

Query parameters:
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `status`: filter by job status (pending/processing/completed/failed/cancelled)
- `type`: filter by job type
- `from` / `to`: date range filter (ISO 8601)
- `sortBy`: allowlisted field (createdAt, updatedAt, priority, status, runAt, attempt, type)
- `sortOrder`: `asc` or `desc`

**Never exposed**: payload, result, lockedBy, leasedUntil, userId

### GET /api/jobs/[id]

Get a single job (tenant-scoped).

### POST /api/jobs/[id]/cancel

Cancel a pending or processing job.
Only cancellable states may be cancelled. Uses explicit state transition.

### POST /api/jobs/[id]/retry

Retry a failed or cancelled job.
Resets attempt count and schedules for immediate execution.

### GET /api/jobs/dead-letter

List permanently failed jobs for operational visibility.
Tenant-scoped, paginated.

## Permissions

The `JOBS_MANAGE` permission is required for all queue operations.

| Role | Has JOBS_MANAGE |
|------|-----------------|
| super_admin | Yes (wildcard `*`) |
| platform_admin | Yes |
| org_owner | Yes |
| operations_manager | No |
| sales_manager | No |
| fleet_manager | No |
| dispatcher | No |
| viewer | No |

## Tenant Isolation

- `organizationId` is ALWAYS derived from the authenticated session.
- Never from the request body (mass-assignment protection).
- Super admins may operate across all tenants per existing RBAC.
- All queries include `organizationId` filter for non-super_admin users.
- Job handlers enforce tenant boundaries (e.g., notification handler verifies user org membership).

## Job Lifecycle

```
PENDING → (worker claims) → PROCESSING → (success) → COMPLETED
                                   ↓ (transient failure + retries remain)
                                   PENDING (retry scheduled)
                                   ↓ (permanent failure OR max attempts reached)
                                   FAILED
PENDING/PROCESSING → (cancel request) → CANCELLED → (retry request) → PENDING
```

## Retry Behavior

- Exponential backoff: `min(1000ms * 2^attempt + jitter, 3600000ms)`
- Permanent errors (validation, auth, tenant): fail immediately
- Transient errors (network, 5xx, 429): retry up to maxAttempts
- Default maxAttempts per type: email=3, webhook=5, notification=2, report=2, maintenance=1, ai=2

## Webhook Delivery

### Signing
- HMAC-SHA256 signature over `timestamp.payload`
- Headers: `X-Webhook-Signature`, `X-Webhook-Timestamp`, `X-Webhook-Event-Id`
- Timestamp tolerance: 5 minutes (replay protection)
- Constant-time signature verification

### SSRF Protection

Blocked targets:
- localhost, 127.0.0.1, 0.0.0.0, ::1, ::
- 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
- 169.254.0.0/16 (link-local + metadata)
- Cloud metadata: 169.254.169.254, metadata.google.internal, *.metadata.azure.com
- IPv6 private: fc00::/7, fe80::/10
- Internal DNS: *.local, *.internal, *.localhost
- Kubernetes: *.svc.cluster.local, kubernetes.default
- Non-HTTP protocols (ftp, file, gopher, etc.)

Configuration:
- Timeout: 15 seconds
- Max payload: 512 KB
- Redirect policy: error (no follow)

### Known Limitations
- DNS rebinding is not fully preventable at the application level.
  A DNS name that initially resolves to a public IP but later resolves to
  a private IP after the SSRF check could bypass this protection.
  DNS pinning at the infrastructure level (e.g., DNS resolver rules) is
  recommended as a defense-in-depth measure.

### Delivery State Tracking

Uses `WebhookDelivery` table:
- Idempotency via `(endpointId, eventId)` unique constraint
- Status tracking: pending → delivered/failed
- Response code and body captured (truncated to 2KB)
- Retry via `retryFailedDeliveries()`

## Environment Variables

```env
# Optional: Email Provider
EMAIL_PROVIDER=smtp
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=
EMAIL_FROM_ADDRESS=
EMAIL_FROM_NAME=RTR 360
```

## Monitoring

### Structured Log Events

Every queue lifecycle event includes: `jobId`, `jobType`, `organizationId`, `workerId`, `attempt`, `requestId`, `durationMs`

Events:
- `job.enqueued`, `job.claimed`, `job.started`, `job.completed`
- `job.retry_scheduled`, `job.failed`, `job.dead_lettered`, `job.cancelled`
- `job.retry_requested`, `job.cross_tenant_access_attempt`
- `webhook.delivery_started`, `webhook.delivery_succeeded`, `webhook.delivery_failed`
- `webhook.ssrf_blocked`

### Secret Redaction

The logger automatically redacts fields matching: password, token, secret, apiKey, authorization, cookie, databaseUrl, redis, sentry, openai, sessionSecret, webhookSecret, signingSecret, emailSmtpPass, connectionString

## Dead Letter Retry

1. View dead-letter jobs: `GET /api/jobs/dead-letter`
2. Retry individual job: `POST /api/jobs/[id]/retry`
3. For webhooks: call `retryFailedDeliveries()` from the webhook delivery engine

## Failure Modes

| Failure | Behavior |
|---------|----------|
| Permanent error | Fail immediately, mark as FAILED |
| Transient + retries remain | Schedule retry with exponential backoff |
| Transient + max attempts | Fail, mark as FAILED |
| Worker crash | Lease expires, stale job recovery resets to PENDING |
| DB unavailable | Worker catches, logs, continues to next job |
| Redis unavailable | Queue works without Redis (graceful degradation) |
