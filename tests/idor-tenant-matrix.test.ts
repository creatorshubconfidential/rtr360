/**
 * P0-② — Cross-Tenant IDOR Behavioral Integration Matrix
 *
 * NOT a source-regex suite. Every test invokes the REAL route handler:
 *   request → requireAuth (persona injected) → requirePermission (REAL
 *   permission map) → tenant helpers (REAL src/lib/tenant.ts) → Prisma
 *   boundary (mocked spies). Assertions inspect the ACTUAL `where` clauses
 *   reaching the data layer and the ACTUAL HTTP status / write-call behavior.
 *
 * Personas:
 *   A      — org_owner of ORG_A  (full org RBAC, org-scoped tenant)
 *   B      — org_owner of ORG_B  (adversarial neighbor)
 *   NOORG  — org_owner role, organizationId: null (RBAC passes, tenant MUST fail closed)
 *   SA     — super_admin         (global bypass where explicitly permitted)
 *
 * Covering: GET list · GET/PATCH/DELETE /:id · POST create · search/filter ·
 * aggregate/KPI (dashboard/analytics) · export/report (reports/pdf) ·
 * realtime/SSE · background AI/report/notification/webhook jobs · setup locks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { join } from 'path';

// Must be set BEFORE any module imports '@/lib/env' (it snapshots process.env at load)
process.env.OPENAI_API_KEY = 'sk-test-dummy-not-a-real-key';

// ─── Prisma boundary: per-model spy registry (hoist-safe via globalThis) ───
type SpySet = Record<string, Mock>;

function registry(): Map<string, SpySet> {
  const g = globalThis as unknown as { __rtrIdorSpies?: Map<string, SpySet> };
  if (!g.__rtrIdorSpies) g.__rtrIdorSpies = new Map();
  return g.__rtrIdorSpies;
}

function modelSpies(model: string): SpySet {
  const key = model.toLowerCase();
  const reg = registry();
  let s = reg.get(key);
  if (!s) {
    s = {};
    for (const m of ['findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow', 'findFirstOrThrow']) {
      s[m] = vi.fn(async () => []);
    }
    s['count'] = vi.fn(async () => 0);
    s['aggregate'] = vi.fn(async () => ({ _sum: {}, _avg: {}, _min: {}, _max: {}, _count: 0 }));
    s['groupBy'] = vi.fn(async () => []);
    for (const m of ['updateMany', 'deleteMany', 'createMany']) {
      s[m] = vi.fn(async () => ({ count: 1 }));
    }
    s['create'] = vi.fn(async (a?: { data?: Record<string, unknown> }) => (a?.data ?? {}));
    s['update'] = vi.fn(async (a?: { data?: Record<string, unknown> }) => (a?.data ?? {}));
    s['upsert'] = vi.fn(async (a?: { data?: Record<string, unknown> }) => (a?.data ?? {}));
    s['delete'] = vi.fn(async () => ({}));
    reg.set(key, s);
  }
  return s;
}

vi.mock('@/lib/db', () => {
  const mkModel = (model: string): SpySet => modelSpies(model);
  return {
    db: new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === '$transaction') {
          return (arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg as Promise<unknown>[]) : (arg as () => unknown)();
        }
        if (prop === '$queryRaw' || prop === '$executeRaw' ||
            prop === '$queryRawUnsafe' || prop === '$executeRawUnsafe') {
          return vi.fn(async () => []);
        }
        if (prop === '$connect' || prop === '$disconnect') return vi.fn(async () => undefined);
        return mkModel(String(prop));
      },
    }),
  };
});

// ─── Auth boundary: persona injection (permission map stays REAL) ───
vi.mock('@/lib/auth', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/auth')>();
  return { ...orig, requireAuth: vi.fn() };
});

// ─── Peripheral boundaries: no-op ───
vi.mock('@/lib/rate-limit', () => ({
  // REAL contract: checkRateLimit returns NextResponse(429) when limited, null when allowed
  checkRateLimit: vi.fn(async () => null),
  perEndpointRateLimit: vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60000, remaining: 99 })),
  rateLimit: vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60000, remaining: 99 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
  rateLimiter: {},
}));
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(async () => ({})),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/logger', () => ({
  logger: new Proxy({}, { get: () => () => {} }),
  createRequestLogger: vi.fn(() => ({ info: () => {}, error: () => {}, warn: () => {} })),
}));

// ─── Personas ───
const ORG_A = 'org_aaaa';
const ORG_B = 'org_bbbb';

const asSession = (o: { id: string; role: string; organizationId: string | null }) => ({
  id: o.id,
  email: `${o.id}@test.io`,
  name: 'Persona',
  role: o.role,
  organizationId: o.organizationId,
});

const A = asSession({ id: 'u_a', role: 'org_owner', organizationId: ORG_A });
const B = asSession({ id: 'u_b', role: 'org_owner', organizationId: ORG_B });
const NOORG = asSession({ id: 'u_n', role: 'org_owner', organizationId: null });
const SA = asSession({ id: 'u_s', role: 'super_admin', organizationId: null });

async function asUser(u: typeof A): Promise<void> {
  const { requireAuth } = await import('@/lib/auth');
  (requireAuth as unknown as Mock).mockResolvedValue({ user: u, error: null });
}

async function asUnauthenticated(): Promise<void> {
  const { requireAuth } = await import('@/lib/auth');
  (requireAuth as unknown as Mock).mockResolvedValue({
    user: null,
    error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  });
}

// ─── HTTP helpers ───
const req = (method: string, path = '/api/x', body?: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const idCtx = (id = 'rec_b') => ({ params: Promise.resolve({ id }) });

type RouteHandler = (r: Request, ctx?: unknown) => Promise<Response>;
type RouteModule = Record<string, unknown>;

// Literal dynamic imports — Vite statically analyzes each string literal.
const ROUTE_LOADERS: Record<string, () => Promise<RouteModule>> = {
  'vehicles': () => import('@/app/api/vehicles/route'),
  'drivers': () => import('@/app/api/drivers/route'),
  'tickets': () => import('@/app/api/tickets/route'),
  'users': () => import('@/app/api/users/route'),
  'invoices': () => import('@/app/api/invoices/route'),
  'leads': () => import('@/app/api/leads/route'),
  'maintenance': () => import('@/app/api/maintenance/route'),
  'quotations': () => import('@/app/api/quotations/route'),
  'subscriptions': () => import('@/app/api/subscriptions/route'),
  'technicians': () => import('@/app/api/technicians/route'),
  'contracts': () => import('@/app/api/contracts/route'),
  'geofences': () => import('@/app/api/geofences/route'),
  'alert-rules': () => import('@/app/api/alert-rules/route'),
  'installations': () => import('@/app/api/installations/route'),
  'devices': () => import('@/app/api/devices/route'),
  'trips': () => import('@/app/api/trips/route'),
  'contacts': () => import('@/app/api/contacts/route'),
  'activities': () => import('@/app/api/activities/route'),
  'notifications': () => import('@/app/api/notifications/route'),
  'pipeline': () => import('@/app/api/pipeline/route'),
  'audit-logs': () => import('@/app/api/audit-logs/route'),
  'jobs': () => import('@/app/api/jobs/route'),
  'dashboard/stats': () => import('@/app/api/dashboard/stats/route'),
  'dashboard/alerts': () => import('@/app/api/dashboard/alerts/route'),
  'analytics/fleet-health': () => import('@/app/api/analytics/fleet-health/route'),
  'analytics/driver-trends': () => import('@/app/api/analytics/driver-trends/route'),
  'analytics/maintenance-prediction': () => import('@/app/api/analytics/maintenance-prediction/route'),
  'analytics/revenue-forecast': () => import('@/app/api/analytics/revenue-forecast/route'),
  'realtime/vehicles': () => import('@/app/api/realtime/vehicles/route'),
  'realtime/events': () => import('@/app/api/realtime/events/route'),
  'vehicles/[id]': () => import('@/app/api/vehicles/[id]/route'),
  'drivers/[id]': () => import('@/app/api/drivers/[id]/route'),
  'tickets/[id]': () => import('@/app/api/tickets/[id]/route'),
  'users/[id]': () => import('@/app/api/users/[id]/route'),
  'invoices/[id]': () => import('@/app/api/invoices/[id]/route'),
  'leads/[id]': () => import('@/app/api/leads/[id]/route'),
  'maintenance/[id]': () => import('@/app/api/maintenance/[id]/route'),
  'quotations/[id]': () => import('@/app/api/quotations/[id]/route'),
  'subscriptions/[id]': () => import('@/app/api/subscriptions/[id]/route'),
  'technicians/[id]': () => import('@/app/api/technicians/[id]/route'),
  'contracts/[id]': () => import('@/app/api/contracts/[id]/route'),
  'geofences/[id]': () => import('@/app/api/geofences/[id]/route'),
  'alert-rules/[id]': () => import('@/app/api/alert-rules/[id]/route'),
  'installations/[id]': () => import('@/app/api/installations/[id]/route'),
  'devices/[id]': () => import('@/app/api/devices/[id]/route'),
  'trips/[id]': () => import('@/app/api/trips/[id]/route'),
  'contacts/[id]': () => import('@/app/api/contacts/[id]/route'),
  'ai/conversations/[id]': () => import('@/app/api/ai/conversations/[id]/route'),
  'jobs/[id]': () => import('@/app/api/jobs/[id]/route'),
  'invoices/[id]/pdf': () => import('@/app/api/invoices/[id]/pdf/route'),
  'admin/organizations': () => import('@/app/api/admin/organizations/route'),
  'admin/platform-stats': () => import('@/app/api/admin/platform-stats/route'),
  'setup/seed': () => import('@/app/api/setup/seed/route'),
  'setup/seed-demo': () => import('@/app/api/setup/seed-demo/route'),
  'setup/init': () => import('@/app/api/setup/init/route'),
};

async function route(mod: string): Promise<Record<string, RouteHandler>> {
  const load = ROUTE_LOADERS[mod];
  if (!load) throw new Error(`No route loader registered for ${mod}`);
  return (await load()) as Record<string, RouteHandler>;
}

// ─── Where-capture helpers ───
function wheresOf(models: string[]): string[] {
  const out: string[] = [];
  for (const m of models) {
    const s = modelSpies(m);
    for (const method of ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']) {
      for (const call of s[method].mock.calls) {
        const w = (call[0] as { where?: unknown } | undefined)?.where;
        if (w !== undefined) out.push(JSON.stringify(w));
      }
    }
  }
  return out;
}

function lastWhereOf(model: string, method: string): Record<string, unknown> {
  const s = modelSpies(model)[method];
  const last = s.mock.calls[s.mock.calls.length - 1]?.[0] as { where?: Record<string, unknown> } | undefined;
  return last?.where ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  delete process.env.SETUP_INIT_KEY;
});

// ════════════════════════════════════════════════════════════════
// PART 2 — GET LIST MATRIX: every list endpoint × 4 personas
// ════════════════════════════════════════════════════════════════

interface ListCase {
  name: string;
  module: string;
  models: string[];        // models whose captured `where` clauses are inspected
  noorgContract?: 'fail-closed' | 'own-only';  // notifications: userId fallback is own-only (safe)
}

const LIST_CASES: ListCase[] = [
  { name: 'vehicles', module: 'vehicles', models: ['vehicle'] },
  { name: 'drivers', module: 'drivers', models: ['driver'] },
  { name: 'tickets', module: 'tickets', models: ['ticket'] },
  { name: 'users', module: 'users', models: ['user'] },
  { name: 'invoices', module: 'invoices', models: ['invoice'] },
  { name: 'leads', module: 'leads', models: ['lead'] },
  { name: 'maintenance', module: 'maintenance', models: ['maintenanceRecord'] },
  { name: 'quotations', module: 'quotations', models: ['quotation'] },
  { name: 'subscriptions', module: 'subscriptions', models: ['subscription'] },
  { name: 'technicians', module: 'technicians', models: ['technician'] },
  { name: 'contracts', module: 'contracts', models: ['contract'] },
  { name: 'geofences', module: 'geofences', models: ['geofence'] },
  { name: 'alert-rules', module: 'alert-rules', models: ['alertRule'] },
  { name: 'installations', module: 'installations', models: ['installation'] },
  { name: 'devices', module: 'devices', models: ['device'] },
  { name: 'trips', module: 'trips', models: ['trip'] },
  { name: 'contacts', module: 'contacts', models: ['contact'] },
  { name: 'activities', module: 'activities', models: ['activity', 'lead'] },
  { name: 'notifications', module: 'notifications', models: ['notification'], noorgContract: 'own-only' },
  { name: 'pipeline', module: 'pipeline', models: ['lead'] },
  { name: 'audit-logs', module: 'audit-logs', models: ['auditLog'] },
  { name: 'jobs', module: 'jobs', models: ['backgroundJob'] },
  { name: 'dashboard/stats (aggregate/KPI)', module: 'dashboard/stats', models: ['vehicle', 'driver', 'ticket', 'invoice'] },
  { name: 'dashboard/alerts', module: 'dashboard/alerts', models: ['alert'] },
  { name: 'analytics/fleet-health (aggregate/KPI)', module: 'analytics/fleet-health', models: ['vehicle'] },
  { name: 'analytics/driver-trends (aggregate/KPI)', module: 'analytics/driver-trends', models: ['driver'] },
  { name: 'analytics/maintenance-prediction (aggregate/KPI)', module: 'analytics/maintenance-prediction', models: ['maintenanceRecord', 'vehicle'] },
  { name: 'analytics/revenue-forecast (aggregate/KPI)', module: 'analytics/revenue-forecast', models: ['invoice'] },
  { name: 'realtime/vehicles (SSE)', module: 'realtime/vehicles', models: ['vehicle'] },
];

// realtime/events defers its FIRST prisma query by 8–15s inside the SSE stream,
// so it gets a dedicated fake-timer matrix below (not the generic LIST runner).
async function sseFirstTickWheres(module: string): Promise<string[]> {
  vi.useFakeTimers();
  try {
    const mod = await route(module);
    const res = await mod.GET(req('GET', `/api/${module}`));
    expect(res.status).toBe(200);
    await vi.advanceTimersByTimeAsync(0);      // flush stream start() + connected event
    await vi.advanceTimersByTimeAsync(16000);  // cross the first 8–15s deferred tick
    const ws = wheresOf(['vehicle']);
    try { await res.body?.cancel(); } catch { /* stream may be closed */ }
    return ws;
  } finally {
    vi.useRealTimers();
  }
}

describe('realtime/events (SSE, deferred tick)', () => {
  it('Organization A queries are scoped to ORG_A', async () => {
    await asUser(A);
    const ws = await sseFirstTickWheres('realtime/events');
    expect(ws.some((w) => w.includes(ORG_A))).toBe(true);
    expect(ws.some((w) => w.includes(ORG_B))).toBe(false);
  });

  it('Organization B queries are scoped to ORG_B', async () => {
    await asUser(B);
    const ws = await sseFirstTickWheres('realtime/events');
    expect(ws.some((w) => w.includes(ORG_B))).toBe(true);
    expect(ws.some((w) => w.includes(ORG_A))).toBe(false);
  });

  it('org-less user is fail-closed (__none__ filter)', async () => {
    await asUser(NOORG);
    const ws = await sseFirstTickWheres('realtime/events');
    expect(ws.some((w) => w.includes('__none__'))).toBe(true);
    expect(ws.some((w) => w.includes(ORG_A) || w.includes(ORG_B))).toBe(false);
  });

  it('super_admin bypasses org filter (global)', async () => {
    await asUser(SA);
    const ws = await sseFirstTickWheres('realtime/events');
    expect(ws.some((w) => w.includes(ORG_A) || w.includes(ORG_B) || w.includes('__none__'))).toBe(false);
  });
});

describe.each(LIST_CASES)('LIST $name', (c) => {
  it('Organization A sees only ORG_A data', async () => {
    await asUser(A);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET', `/api/${c.module}`));
    expect(res.status).toBe(200);
    if (c.name.includes('SSE')) {
      // prisma query runs inside ReadableStream.start() — give it a beat, then close stream
      await new Promise((r) => setTimeout(r, 120));
      try { await res.body?.cancel(); } catch { /* already closed */ }
    }
    const ws = wheresOf(c.models);
    expect(ws.length).toBeGreaterThan(0);
    expect(ws.some((w) => w.includes(ORG_A))).toBe(true);
    expect(ws.some((w) => w.includes(ORG_B))).toBe(false);
  });

  it('Organization B sees only ORG_B data', async () => {
    await asUser(B);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET', `/api/${c.module}`));
    expect(res.status).toBe(200);
    if (c.name.includes('SSE')) {
      await new Promise((r) => setTimeout(r, 120));
      try { await res.body?.cancel(); } catch { /* already closed */ }
    }
    const ws = wheresOf(c.models);
    expect(ws.some((w) => w.includes(ORG_B))).toBe(true);
    expect(ws.some((w) => w.includes(ORG_A))).toBe(false);
  });

  it('org-less user is denied or scoped to nothing (fail-closed contract)', async () => {
    await asUser(NOORG);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET', `/api/${c.module}`));
    if (c.name.includes('SSE')) {
      await new Promise((r) => setTimeout(r, 120));
      try { await res.body?.cancel(); } catch { /* already closed */ }
    }
    const ws = wheresOf(c.models);
    if (c.noorgContract === 'own-only') {
      // userId-scoped fallback: may only read rows bound to own user id
      expect(ws.some((w) => w.includes('u_n'))).toBe(true);
      expect(ws.some((w) => w.includes(ORG_A) || w.includes(ORG_B))).toBe(false);
    } else if (res.status === 200) {
      // empty-result path REQUIRES the impossible filter
      expect(ws.some((w) => w.includes('__none__'))).toBe(true);
      expect(ws.some((w) => w.includes(ORG_A) || w.includes(ORG_B))).toBe(false);
    } else {
      expect(res.status).toBe(403);
    }
  });

  it('super_admin bypasses org filter (global visibility where permitted)', async () => {
    await asUser(SA);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET', `/api/${c.module}`));
    expect(res.status).toBe(200);
    const ws = wheresOf(c.models);
    expect(ws.some((w) => w.includes(ORG_A) || w.includes(ORG_B) || w.includes('__none__'))).toBe(false);
  });
});

// ─── Search/filter must never strip the tenant scope ───
describe('search/filter tenant scope', () => {
  it('vehicles search+status keeps ORG_A scope', async () => {
    await asUser(A);
    const mod = await route('vehicles');
    await mod.GET(req('GET', '/api/vehicles?search=abc&status=active&vehicleType=sedan'));
    const where = lastWhereOf('vehicle', 'findMany');
    const w = JSON.stringify(where);
    expect(w).toContain(ORG_A);
    expect(w).toContain('abc');
    expect(w).toContain('active');
  });

  it('vehicles search keeps fail-closed scope for org-less user', async () => {
    await asUser(NOORG);
    const mod = await route('vehicles');
    await mod.GET(req('GET', '/api/vehicles?search=abc'));
    const w = JSON.stringify(lastWhereOf('vehicle', 'findMany'));
    expect(w).toContain('__none__');
    expect(w).not.toContain(ORG_A);
    expect(w).not.toContain(ORG_B);
  });
});

// ─── devices special business semantics (own org + warehouse unassigned) ───
describe('devices org + warehouse semantics', () => {
  it('org A sees own-org devices and warehouse-unassigned only', async () => {
    await asUser(A);
    const mod = await route('devices');
    const res = await mod.GET(req('GET', '/api/devices'));
    expect(res.status).toBe(200);
    const w = JSON.stringify(lastWhereOf('device', 'findMany'));
    expect(w).toContain(ORG_A);
    expect(w).toContain('warehouse');
  });

  it('org-less user gets no device data (fail-closed)', async () => {
    await asUser(NOORG);
    const mod = await route('devices');
    const res = await mod.GET(req('GET', '/api/devices'));
    const ws = wheresOf(['device']);
    if (res.status === 200) expect(ws.some((x) => x.includes('__none__'))).toBe(true);
    else expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════
// PART 3 — /:id MATRIX: GET/PATCH/DELETE × 4 personas (real handlers)
// ════════════════════════════════════════════════════════════════

interface IdCase {
  name: string;
  module: string;          // e.g. 'vehicles/[id]'
  model: string;
  fixture: Record<string, unknown>;
  patchBody?: Record<string, unknown>;
  verbs?: Array<'GET' | 'PATCH' | 'DELETE'>;
}

const baseRec = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'rec_b',
  organizationId: ORG_B,
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...extra,
});

const ID_CASES: IdCase[] = [
  { name: 'vehicles', module: 'vehicles/[id]', model: 'vehicle', fixture: baseRec({ plateNumber: 'B-1', make: 'M', model: 'X' }) },
  { name: 'drivers', module: 'drivers/[id]', model: 'driver', fixture: baseRec({ name: 'D', phone: '+971500000001' }) },
  { name: 'tickets', module: 'tickets/[id]', model: 'ticket', fixture: baseRec({ subject: 'S', priority: 'medium' }), patchBody: { subject: 'S2' } },
  { name: 'users', module: 'users/[id]', model: 'user', fixture: baseRec({ email: 'b@x.io', name: 'Ub', role: 'viewer' }), patchBody: { name: 'Ub2' } },
  { name: 'invoices', module: 'invoices/[id]', model: 'invoice', fixture: baseRec({ invoiceNumber: 'INV-1', total: 100, status: 'pending' }), patchBody: { notes: 'IDOR probe' } },
  { name: 'leads', module: 'leads/[id]', model: 'lead', fixture: baseRec({ name: 'L', phone: '+971500000002' }), patchBody: { status: 'contacted' } },
  { name: 'maintenance', module: 'maintenance/[id]', model: 'maintenanceRecord', fixture: baseRec({ type: 'oil_change' }), patchBody: { status: 'scheduled' } },
  { name: 'quotations', module: 'quotations/[id]', model: 'quotation', fixture: baseRec({ quoteNumber: 'Q-1', total: 200 }), patchBody: { status: 'draft' } },
  { name: 'subscriptions', module: 'subscriptions/[id]', model: 'subscription', fixture: baseRec({ status: 'active' }), patchBody: { status: 'active' } },
  { name: 'technicians', module: 'technicians/[id]', model: 'technician', fixture: baseRec({ name: 'T', phone: '+971500000003' }), patchBody: { name: 'T2' } },
  { name: 'contracts', module: 'contracts/[id]', model: 'contract', fixture: baseRec({ contractNumber: 'C-1' }), patchBody: { status: 'active' } },
  { name: 'geofences', module: 'geofences/[id]', model: 'geofence', fixture: baseRec({ name: 'G', type: 'circle' }), patchBody: { name: 'G2' } },
  { name: 'alert-rules', module: 'alert-rules/[id]', model: 'alertRule', fixture: baseRec({ name: 'AR', type: 'speed' }), patchBody: { name: 'AR2' } },
  { name: 'installations', module: 'installations/[id]', model: 'installation', fixture: baseRec({ status: 'scheduled', vehicleId: 'v1', technicianId: 't1' }), patchBody: { status: 'in_progress' } },
  { name: 'devices', module: 'devices/[id]', model: 'device', fixture: baseRec({ imei: '123456789012345' }), patchBody: { status: 'active' } },
  { name: 'trips (indirect: Vehicle→Trip)', module: 'trips/[id]', model: 'trip', fixture: baseRec({ vehicle: { organizationId: ORG_B } }), patchBody: { status: 'completed' } },
  { name: 'contacts', module: 'contacts/[id]', model: 'contact', fixture: baseRec({ name: 'C', phone: '+971500000004' }), patchBody: { name: 'C2' } },
  { name: 'ai-conversations', module: 'ai/conversations/[id]', model: 'aIConversation', fixture: baseRec({ messages: [] }), verbs: ['GET', 'DELETE'] },
  { name: 'jobs', module: 'jobs/[id]', model: 'backgroundJob', fixture: baseRec({ type: 'report', status: 'pending' }), verbs: ['GET'] },
  { name: 'invoices/[id]/pdf (export)', module: 'invoices/[id]/pdf', model: 'invoice', fixture: baseRec({
    invoiceNumber: 'INV-1', total: 100, subtotal: 90, taxAmount: 10,
    issueDate: new Date('2026-01-01T00:00:00Z'), dueDate: new Date('2026-02-01T00:00:00Z'),
    organization: { id: ORG_B, name: 'Org B', trn: 'TRN1' },
    subscription: { plan: { name: 'Premium' } },
    items: [], notes: null,
  }), verbs: ['GET'] },
];

function seedIdRead(model: string, fixture: Record<string, unknown>): void {
  const s = modelSpies(model);
  const impl = async (args?: { where?: Record<string, unknown> }) => {
    const w = JSON.stringify(args?.where ?? {});
    if (!w.includes('organizationId')) return fixture;   // global/by-id fetch (super_admin path)
    if (w.includes('__none__')) return null;             // org-less impossible filter
    const orgVal = fixture.organizationId as string | null;
    if (orgVal && w.includes(`"${orgVal}"`)) return fixture;
    return null;                                          // cross-org constraint
  };
  s.findUnique.mockImplementation(impl as never);
  s.findFirst.mockImplementation(impl as never);
  s.findUniqueOrThrow.mockImplementation(impl as never);
  s.findFirstOrThrow.mockImplementation(impl as never);
}

// Preload [id] route modules ONCE to discover which HTTP verbs each actually exports
// (many [id] routes intentionally have no GET — the list endpoint is the read surface).
const idVerbCache: Record<string, Set<string>> = {};
for (const c of ID_CASES) {
  const m = await route(c.module);
  idVerbCache[c.module] = new Set(Object.keys(m).filter((k) => ['GET', 'PATCH', 'DELETE'].includes(k)));
}
const withVerb = (v: 'GET' | 'PATCH' | 'DELETE') =>
  ID_CASES.filter((c) => (c.verbs ?? ['GET', 'PATCH', 'DELETE']).includes(v) && idVerbCache[c.module].has(v));

describe.each(withVerb('GET'))('GET $name', (c) => {
  it('Organization A cannot read ORG_B record', async () => {
    await asUser(A);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET'), idCtx());
    expect([403, 404]).toContain(res.status);
  });

  it('Organization B can read own record', async () => {
    await asUser(B);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET'), idCtx());
    expect(res.status).toBe(200);
  });

  it('org-less user denied (fail-closed)', async () => {
    await asUser(NOORG);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET'), idCtx());
    expect([403, 404]).toContain(res.status);
  });

  it('super_admin can read globally', async () => {
    await asUser(SA);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.GET(req('GET'), idCtx());
    expect(res.status).toBe(200);
  });
});

describe.each(withVerb('PATCH'))('PATCH $name', (c) => {
  it('Organization A cannot modify ORG_B record (write blocked)', async () => {
    await asUser(A);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.PATCH(req('PATCH', '/api/x', c.patchBody ?? { name: 'x' }), idCtx());
    expect([403, 404]).toContain(res.status);
    expect(modelSpies(c.model).update).not.toHaveBeenCalled();
    expect(modelSpies(c.model).updateMany).not.toHaveBeenCalled();
  });

  it('Organization B can modify own record', async () => {
    await asUser(B);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.PATCH(req('PATCH', '/api/x', c.patchBody ?? { name: 'x' }), idCtx());
    expect([200, 201, 204]).toContain(res.status);
    expect(modelSpies(c.model).update.mock.calls.length
      + modelSpies(c.model).updateMany.mock.calls.length).toBeGreaterThan(0);
  });

  it('org-less user cannot modify (fail-closed)', async () => {
    await asUser(NOORG);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.PATCH(req('PATCH', '/api/x', c.patchBody ?? { name: 'x' }), idCtx());
    expect([403, 404]).toContain(res.status);
    expect(modelSpies(c.model).update).not.toHaveBeenCalled();
  });

  it('super_admin can modify globally', async () => {
    await asUser(SA);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.PATCH(req('PATCH', '/api/x', c.patchBody ?? { name: 'x' }), idCtx());
    expect([200, 201, 204]).toContain(res.status);
    expect(modelSpies(c.model).update.mock.calls.length
      + modelSpies(c.model).updateMany.mock.calls.length).toBeGreaterThan(0);
  });
});

describe.each(withVerb('DELETE'))('DELETE $name', (c) => {
  it('Organization A cannot delete ORG_B record', async () => {
    await asUser(A);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.DELETE(req('DELETE'), idCtx());
    expect([403, 404]).toContain(res.status);
    expect(modelSpies(c.model).delete).not.toHaveBeenCalled();
    expect(modelSpies(c.model).deleteMany).not.toHaveBeenCalled();
  });

  it('Organization B can delete own record', async () => {
    await asUser(B);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.DELETE(req('DELETE'), idCtx());
    expect([200, 201, 204]).toContain(res.status);
    expect(modelSpies(c.model).delete.mock.calls.length
      + modelSpies(c.model).deleteMany.mock.calls.length).toBeGreaterThan(0);
  });

  it('org-less user cannot delete (fail-closed)', async () => {
    await asUser(NOORG);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.DELETE(req('DELETE'), idCtx());
    expect([403, 404]).toContain(res.status);
    expect(modelSpies(c.model).delete).not.toHaveBeenCalled();
  });

  it('super_admin can delete globally', async () => {
    await asUser(SA);
    seedIdRead(c.model, c.fixture);
    const mod = await route(c.module);
    const res = await mod.DELETE(req('DELETE'), idCtx());
    expect([200, 201, 204]).toContain(res.status);
  });
});

// ════════════════════════════════════════════════════════════════
// PART 4 — POST CREATE: client-supplied organizationId must never win
// ════════════════════════════════════════════════════════════════

interface PostCase { name: string; module: string; model: string; body: Record<string, unknown> }

const POST_CASES: PostCase[] = [
  { name: 'vehicles', module: 'vehicles', model: 'vehicle', body: { plateNumber: 'T-1', make: 'M', model: 'X', vehicleType: 'sedan' } },
  { name: 'drivers', module: 'drivers', model: 'driver', body: { name: 'D', phone: '+971500000010' } },
  { name: 'tickets', module: 'tickets', model: 'ticket', body: { subject: 'S', description: 'D', priority: 'medium' } },
  { name: 'users', module: 'users', model: 'user', body: { email: 'new@t.io', name: 'N', password: 'Str0ng!Passw0rd', role: 'viewer' } },
  { name: 'leads', module: 'leads', model: 'lead', body: { name: 'L', phone: '+971500000011', email: 'l@t.io' } },
  { name: 'maintenance', module: 'maintenance', model: 'maintenanceRecord', body: { vehicleId: 'v1', type: 'oil_change', description: 'd' } },
  { name: 'quotations', module: 'quotations', model: 'quotation', body: { leadId: 'l1', items: [] } },
  { name: 'subscriptions', module: 'subscriptions', model: 'subscription', body: { planId: 'p1', vehicleId: 'v1' } },
  { name: 'technicians', module: 'technicians', model: 'technician', body: { name: 'T', phone: '+971500000012' } },
  { name: 'contracts', module: 'contracts', model: 'contract', body: { customerId: 'c1', startDate: '2026-01-01' } },
  { name: 'geofences', module: 'geofences', model: 'geofence', body: { name: 'G', type: 'circle', center: { lat: 25.2, lng: 55.2 }, radius: 100 } },
  { name: 'alert-rules', module: 'alert-rules', model: 'alertRule', body: { name: 'AR', ruleType: 'speed', threshold: 120 } },
  { name: 'installations', module: 'installations', model: 'installation', body: { vehicleId: 'v1', technicianId: 't1' } },
  { name: 'devices', module: 'devices', model: 'device', body: { imei: '111122223333444' } },
  { name: 'trips', module: 'trips', model: 'trip', body: { vehicleId: 'v1', driverId: 'd1' } },
  { name: 'contacts', module: 'contacts', model: 'contact', body: { name: 'C', phone: '+971500000013' } },
];

describe.each(POST_CASES)('POST $name', (c) => {
  it('Organization A creation is bound to ORG_A even with attacker-supplied organizationId=ORG_B', async () => {
    await asUser(A);
    const mod = await route(c.module);
    const res = await mod.POST(req('POST', '/api/x', { ...c.body, organizationId: ORG_B }));
    const create = modelSpies(c.model).create;
    if (create.mock.calls.length > 0) {
      const data = (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(data.organizationId).toBe(ORG_A);
      expect(data.organizationId).not.toBe(ORG_B);
    } else {
      expect([200, 201]).not.toContain(res.status); // rejected → no record at all (safe)
    }
  });

  it('org-less user never creates a record bound to any real org', async () => {
    await asUser(NOORG);
    const mod = await route(c.module);
    await mod.POST(req('POST', '/api/x', { ...c.body, organizationId: ORG_B }));
    const create = modelSpies(c.model).create;
    if (create.mock.calls.length > 0) {
      const data = (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(data.organizationId).toBe('__none__'); // impossible-org or explicit rejection only
    }
  });
});

// ─── No bulk endpoints exist; per-id verbs are the only mutation surface ───
describe('bulk operations', () => {
  it('no bulk mutation routes exist (inventory assertion)', async () => {
    const { readdirSync, statSync } = await import('fs');
    const apiRoot = join(process.cwd(), 'src', 'app', 'api');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e === 'route.ts' && /bulk/i.test(p)) hits.push(p);
      }
    };
    walk(apiRoot);
    expect(hits).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════
// PART 5 — background processors: export/report · AI · notification · webhook
// ════════════════════════════════════════════════════════════════

const job = (o: Partial<Record<string, unknown>>) =>
  ({ id: 'j1', type: 'x', payload: {}, organizationId: null, userId: null, attempt: 1, maxAttempts: 3, priority: 5, lockedBy: null, requestId: null, ...o } as never);

describe('report-handler (export/report tenant boundary)', () => {
  it('rejects jobs without organizationId (fail-closed)', async () => {
    const { handleReportJob } = await import('@/lib/handlers/report-handler');
    await expect(handleReportJob(job({ organizationId: null, payload: { type: 'fleet_overview' } }))).rejects.toThrow();
  });

  it('fleet_overview queries are scoped to the job organization', async () => {
    const { handleReportJob } = await import('@/lib/handlers/report-handler');
    await handleReportJob(job({ organizationId: ORG_A, payload: { reportType: 'fleet_overview' } }));
    const ws = wheresOf(['vehicle', 'driver', 'trip', 'maintenanceRecord']);
    expect(ws.some((w) => w.includes(ORG_A))).toBe(true);
    expect(ws.some((w) => w.includes(ORG_B))).toBe(false);
  });

  it('revenue report queries are scoped to the job organization', async () => {
    const { handleReportJob } = await import('@/lib/handlers/report-handler');
    await handleReportJob(job({ organizationId: ORG_A, payload: { reportType: 'revenue' } }));
    const ws = wheresOf(['invoice']);
    expect(ws.some((w) => w.includes(ORG_A))).toBe(true);
  });
});

describe('ai-handler (AI tool/action tenant boundary)', () => {
  it('rejects jobs without organizationId (fail-closed)', async () => {
    const { handleAiJob } = await import('@/lib/handlers/ai-handler');
    await expect(handleAiJob(job({ organizationId: null, payload: { task: 'fleet_summary' } }))).rejects.toThrow();
  });

  it('fleet_summary reads vehicles strictly inside the job organization', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })));
    try {
      const { handleAiJob } = await import('@/lib/handlers/ai-handler');
      await handleAiJob(job({ organizationId: ORG_A, payload: { task: 'fleet_summary' } }));
      const ws = wheresOf(['vehicle']);
      expect(ws.some((w) => w.includes(ORG_A))).toBe(true);
      expect(ws.some((w) => w.includes(ORG_B))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('notification-handler tenant boundary', () => {
  it('rejects jobs without organizationId (fail-closed)', async () => {
    const { handleNotificationJob } = await import('@/lib/handlers/notification-handler');
    await expect(handleNotificationJob(job({ organizationId: null, payload: { userIds: ['u1'], title: 't' } }))).rejects.toThrow();
  });

  it('target users are validated against the JOB organization (cross-org notify blocked)', async () => {
    const { handleNotificationJob } = await import('@/lib/handlers/notification-handler');
    modelSpies('user').count.mockResolvedValueOnce(0); // 0 users of ORG_A match → cross-org attempt
    await expect(handleNotificationJob(job({ organizationId: ORG_A, payload: { userIds: ['u_b'], title: 't' } }))).rejects.toThrow();
  });

  it('created notifications carry the job organization', async () => {
    const { handleNotificationJob } = await import('@/lib/handlers/notification-handler');
    modelSpies('user').count.mockResolvedValueOnce(1);
    await handleNotificationJob(job({ organizationId: ORG_A, payload: { userIds: ['u_a'], title: 't' } }));
    const call = modelSpies('notification').createMany.mock.calls[0][0] as { data: unknown };
    expect(JSON.stringify(call.data)).toContain(ORG_A);
  });
});

describe('webhook-handler tenant boundary (Webhook → Organization)', () => {
  it('rejects jobs without organizationId (fail-closed guard)', async () => {
    const { handleWebhookJob } = await import('@/lib/handlers/webhook-handler');
    await expect(handleWebhookJob(job({ organizationId: null, payload: { endpointId: 'e1', eventType: 't' } }))).rejects.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════
// PART 6 — setup locks + platform admin boundary
// ════════════════════════════════════════════════════════════════

describe('setup endpoints stay locked', () => {
  it('setup/seed is production-blocked', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mod = await route('setup/seed');
      const res = await mod.POST(req('POST', '/api/setup/seed', {}));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(modelSpies('user').create).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('setup/seed-demo is production-blocked', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mod = await route('setup/seed-demo');
      const res = await mod.POST(req('POST', '/api/setup/seed-demo', {}));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(modelSpies('user').create).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('setup/init fails closed without SETUP_INIT_KEY', async () => {
    const mod = await route('setup/init');
    const res = await mod.POST(req('POST', '/api/setup/init', {}));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(modelSpies('organization').create).not.toHaveBeenCalled();
    expect(modelSpies('user').create).not.toHaveBeenCalled();
  });
});

describe('platform admin boundary (ADMIN_MANAGE)', () => {
  it('org_owner cannot list organizations', async () => {
    await asUser(A);
    const mod = await route('admin/organizations');
    const res = await mod.GET(req('GET', '/api/admin/organizations'));
    expect(res.status).toBe(403);
  });

  it('super_admin can list organizations globally', async () => {
    await asUser(SA);
    const mod = await route('admin/organizations');
    const res = await mod.GET(req('GET', '/api/admin/organizations'));
    expect(res.status).toBe(200);
  });

  it('org_owner cannot read organization usage KPIs', async () => {
    await asUser(A);
    const mod = await route('admin/platform-stats');
    const res = await mod.GET(req('GET', '/api/admin/platform-stats'));
    expect(res.status).toBe(403);
  });
});

// ─── unauthenticated requests are rejected everywhere ───
describe('unauthenticated denial', () => {
  it.each(['vehicles', 'tickets', 'invoices'])('GET /%s without session → 401', async (m) => {
    await asUnauthenticated();
    const mod = await route(m);
    const res = await mod.GET(req('GET', `/api/${m}`));
    expect(res.status).toBe(401);
  });
});
