# RTR 360 — P2-4 Production Workers

## Overview

P2-4 completes the missing production capabilities for the background job system:
production email provider, report and AI job handlers, worker reliability hardening,
DNS-based webhook protection, and operational metrics.

## Email Provider

### Architecture

- **Interface**: `EmailProvider` (in `email-handler.ts`)
- **Implementation**: `SmtpEmailProvider` (in `email/smtp-provider.ts`)
- **Pattern**: Registration via `registerEmailProvider()` at startup
- **Default**: `NoopEmailProvider` (logs only, used in dev/test)

### SMTP Provider

- Uses nodemailer when installed (`npm install nodemailer`)
- Falls back gracefully with a permanent error when nodemailer is missing
- 30s timeout per send
- Error classification: auth failures (535) → permanent, network errors → transient
- Never logs passwords, tokens, or API keys

### Environment Variables

```
EMAIL_PROVIDER=smtp
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-user
EMAIL_SMTP_PASS=your-password
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=RTR 360
```

### Setup

```typescript
import { registerEmailProvider, SmtpEmailProvider } from '@/lib/email';
registerEmailProvider(new SmtpEmailProvider());
```

## Report Handler

### Supported Report Types

| Type | Description | Data Source |
|------|-------------|-------------|
| `fleet_overview` | Vehicle fleet summary | Vehicle table |
| `driver_performance` | Driver scores and trips | Driver table |
| `revenue` | Invoice revenue report | Invoice table |
| `maintenance` | Maintenance cost report | MaintenanceRecord table |
| `trips` | Trip distance/duration | Trip table |

### Format

- **CSV**: Fully implemented
- **XLSX**: Defined in schema, uses CSV for now
- **PDF**: Documented as blocked (known pdfkit module resolution issue)

### Query Bounds

All report queries are limited to 10,000 rows to prevent unbounded queries.
All queries are tenant-scoped via `organizationId`.

## AI Handler

### Supported Tasks

| Task | Description |
|------|-------------|
| `fleet_summary` | Fleet overview analysis via OpenAI |
| `driver_analysis` | Driver performance batch analysis |

### Security

- Static task allowlist — no dynamic task execution
- Suspicious input pattern detection (blocks eval, Function, require, process.env, child_process)
- Tenant-isolated data access — organizationId required
- OpenAI API key from centralized env config, never from payload
- 60s timeout, 2048 max tokens, gpt-4o-mini model
- Auth failures (401/403) → permanent, rate limits (429) → transient

### Environment

```
OPENAI_API_KEY=sk-...
```

## Worker Lifecycle

### Lease Renewal

- `renewLease(jobId, workerId, leaseDurationMs)` extends the lease on a processing job
- Only the owning worker (lockedBy) can renew
- Returns false if job was recovered by another worker
- Called automatically by the heartbeat mechanism

### Heartbeat

- Configurable via `heartbeatIntervalMs` (default: 60,000ms = 1 min)
- Set to `0` to disable
- Renews leases on all active jobs each interval
- Tracks `heartbeatsCompleted` in worker state

### Graceful Shutdown

1. Sets `shutdownRequested` flag
2. Stops heartbeat timer
3. Stops polling timer
4. Waits up to 30s for active jobs to complete
5. Logs final statistics

## Webhook Security

### SSRF Protection (Two Layers)

1. **Hostname-level** (`checkSsrf`): Blocks known private hostnames, IPs, metadata endpoints, internal DNS names, Kubernetes service discovery
2. **DNS resolution** (`resolveAndCheckDns`): Resolves ALL A and AAAA records, blocks if ANY resolved IP is private

### Known Limitation

There is a TOCTOU (time-of-check-time-of-use) race between DNS resolution
and the actual HTTP connection. The fetch API does not allow pinning a
specific IP address while preserving TLS SNI. A fully complete solution
would require a custom HTTP client with IP-level connection control.

### Redirect Handling

`redirect: 'error'` — redirects are never followed. Any redirect response
results in a delivery failure.

## Operational Metrics

### Usage

```typescript
import { metrics, METRIC_NAMES } from '@/lib/metrics';
metrics.increment(METRIC_NAMES.JOBS_COMPLETED, { jobType: 'email' });
metrics.timing(METRIC_NAMES.JOB_DURATION_MS, 150, { jobType: 'webhook' });
metrics.gauge(METRIC_NAMES.QUEUE_DEPTH, 42);
```

### Available Metrics

Queue: `jobs_enqueued`, `jobs_claimed`, `jobs_completed`, `jobs_failed`,
`jobs_retried`, `jobs_dead_lettered`, `jobs_cancelled`, `job_duration_ms`

Webhook: `webhook_success`, `webhook_failure`, `webhook_retry`,
`webhook_latency`, `webhook_dns_blocked`

Email: `email_success`, `email_failure`, `email_retry`

AI: `ai_success`, `ai_failure`, `ai_timeout`

### Integration

Metrics are emitted as structured log entries with `metric` type.
No external monitoring dependency required. Integrate with
Sentry/APM by subscribing to these log events.

## Troubleshooting

### Email not sending

1. Verify nodemailer is installed: `npm ls nodemailer`
2. Check SMTP config in `.env`
3. Check logs for `[PERMANENT]` vs `[TRANSIENT]` errors

### AI jobs failing

1. Verify `OPENAI_API_KEY` is set
2. Check for `[PERMANENT] OpenAI authentication failed`
3. Check for `[TRANSIENT] OpenAI rate limit exceeded`

### PDF reports not working

This is a known infrastructure blocker (pdfkit module resolution issue).
Use CSV format as a workaround.

### Worker lease expiring

- Increase `leaseDurationMs` for long-running jobs
- Decrease `heartbeatIntervalMs` for more frequent renewals
- Check `worker.lease_renewal_skipped` logs for ownership conflicts
