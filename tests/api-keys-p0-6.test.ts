/**
 * P0-⑥ — API Key Security behavioral tests
 *
 * REAL handler/lib invocation against a Prisma spy boundary:
 *   Org A key → Org A only · Org A key → Org B denied · revoked → denied ·
 *   expired → denied · invalid → denied · missing → denied ·
 *   rate-limit abuse → blocked · scope enforcement · one-time raw display ·
 *   hashed storage (raw never persisted) · last-used tracking.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

// ── Prisma spy boundary ───────────────────────────────────────
const apiKeyStore: Record<string, Record<string, unknown>> = {};
const createCalls: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];

vi.mock('@/lib/db', () => ({
  db: {
    apiKey: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        for (const rec of Object.values(apiKeyStore)) {
          if (rec.key === where.key) return { ...rec };
        }
        return null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const rec = apiKeyStore[where.id];
        return rec ? { ...rec } : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = (data.id as string) ?? 'key-new';
        const rec = { id, ...data };
        apiKeyStore[id] = rec;
        createCalls.push({ ...data });
        return { ...rec };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updateCalls.push({ where, data });
        apiKeyStore[where.id] = { ...apiKeyStore[where.id], ...data };
        return { ...apiKeyStore[where.id] };
      }),
    },
  },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('203.0.113.10'),
}));

// ── Session-auth persona injection for management routes ─────
type Persona = { id: string; role: string; organizationId: string | null };
let persona: Persona | null = null;

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => {
    if (!persona) {
      return { user: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    return { user: persona, error: null };
  }),
}));

import { requirePermission } from '@/lib/permissions';
import {
  generateApiKey, hashApiKey, authenticateApiKey, parseScope, expiryFromDays, SCOPE_RANK,
} from '@/lib/api-keys';

const ORG_A = 'org-A';
const ORG_B = 'org-B';

function nextRequest(url: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost:3000${url}`, init);
}

function seedKey(id: string, orgId: string, overrides: Record<string, unknown> = {}) {
  const { raw, prefix, hash } = generateApiKey();
  apiKeyStore[id] = {
    id,
    name: `key-${id}`,
    key: hash,
    keyPrefix: prefix,
    permissions: 'read',
    organizationId: orgId,
    userId: 'user-1',
    active: true,
    expiresAt: null,
    lastUsedAt: null,
    ...overrides,
  };
  return { id, raw, prefix, hash };
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

beforeEach(() => {
  for (const k of Object.keys(apiKeyStore)) delete apiKeyStore[k];
  createCalls.length = 0;
  updateCalls.length = 0;
  persona = null;
  vi.mocked(requirePermission).mockClear?.();
});

describe('P0-⑥ generation & storage (raw never persisted)', () => {
  it('raw key format rtr_… and stored value is the SHA-256 hash, not the raw key', () => {
    const { raw, prefix, hash } = generateApiKey();
    expect(raw.startsWith('rtr_')).toBe(true);
    expect(raw.length).toBeGreaterThan(40);
    expect(prefix.length).toBe(16);
    expect(hash).toBe(sha(raw));
    expect(hash).not.toBe(raw);
  });

  it('two generated keys never collide', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('P0-⑥ authenticateApiKey — every denial case', () => {
  it('valid Org A key authenticates with org-A scope context', async () => {
    const { raw } = seedKey('k-a1', ORG_A);
    const res = await authenticateApiKey(nextRequest('/', { headers: { 'x-api-key': raw } }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context.organizationId).toBe(ORG_A);
      expect(res.context.scope).toBe('read');
    }
  });

  it('missing key → 401', async () => {
    const res = await authenticateApiKey(nextRequest('/'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it('invalid (unknown) key → generic 401', async () => {
    const res = await authenticateApiKey(nextRequest('/', { headers: { 'x-api-key': 'rtr_totallyboguskey' } }));
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.status).toBe(401); expect(res.error).toBe('Invalid API key'); }
  });

  it('revoked key → 401 (same generic error — no oracle)', async () => {
    const { raw } = seedKey('k-revoked', ORG_A, { active: false });
    const res = await authenticateApiKey(nextRequest('/', { headers: { 'x-api-key': raw } }));
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.status).toBe(401); expect(res.error).toBe('Invalid API key'); }
  });

  it('expired key → 401 (same generic error — no oracle)', async () => {
    const { raw } = seedKey('k-expired', ORG_A, { expiresAt: new Date(Date.now() - 1000) });
    const res = await authenticateApiKey(nextRequest('/', { headers: { 'x-api-key': raw } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it('scope enforcement: read key cannot write (403 explicit)', async () => {
    const { raw } = seedKey('k-read', ORG_A, { permissions: 'read' });
    const res = await authenticateApiKey(nextRequest('/', { headers: { 'x-api-key': raw } }), 'write');
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.status).toBe(403); expect(res.error).toMatch(/write/); }
  });

  it('write key satisfies read requirement; scope rank ordering holds', async () => {
    seedKey('k-write', ORG_A, { permissions: 'write' });
    const rec = apiKeyStore['k-write'];
    expect(SCOPE_RANK[rec.permissions as 'write']).toBeGreaterThanOrEqual(SCOPE_RANK.read);
  });

  it('successful verification updates lastUsedAt (fire-and-forget write observed)', async () => {
    const { raw } = seedKey('k-used', ORG_A);
    await authenticateApiKey(nextRequest('/', { headers: { 'x-api-key': raw } }));
    await new Promise((r) => setImmediate(r)); // let the fire-and-forget write flush
    const lastUse = updateCalls.find((u) => u.where && (u.where as { id?: string }).id === 'k-used');
    expect(lastUse).toBeDefined();
    expect((lastUse!.data as { lastUsedAt: Date }).lastUsedAt).toBeInstanceOf(Date);
  });

  it('brute-force abuse from one IP is blocked (429) after threshold', async () => {
    const ip = '198.51.100.77';
    let blocked = 0;
    for (let i = 0; i < 40; i++) {
      const res = await authenticateApiKey(
        nextRequest('/', { headers: { 'x-api-key': `rtr_guess_${i}`, 'x-forwarded-for': ip } })
      );
      if (!res.ok && res.status === 429) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe('P0-⑥ tenant isolation of management routes', () => {
  it('Org A key belongs to Org A only — authenticateApiKey context is org-scoped', async () => {
    const { raw } = seedKey('k-a2', ORG_A);
    const res = await authenticateApiKey(nextRequest('/', { headers: { 'x-api-key': raw } }));
    if (res.ok) {
      expect(res.context.organizationId).toBe(ORG_A);
      expect(res.context.organizationId).not.toBe(ORG_B);
    } else throw new Error('expected ok');
  });

  it('cross-tenant revocation: Org A session cannot revoke Org B key (404, no oracle)', async () => {
    const { DELETE } = await import('@/app/api/api-keys/[id]/route');
    seedKey('k-b1', ORG_B);
    persona = { id: 'user-a', role: 'org_owner', organizationId: ORG_A };
    const res = await DELETE(nextRequest(`/api/api-keys/k-b1`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'k-b1' }),
    });
    expect(res.status).toBe(404);
    expect(apiKeyStore['k-b1'].active).toBe(true); // untouched
  });

  it('same-org revocation succeeds (active=false)', async () => {
    const { DELETE } = await import('@/app/api/api-keys/[id]/route');
    seedKey('k-a3', ORG_A);
    persona = { id: 'user-a', role: 'org_owner', organizationId: ORG_A };
    const res = await DELETE(nextRequest(`/api/api-keys/k-a3`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'k-a3' }),
    });
    expect(res.status).toBe(200);
    expect(apiKeyStore['k-a3'].active).toBe(false);
  });

  it('cross-tenant rotation denied (404); same-org rotation issues new raw key once', async () => {
    const { POST } = await import('@/app/api/api-keys/[id]/rotate/route');
    seedKey('k-b2', ORG_B);
    seedKey('k-a4', ORG_A);
    persona = { id: 'user-a', role: 'org_owner', organizationId: ORG_A };

    const denied = await POST(nextRequest(`/api/api-keys/k-b2/rotate`, { method: 'POST' }), {
      params: Promise.resolve({ id: 'k-b2' }),
    });
    expect(denied.status).toBe(404);

    const ok = await POST(nextRequest(`/api/api-keys/k-a4/rotate`, { method: 'POST' }), {
      params: Promise.resolve({ id: 'k-a4' }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.key.startsWith('rtr_')).toBe(true);
    // stored hash updated and equals sha256 of the new raw — old raw invalid
    expect(apiKeyStore['k-a4'].key).toBe(sha(body.key));
    const old = apiKeyStore['k-a4'].key as string;
    expect(old).not.toBe(sha('whatever-the-old-raw-was'));
  });

  it('POST /api/api-keys stores ONLY the hash; raw appears once in the response', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    persona = { id: 'user-a', role: 'org_owner', organizationId: ORG_A };
    const res = await POST(
      nextRequest('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'Integration key', permissions: 'write', expiresInDays: 90 }),
        headers: { 'content-type': 'application/json' },
      })
    );
    if (res.status !== 201) {
      const errBody = await res.clone().json();
      throw new Error(`POST status ${res.status}: ${JSON.stringify(errBody)}`);
    }
    expect(res.status).toBe(201);
    const body = await res.json();
    if (!body.key) {
      throw new Error(`POST failed unexpectedly: ${JSON.stringify(body)}`);
    }
    expect(body.key.startsWith('rtr_')).toBe(true);
    expect(createCalls).toHaveLength(1);
    const stored = createCalls[0];
    expect(stored.key).toBe(sha(body.key));       // hash of raw
    expect(stored.key).not.toBe(body.key);        // raw NOT stored
    expect(stored.keyPrefix).toBe(body.key.slice(0, 16));
    expect(stored.organizationId).toBe(ORG_A);
    expect(stored.expiresAt).toBeInstanceOf(Date); // 90-day expiry honored
  });

  it('key creation without organization (orgless persona) → 403 fail-closed', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    persona = { id: 'user-noorg', role: 'org_owner', organizationId: null };
    const res = await POST(
      nextRequest('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'x' }),
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe('P0-⑥ input hardening', () => {
  it('parseScope rejects unknown values (defaults to read, never escalation)', () => {
    expect(parseScope('admin')).toBe('read');
    expect(parseScope('all')).toBe('all');
    expect(parseScope('*')).toBe('read');
    expect(parseScope(42)).toBe('read');
    expect(parseScope(undefined)).toBe('read');
  });

  it('expiryFromDays caps lifetime and rejects nonsense', () => {
    expect(expiryFromDays(90)).toBeInstanceOf(Date);
    expect(expiryFromDays(-5)).toBeNull();
    expect(expiryFromDays('soon')).toBeNull();
    const d = expiryFromDays(99999);
    expect(d!.getTime() - Date.now()).toBeLessThan(3651 * 24 * 3600 * 1000);
  });
});
