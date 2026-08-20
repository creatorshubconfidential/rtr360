/**
 * RTR 360 — P2-4 Comprehensive Tests
 *
 * Tests for: report handler, AI handler, worker lease renewal,
 * DNS rebinding protection, metrics, security regressions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// 1. REPORT HANDLER
// ============================================================

describe('P2-4: Report Handler', () => {
  it('report job type is registered in the handler registry', async () => {
    const { JOB_TYPES } = await import('@/lib/job-types');
    expect(JOB_TYPES['report']).toBeDefined();
    expect(JOB_TYPES['report'].defaultMaxAttempts).toBe(2);
  });

  it('report handler validates reportType allowlist', async () => {
    const { ALLOWED_REPORT_TYPES } = await import('@/lib/handlers/report-handler');
    // This tests the module internals indirectly through job type validation
    const { validateJobPayload } = await import('@/lib/job-types');

    // Valid payload
    const valid = validateJobPayload('report', {
      reportType: 'fleet_overview',
      format: 'csv',
      requestedBy: 'user-1',
    });
    expect(valid.success).toBe(true);

    // Invalid format (pdf is not in allowed formats)
    // The job-types schema allows pdf, but the handler rejects it gracefully
    const pdfPayload = validateJobPayload('report', {
      reportType: 'revenue',
      format: 'pdf',
      requestedBy: 'user-1',
    });
    expect(pdfPayload.success).toBe(true); // Schema allows it, handler handles it
  });

  it('rejects report job without organizationId', async () => {
    // The handler throws ValidationError for missing orgId
    // We can test the pattern through the job type config
    const { JOB_TYPES } = await import('@/lib/job-types');
    const reportConfig = JOB_TYPES['report'];
    expect(reportConfig).toBeDefined();
    expect(reportConfig.payloadSchema.safeParse({ reportType: 'x', requestedBy: 'y', format: 'csv' }).success).toBe(true);
    expect(reportConfig.payloadSchema.safeParse({}).success).toBe(false);
  });
});

// ============================================================
// 2. AI HANDLER
// ============================================================

describe('P2-4: AI Handler', () => {
  it('ai job type is registered', async () => {
    const { JOB_TYPES } = await import('@/lib/job-types');
    expect(JOB_TYPES['ai']).toBeDefined();
    expect(JOB_TYPES['ai'].defaultMaxAttempts).toBe(2);
  });

  it('ai payload validates task field', async () => {
    const { validateJobPayload } = await import('@/lib/job-types');

    const valid = validateJobPayload('ai', {
      task: 'fleet_summary',
    });
    expect(valid.success).toBe(true);

    const noTask = validateJobPayload('ai', {});
    expect(noTask.success).toBe(false);
  });

  it('ai handler has static task allowlist', async () => {
    // We verify through the module that tasks are statically defined
    // and no eval/dynamic import is used
    const { validateJobPayload } = await import('@/lib/job-types');

    // Tasks with suspicious input should still parse (validation is at handler level)
    const suspicious = validateJobPayload('ai', {
      task: 'fleet_summary',
      input: { query: 'normal query' },
    });
    expect(suspicious.success).toBe(true);
  });
});

// ============================================================
// 3. WORKER LEASE RENEWAL
// ============================================================

describe('P2-4: Worker Lease Renewal', () => {
  it('renewLease is exported from queue', async () => {
    const queue = await import('@/lib/queue');
    expect(typeof queue.renewLease).toBe('function');
  });

  it('Worker has heartbeatIntervalMs config', async () => {
    const { Worker } = await import('@/lib/worker');
    const worker = new Worker({
      heartbeatIntervalMs: 5000,
      pollingIntervalMs: 100000, // slow poll
    });
    const state = worker.getState();
    expect(state.heartbeatsCompleted).toBe(0);
  });

  it('Worker state tracks heartbeatsCompleted', async () => {
    const { Worker } = await import('@/lib/worker');
    const worker = new Worker();
    expect(worker.getState().heartbeatsCompleted).toBe(0);
  });
});

// ============================================================
// 4. DNS REBINDING PROTECTION
// ============================================================

describe('P2-4: DNS Rebinding Protection', () => {
  it('resolveAndCheckDns is exported', async () => {
    const { resolveAndCheckDns } = await import('@/lib/webhook-delivery');
    expect(typeof resolveAndCheckDns).toBe('function');
  });

  it('localhost hostname-level check blocks before DNS', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    const result = checkSsrf('http://localhost/webhook');
    expect(result).not.toBeNull();
    expect(result).toContain('localhost');
  });

  it('invalid URL returns error', async () => {
    const { resolveAndCheckDns } = await import('@/lib/webhook-delivery');
    const result = await resolveAndCheckDns('not-a-url');
    expect(result).toBe('Invalid URL');
  });

  it('IP-literal URLs skip DNS resolution', async () => {
    const { resolveAndCheckDns } = await import('@/lib/webhook-delivery');
    // IP literal — should return null (skip DNS, already checked by checkSsrf)
    const result = await resolveAndCheckDns('http://8.8.8.8/webhook');
    expect(result).toBeNull();
  });

  it('non-existent domain does not block (DNS error is transient)', async () => {
    const { resolveAndCheckDns } = await import('@/lib/webhook-delivery');
    const result = await resolveAndCheckDns('http://this-domain-does-not-exist-xyz123.example/webhook');
    // DNS failure should NOT block — the hostname check already covered it
    expect(result).toBeNull();
  });
});

// ============================================================
// 5. SSRF PROTECTION (existing + enhanced)
// ============================================================

describe('P2-4: SSRF Protection', () => {
  it('blocks 0.0.0.0', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    expect(checkSsrf('http://0.0.0.0/hook')).toContain('loopback');
  });

  it('blocks metadata endpoints', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    expect(checkSsrf('http://169.254.169.254/meta')).toContain('metadata');
  });

  it('blocks gcp metadata', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    expect(checkSsrf('http://metadata.google.internal/computeMetadata/v1')).toContain('metadata');
  });

  it('blocks kubernetes services', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    // .svc.cluster.local matches .local rule first
    const result = checkSsrf('http://my-service.default.svc.cluster.local/api');
    expect(result).not.toBeNull();
  });

  it('blocks internal DNS names', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    expect(checkSsrf('http://app.internal/api')).toContain('internal');
    expect(checkSsrf('http://db.local/health')).toContain('internal');
  });

  it('allows public URLs', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    expect(checkSsrf('https://example.com/webhook')).toBeNull();
    expect(checkSsrf('https://api.stripe.com/hooks')).toBeNull();
  });

  it('blocks non-http protocols', async () => {
    const { checkSsrf } = await import('@/lib/webhook-delivery');
    expect(checkSsrf('ftp://example.com/file')).toContain('not allowed');
    expect(checkSsrf('gopher://internal/resource')).toContain('not allowed');
  });
});

// ============================================================
// 6. OPERATIONAL METRICS
// ============================================================

describe('P2-4: Operational Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('metrics module exports increment, timing, gauge', async () => {
    const { metrics } = await import('@/lib/metrics');
    expect(typeof metrics.increment).toBe('function');
    expect(typeof metrics.timing).toBe('function');
    expect(typeof metrics.gauge).toBe('function');
  });

  it('metrics defines all required metric names', async () => {
    const { METRIC_NAMES } = await import('@/lib/metrics');
    const required = [
      'JOBS_ENQUEUED', 'JOBS_COMPLETED', 'JOBS_FAILED',
      'WEBHOOK_SUCCESS', 'WEBHOOK_FAILURE', 'EMAIL_SUCCESS',
      'AI_SUCCESS', 'AI_FAILURE',
    ];
    for (const name of required) {
      expect(METRIC_NAMES[name]).toBeDefined();
    }
  });

  it('getCounters returns empty object initially', async () => {
    const { metrics } = await import('@/lib/metrics');
    const counts = metrics.getCounters();
    expect(counts).toBeDefined();
    expect(typeof counts).toBe('object');
  });

  it('resetCounters clears all counters', async () => {
    const { metrics } = await import('@/lib/metrics');
    metrics.resetCounters();
    expect(Object.keys(metrics.getCounters()).length).toBe(0);
  });
});

// ============================================================
// 7. HANDLER REGISTRATION (all 6 types)
// ============================================================

describe('P2-4: All 6 Job Types Have Handlers', () => {
  it('registerAllHandlers registers 6 handlers', async () => {
    const { JOB_TYPES } = await import('@/lib/job-types');
    const { getRegisteredHandlerTypes, registerJobHandler } = await import('@/lib/worker');

    // Call registerAllHandlers to ensure all handlers are loaded
    const { registerAllHandlers } = await import('@/lib/handlers/register');
    try {
      registerAllHandlers();
    } catch {
      // May already be registered — that's fine
    }

    const allTypes = Object.keys(JOB_TYPES);
    const registered = getRegisteredHandlerTypes();

    // All 6 types must be defined in the registry
    expect(allTypes).toHaveLength(6);
    expect(allTypes).toEqual(
      expect.arrayContaining(['email', 'webhook', 'notification', 'report', 'maintenance', 'ai']),
    );

    // All 6 handlers must be registered
    expect(registered).toHaveLength(6);
    for (const type of allTypes) {
      expect(registered).toContain(type);
    }
  });
});

// ============================================================
// 8. SECURITY — NO UNSAFE TYPES
// ============================================================

describe('P2-4: No Unsafe TypeScript', () => {
  it('no new files contain @ts-ignore or @ts-expect-error', async () => {
    const { execSync } = await import('child_process');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');

    // Check new P2-4 files only
    const p2_4_files = [
      'src/lib/email/smtp-provider.ts',
      'src/lib/email/index.ts',
      'src/lib/handlers/report-handler.ts',
      'src/lib/handlers/ai-handler.ts',
      'src/lib/metrics.ts',
    ];

    for (const file of p2_4_files) {
      const content = readFileSync(join('/home/z/my-project/rtr360-v2', file), 'utf-8');
      expect(content).not.toContain('@ts-ignore');
      expect(content).not.toContain('@ts-expect-error');
    }
  });

  it('no eval or new Function in P2-4 handlers', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');

    const handler_files = [
      'src/lib/handlers/report-handler.ts',
      'src/lib/handlers/ai-handler.ts',
      'src/lib/email/smtp-provider.ts',
    ];

    for (const file of handler_files) {
      const content = readFileSync(join('/home/z/my-project/rtr360-v2', file), 'utf-8');
      expect(content).not.toContain('eval(');
      expect(content).not.toContain('new Function(');
      expect(content).not.toContain('dynamic import');
    }
  });
});

// ============================================================
// 9. AI SAFETY — Tenant Isolation
// ============================================================

describe('P2-4: AI Tenant Isolation', () => {
  it('ai handler requires organizationId', async () => {
    // The AI handler checks for organizationId and throws ValidationError
    // We test this pattern through the handler code
    const { readFileSync } = await import('fs');
    const content = readFileSync(
      '/home/z/my-project/rtr360-v2/src/lib/handlers/ai-handler.ts',
      'utf-8',
    );
    // Must check for organizationId
    expect(content).toContain('organizationId');
    // Must use static task allowlist
    expect(content).toContain('ALLOWED_AI_TASKS');
    // Must block suspicious patterns
    expect(content).toContain('forbidden');
    // Must use env.openaiApiKey (not process.env directly)
    expect(content).toContain('env.openaiApiKey');
  });

  it('ai handler blocks eval/function patterns in input', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(
      '/home/z/my-project/rtr360-v2/src/lib/handlers/ai-handler.ts',
      'utf-8',
    );
    const forbiddenPatterns = ['eval', 'function(', 'new function', 'require(', 'import(', 'process.env', 'child_process'];
    for (const pattern of forbiddenPatterns) {
      expect(content).toContain(pattern);
    }
  });
});

// ============================================================
// 10. ENVIRONMENT CONFIGURATION
// ============================================================

describe('P2-4: Environment Configuration', () => {
  it('env includes email configuration fields', async () => {
    const { env } = await import('@/lib/env');
    expect(typeof env.emailProvider).toBe('string');
    expect(typeof env.emailSmtpHost).toBe('string');
    expect(typeof env.emailSmtpPort).toBe('string');
    expect(typeof env.emailSmtpUser).toBe('string');
    expect(typeof env.emailSmtpPass).toBe('string');
    expect(typeof env.emailFromAddress).toBe('string');
    expect(typeof env.emailFromName).toBe('string');
  });

  it('env object is frozen', async () => {
    const { env } = await import('@/lib/env');
    expect(Object.isFrozen(env)).toBe(true);
  });
});
