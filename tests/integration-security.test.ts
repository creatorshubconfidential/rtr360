/**
 * HTTP Integration & Security Regression Tests — RTR 360 Remediation
 *
 * Comprehensive static analysis tests covering:
 *   - Cross-tenant IDOR prevention
 *   - RBAC enforcement
 *   - Billing endpoint security
 *   - AI endpoint authorization
 *   - Setup endpoint production blocking (seed + seed-demo)
 *   - No hardcoded passwords
 *   - No runtime schema modifications
 *   - Distributed rate limiter (DB-backed)
 *   - Middleware security headers
 *   - SQL injection prevention
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Helper: read source file ───
function src(path: string): string {
  return readFileSync(join(__dirname, '..', 'src', path), 'utf-8');
}

// ════════════════════════════════════════════════════════════════
// Seed-demo: DATA ONLY (no schema sync)
// ════════════════════════════════════════════════════════════════
describe('Seed-demo: data-only, no runtime schema modifications', () => {
  const code = src('app/api/setup/seed-demo/route.ts');

  it('does not contain ALTER TABLE', () => {
    expect(code).not.toContain('ALTER TABLE');
  });

  it('does not contain $queryRawUnsafe', () => {
    expect(code).not.toContain('$queryRawUnsafe');
  });

  it('does not contain $executeRawUnsafe', () => {
    expect(code).not.toContain('$executeRawUnsafe');
  });

  it('does not contain information_schema', () => {
    expect(code).not.toContain('information_schema');
  });

  it('does not reference schemaSyncResult', () => {
    expect(code).not.toContain('schemaSyncResult');
  });

  it('does not reference schemaSync', () => {
    expect(code).not.toContain('schemaSync');
  });
});

// ════════════════════════════════════════════════════════════════
// Seed: DATA ONLY (no schema sync)
// ════════════════════════════════════════════════════════════════
describe('Seed: data-only, no runtime schema modifications', () => {
  const code = src('app/api/setup/seed/route.ts');

  it('does not contain ALTER TABLE', () => {
    expect(code).not.toContain('ALTER TABLE');
  });

  it('does not contain $queryRawUnsafe', () => {
    expect(code).not.toContain('$queryRawUnsafe');
  });

  it('does not contain $executeRawUnsafe', () => {
    expect(code).not.toContain('$executeRawUnsafe');
  });

  it('does not contain information_schema', () => {
    expect(code).not.toContain('information_schema');
  });
});

// ════════════════════════════════════════════════════════════════
// Seed-demo: Defense-in-depth production blocking
// ════════════════════════════════════════════════════════════════
describe('Seed-demo: defense-in-depth production blocking', () => {
  const code = src('app/api/setup/seed-demo/route.ts');

  it('checks NODE_ENV === production and returns 404', () => {
    expect(code).toContain("NODE_ENV === 'production'");
    expect(code).toContain('status: 404');
    expect(code).toContain('Not available in production');
  });

  it('requires authentication via requireAuth', () => {
    expect(code).toContain('requireAuth');
  });

  it('checks role is admin-only', () => {
    expect(code).toContain('super_admin');
    expect(code).toContain('org_owner');
    expect(code).toContain('platform_admin');
    expect(code).toContain('status: 403');
  });
});

// ════════════════════════════════════════════════════════════════
// Seed: Defense-in-depth production blocking
// ════════════════════════════════════════════════════════════════
describe('Seed: defense-in-depth production blocking', () => {
  const code = src('app/api/setup/seed/route.ts');

  it('checks NODE_ENV === production and returns 404', () => {
    expect(code).toContain("NODE_ENV === 'production'");
    expect(code).toContain('status: 404');
    expect(code).toContain('Not available in production');
  });

  it('requires authentication via requireAuth', () => {
    expect(code).toContain('requireAuth');
  });

  it('checks role is admin-only', () => {
    expect(code).toContain('super_admin');
    expect(code).toContain('platform_admin');
    expect(code).toContain('status: 403');
  });

  it('GET returns 405 (not a shortcut to POST)', () => {
    expect(code).toContain('status: 405');
    expect(code).toContain('Use POST with authentication');
  });
});

// ════════════════════════════════════════════════════════════════
// No predictable passwords in seed or source files
// ════════════════════════════════════════════════════════════════
describe('No predictable passwords in seed or source files', () => {
  const seedDemo = src('app/api/setup/seed-demo/route.ts');
  const seed = src('app/api/setup/seed/route.ts');

  it('seed-demo has no manager123', () => {
    expect(seedDemo).not.toContain('manager123');
  });

  it('seed-demo has no ops123', () => {
    expect(seedDemo).not.toContain('ops123');
  });

  it('seed-demo has no admin123', () => {
    expect(seedDemo).not.toContain('admin123');
  });

  it('seed-demo has no manager456', () => {
    expect(seedDemo).not.toContain('manager456');
  });

  it('seed-demo uses generateSecurePassword for all non-admin users', () => {
    expect(seedDemo).toContain('generateSecurePassword');
  });

  it('seed (initial) uses env var or crypto random, not hardcoded password', () => {
    expect(seed).toContain('SEED_PASSWORD');
    expect(seed).toContain('crypto.getRandomValues');
    expect(seed).not.toContain('admin123');
  });

  it('seed-demo has no password123', () => {
    expect(seedDemo).not.toContain('password123');
  });

  it('seed has no password123', () => {
    expect(seed).not.toContain('password123');
  });

  it('seed-demo has no test123', () => {
    expect(seedDemo).not.toContain('test123');
  });

  it('seed-demo has no demo123', () => {
    expect(seedDemo).not.toContain('demo123');
  });
});

// ════════════════════════════════════════════════════════════════
// Cross-tenant IDOR prevention on single-resource routes
// ════════════════════════════════════════════════════════════════
describe('IDOR: Cross-tenant access prevention on single-resource routes', () => {
  const resources = [
    { path: 'app/api/vehicles/[id]/route.ts', entity: 'vehicle' },
    { path: 'app/api/contacts/[id]/route.ts', entity: 'contact' },
    { path: 'app/api/invoices/[id]/route.ts', entity: 'invoice' },
    { path: 'app/api/quotations/[id]/route.ts', entity: 'quotation' },
    { path: 'app/api/tickets/[id]/route.ts', entity: 'ticket' },
    { path: 'app/api/drivers/[id]/route.ts', entity: 'driver' },
    { path: 'app/api/maintenance/[id]/route.ts', entity: 'maintenanceRecord' },
    { path: 'app/api/installations/[id]/route.ts', entity: 'installation' },
  ];

  for (const { path, entity } of resources) {
    describe(`${entity} (/${path})`, () => {
      let code: string;
      try {
        code = src(path);
      } catch {
        it.skip('file not found');
        return;
      }

      it('requires authentication', () => {
        expect(code).toContain('requireAuth');
      });

      it('checks tenant isolation for non-super_admin', () => {
        const hasOrgCheck =
          code.includes('organizationId') &&
          code.includes('user.organizationId') &&
          code.includes("user.role !== 'super_admin'");
        expect(hasOrgCheck).toBe(true);
      });

      it('returns 404 for cross-tenant access (not 403)', () => {
        expect(code).toContain('status: 404');
      });
    });
  }
});

// ════════════════════════════════════════════════════════════════
// RBAC on write endpoints
// ════════════════════════════════════════════════════════════════
describe('RBAC: All write routes enforce permissions', () => {
  const writeRoutes = [
    'app/api/vehicles/route.ts',
    'app/api/drivers/route.ts',
    'app/api/devices/route.ts',
    'app/api/leads/route.ts',
    'app/api/contacts/route.ts',
    'app/api/quotations/route.ts',
    'app/api/invoices/route.ts',
    'app/api/maintenance/route.ts',
    'app/api/installations/route.ts',
    'app/api/geofences/route.ts',
    'app/api/alert-rules/route.ts',
    'app/api/tickets/route.ts',
    'app/api/contracts/route.ts',
    'app/api/subscriptions/route.ts',
    'app/api/technicians/route.ts',
  ];

  for (const route of writeRoutes) {
    it(`${route}: requires requirePermission on POST`, () => {
      const code = src(route);
      expect(code, `${route} missing requirePermission`).toContain('requirePermission');
    });
  }
});

// ════════════════════════════════════════════════════════════════
// Billing endpoints — auth + tenant isolation
// ════════════════════════════════════════════════════════════════
describe('Billing: Invoice and subscription endpoints', () => {
  const invoicesList = src('app/api/invoices/route.ts');
  const invoiceDetail = src('app/api/invoices/[id]/route.ts');
  const invoicePdf = src('app/api/invoices/[id]/pdf/route.ts');

  it('GET /api/invoices requires auth', () => {
    expect(invoicesList).toContain('requireAuth');
  });

  it('GET /api/invoices scopes by organizationId', () => {
    expect(invoicesList).toContain('user.organizationId');
  });

  it('GET /api/invoices/:id checks tenant isolation', () => {
    expect(invoiceDetail).toContain('organizationId');
    expect(invoiceDetail).toContain("user.role !== 'super_admin'");
  });

  it('GET /api/invoices/:id/pdf checks tenant isolation', () => {
    expect(invoicePdf).toContain('invoice.organizationId');
    expect(invoicePdf).toContain('user.organizationId');
    expect(invoicePdf).toContain('status: 404');
  });

  it('POST /api/invoices requires INVOICES_MANAGE', () => {
    expect(invoicesList).toContain('INVOICES_MANAGE');
  });
});

// ════════════════════════════════════════════════════════════════
// AI endpoint — auth + org scoping
// ════════════════════════════════════════════════════════════════
describe('AI: Chat endpoint security', () => {
  const chatCode = src('app/api/ai/chat/route.ts');
  const convCode = src('app/api/ai/conversations/[id]/route.ts');

  it('POST /api/ai/chat requires authentication', () => {
    expect(chatCode).toContain('requireAuth');
  });

  it('POST /api/ai/chat uses rate limiting', () => {
    expect(chatCode).toContain('checkRateLimit');
  });

  it('POST /api/ai/chat awaits rate limit (async)', () => {
    expect(chatCode).toContain('await checkRateLimit');
  });

  it('POST /api/ai/chat stores organizationId', () => {
    expect(chatCode).toContain('organizationId');
  });

  it('GET /api/ai/conversations/:id checks tenant isolation', () => {
    expect(convCode).toContain('conversation.organizationId');
    expect(convCode).toContain('user.organizationId');
  });
});

// ════════════════════════════════════════════════════════════════
// Setup endpoints — production blocked
// ════════════════════════════════════════════════════════════════
describe('Setup endpoints: production blocking', () => {
  const middleware = src('middleware.ts');
  const seedDemo = src('app/api/setup/seed-demo/route.ts');
  const seed = src('app/api/setup/seed/route.ts');

  it('middleware blocks /api/setup/seed in production', () => {
    expect(middleware).toContain("'/api/setup/seed'");
  });

  it('middleware blocks /api/setup/seed-demo in production', () => {
    expect(middleware).toContain("'/api/setup/seed-demo'");
  });

  it('middleware blocks /api/migrate in production', () => {
    expect(middleware).toContain("'/api/migrate'");
  });

  it('middleware blocks /api/debug in production', () => {
    expect(middleware).toContain("'/api/debug'");
  });

  it('seed-demo has application-level NODE_ENV check', () => {
    expect(seedDemo).toContain("NODE_ENV === 'production'");
  });

  it('seed has application-level NODE_ENV check', () => {
    expect(seed).toContain("NODE_ENV === 'production'");
  });

  it('seed-demo has application-level requireAuth', () => {
    expect(seedDemo).toContain('requireAuth');
  });

  it('seed has application-level requireAuth', () => {
    expect(seed).toContain('requireAuth');
  });

  it('middleware returns 404 for blocked paths', () => {
    expect(middleware).toContain('status: 404');
  });
});

// ════════════════════════════════════════════════════════════════
// SQL injection: No raw unsafe queries in application code
// ════════════════════════════════════════════════════════════════
describe('SQL injection: No raw unsafe queries in API routes', () => {
  const dirs = [
    'app/api/vehicles', 'app/api/drivers', 'app/api/devices',
    'app/api/invoices', 'app/api/contacts', 'app/api/leads',
    'app/api/quotations', 'app/api/maintenance', 'app/api/trips',
    'app/api/analytics', 'app/api/ai', 'app/api/reports',
    'app/api/dashboard', 'app/api/realtime', 'app/api/setup/seed-demo',
    'app/api/setup/seed',
  ];

  it('no $queryRawUnsafe in any API route', () => {
    for (const dir of dirs) {
      let code = '';
      try { code = src(`${dir}/route.ts`); } catch { continue; }
      expect(code, `${dir}/route.ts uses $queryRawUnsafe`).not.toContain('$queryRawUnsafe');
    }
  });

  it('no $executeRawUnsafe in any API route', () => {
    for (const dir of dirs) {
      let code = '';
      try { code = src(`${dir}/route.ts`); } catch { continue; }
      expect(code, `${dir}/route.ts uses $executeRawUnsafe`).not.toContain('$executeRawUnsafe');
    }
  });
});

// ════════════════════════════════════════════════════════════════
// Rate limiter: distributed (DB-backed) production readiness
// ════════════════════════════════════════════════════════════════
describe('Rate limiter: distributed (DB-backed) production readiness', () => {
  const code = src('lib/rate-limit.ts');

  it('exports rateLimit function', () => {
    expect(code).toContain('export async function rateLimit');
  });

  it('exports checkRateLimit middleware helper', () => {
    expect(code).toContain('export async function checkRateLimit');
  });

  it('rateLimit is async (returns Promise)', () => {
    expect(code).toContain('export async function rateLimit');
  });

  it('checkRateLimit is async (returns Promise)', () => {
    expect(code).toContain('export async function checkRateLimit');
  });

  it('uses database (Prisma) as L2 store', () => {
    expect(code).toContain('db.rateLimitCounter');
  });

  it('uses upsert for atomic counter operations', () => {
    expect(code).toContain('upsert');
  });

  it('validates IP format (rejects malformed headers)', () => {
    expect(code).toContain('/^');
    expect(code).toContain("return 'unknown'");
  });

  it('has automatic cleanup with bounded L1 cache', () => {
    expect(code).toContain('MAX_CACHE_SIZE');
    expect(code).toContain('cleanupTimer');
  });

  it('has unref on timer to allow Node.js exit', () => {
    expect(code).toContain('unref');
  });

  it('purges expired DB counters periodically', () => {
    expect(code).toContain('purgeExpiredDbCounters');
    expect(code).toContain('deleteMany');
  });

  it('documents Redis upgrade path', () => {
    expect(code).toContain('Redis');
  });

  it('has L1 in-memory cache for performance', () => {
    expect(code).toContain('L1');
    expect(code).toContain('L2');
  });
});

// ════════════════════════════════════════════════════════════════
// Rate limiter: all API routes use await checkRateLimit
// ════════════════════════════════════════════════════════════════
describe('Rate limiter: all API routes await checkRateLimit (async)', () => {
  const dirs = [
    'app/api/vehicles/route.ts', 'app/api/drivers/route.ts',
    'app/api/devices/route.ts', 'app/api/invoices/route.ts',
    'app/api/contacts/route.ts', 'app/api/leads/route.ts',
    'app/api/quotations/route.ts', 'app/api/maintenance/route.ts',
    'app/api/installations/route.ts', 'app/api/geofences/route.ts',
    'app/api/alert-rules/route.ts', 'app/api/tickets/route.ts',
    'app/api/contracts/route.ts', 'app/api/subscriptions/route.ts',
    'app/api/technicians/route.ts', 'app/api/notifications/route.ts',
    'app/api/settings/route.ts', 'app/api/activities/route.ts',
    'app/api/users/route.ts', 'app/api/trips/route.ts',
    'app/api/ai/chat/route.ts', 'app/api/auth/logout/route.ts',
  ];

  it('all routes using checkRateLimit also await it', () => {
    for (const route of dirs) {
      let code = '';
      try { code = src(route); } catch { continue; }
      if (code.includes('checkRateLimit(')) {
        expect(code, `${route} uses checkRateLimit without await`).toContain('await checkRateLimit(');
      }
    }
  });

  it('login route awaits rateLimiter.strict', () => {
    const code = src('app/api/auth/login/route.ts');
    expect(code).toContain('await rateLimiter.strict');
  });
});

// ════════════════════════════════════════════════════════════════
// Middleware: Security headers
// ════════════════════════════════════════════════════════════════
describe('Middleware: Security headers present', () => {
  const code = src('middleware.ts');

  it('sets Content-Security-Policy', () => {
    expect(code).toContain('Content-Security-Policy');
  });

  it('sets X-Frame-Options: DENY', () => {
    expect(code).toContain('X-Frame-Options');
    expect(code).toContain('DENY');
  });

  it('sets X-Content-Type-Options: nosniff', () => {
    expect(code).toContain('X-Content-Type-Options');
    expect(code).toContain('nosniff');
  });

  it('sets Strict-Transport-Security', () => {
    expect(code).toContain('Strict-Transport-Security');
    expect(code).toContain('max-age=31536000');
  });

  it('sets Referrer-Policy', () => {
    expect(code).toContain('Referrer-Policy');
  });

  it('sets Permissions-Policy', () => {
    expect(code).toContain('Permissions-Policy');
  });

  it('sets X-XSS-Protection', () => {
    expect(code).toContain('X-XSS-Protection');
  });
});

// ════════════════════════════════════════════════════════════════
// Prisma: RateLimitCounter model exists
// ════════════════════════════════════════════════════════════════
describe('Prisma: RateLimitCounter model for distributed rate limiting', () => {
  const schema = src('../prisma/schema.prisma');

  it('defines RateLimitCounter model', () => {
    expect(schema).toContain('model RateLimitCounter');
  });

  it('has unique key field', () => {
    expect(schema).toContain('key       String   @unique');
  });

  it('has count field', () => {
    expect(schema).toContain('count     Int');
  });

  it('has resetAt field', () => {
    expect(schema).toContain('resetAt   DateTime');
  });

  it('has index on resetAt for cleanup performance', () => {
    expect(schema).toContain('@@index([resetAt])');
  });
});

// ════════════════════════════════════════════════════════════════
// Prisma: Migration exists for RateLimitCounter
// ════════════════════════════════════════════════════════════════
describe('Prisma: Migration for RateLimitCounter', () => {
  const { existsSync, readFileSync: read } = require('fs');
  const { join: p } = require('path');
  const migrationPath = p(__dirname, '..', 'prisma', 'migrations', '20260817_add_rate_limit_counter', 'migration.sql');

  it('migration file exists', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('creates RateLimitCounter table', () => {
    const sql = read(migrationPath, 'utf-8');
    expect(sql).toContain('CREATE TABLE "RateLimitCounter"');
    expect(sql).toContain('CREATE UNIQUE INDEX "RateLimitCounter_key_key"');
    expect(sql).toContain('CREATE INDEX "RateLimitCounter_reset_at_idx"');
  });
});
