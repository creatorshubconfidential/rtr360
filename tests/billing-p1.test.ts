/**
 * P1 — Billing / Commercial Flow behavioral tests
 *
 * Server-authoritative totals, invoice numbering race handling,
 * invoice state machine, tenant-scoped subscription linkage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Prisma spy boundary ───────────────────────────────────────
let invoiceCount = 0;
let createAttempts = 0;
let failFirstCreates = 0;
const invoices: Record<string, Record<string, unknown>> = {};
const subscriptions: Record<string, Record<string, unknown>> = {};
const quotations: Record<string, unknown>[] = [];

vi.mock('@/lib/db', () => {
  const dbMock = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(dbMock)),
    invoice: {
      count: vi.fn(async () => invoiceCount),
      create: vi.fn(async ({ data }) => {
        createAttempts++;
        if (failFirstCreates > 0 && createAttempts <= failFirstCreates) {
          throw new Error('Unique constraint failed on the fields: (`invoice_number`) (P2002)');
        }
        if (Object.values(invoices).some((i) => i.invoiceNumber === data.invoiceNumber)) {
          throw new Error('Unique constraint failed on the fields: (`invoice_number`) (P2002)');
        }
        const rec = { id: `inv-${createAttempts}`, ...data };
        invoices[rec.id as string] = rec;
        invoiceCount = Object.keys(invoices).length;
        return { ...rec };
      }),
      findUnique: vi.fn(async ({ where }) => {
        for (const i of Object.values(invoices)) if (i.id === where.id) return { ...i };
        return null;
      }),
      update: vi.fn(async ({ where, data }) => {
        invoices[where.id] = { ...invoices[where.id], ...data };
        return { ...invoices[where.id] };
      }),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }) => {
        const s = subscriptions[where.id];
        return s ? { ...s } : null;
      }),
    },
    quotation: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => {
        quotations.push(data);
        return { id: 'q-1', ...data };
      }),
      count: vi.fn(async () => 0),
    },
    quotationItem: {
      createMany: vi.fn(async () => ({ count: 2 })),
    },
  };
  return { db: dbMock };
});

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('203.0.113.5'),
}));

let persona: { id: string; role: string; organizationId: string | null } | null = null;
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => {
    if (!persona) return { user: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
    return { user: persona, error: null };
  }),
}));

function post(url: string, body: unknown): Request {
  return new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function patch(url: string, body: unknown): Request {
  return new Request(`http://localhost:3000${url}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const k of Object.keys(invoices)) delete invoices[k];
  for (const k of Object.keys(subscriptions)) delete subscriptions[k];
  quotations.length = 0;
  invoiceCount = 0;
  createAttempts = 0;
  failFirstCreates = 0;
  persona = { id: 'u1', role: 'org_owner', organizationId: 'org-A' };
});

describe('P1 billing — invoice totals are server-authoritative', () => {
  it('computes total = amount + tax server-side; client-supplied total is ignored', async () => {
    const { POST } = await import('@/app/api/invoices/route');
    const res = await POST(post('/api/invoices', {
      amount: 1000, tax: 50, dueDate: new Date().toISOString(),
      total: 999999, // adversarial client value — must be ignored
      status: 'paid', // adversarial — must be ignored (starts pending)
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invoice.total).toBe(1050);
    expect(body.invoice.amount).toBe(1000);
    expect(body.invoice.tax).toBe(50);
    expect(body.invoice.status).toBe('pending'); // server-set, not client
  });

  it('rounds monetary totals to 2 decimals (no float leakage)', async () => {
    const { POST } = await import('@/app/api/invoices/route');
    const res = await POST(post('/api/invoices', {
      amount: 100.005, tax: 0.005, dueDate: new Date().toISOString(),
    }));
    const body = await res.json();
    expect(body.invoice.total).toBe(Math.round((100.005 + 0.005) * 100) / 100);
  });

  it('rejects negative amounts (400)', async () => {
    const { POST } = await import('@/app/api/invoices/route');
    const res = await POST(post('/api/invoices', { amount: -5, dueDate: new Date().toISOString() }));
    expect(res.status).toBe(400);
  });
});

describe('P1 billing — invoice numbering race', () => {
  it('retries on unique violation and issues the next number (201, not 500)', async () => {
    const { POST } = await import('@/app/api/invoices/route');
    failFirstCreates = 1; // first attempt loses the race (P2002)
    const res = await POST(post('/api/invoices', { amount: 100, dueDate: new Date().toISOString() }));
    expect(res.status).toBe(201);
    expect(createAttempts).toBe(2); // retried once
    const body = await res.json();
    expect(String(body.invoice.invoiceNumber)).toMatch(/^INV-\d{8}-\d{3,}$/);
  });

  it('two sequential invoices get distinct numbers', async () => {
    const { POST } = await import('@/app/api/invoices/route');
    const r1 = await POST(post('/api/invoices', { amount: 10, dueDate: new Date().toISOString() }));
    const r2 = await POST(post('/api/invoices', { amount: 10, dueDate: new Date().toISOString() }));
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.invoice.invoiceNumber).not.toBe(b2.invoice.invoiceNumber);
  });
});

describe('P1 billing — subscription linkage is tenant-checked', () => {
  it('subscription from another org is rejected (400)', async () => {
    subscriptions['sub-B'] = { id: 'sub-B', organizationId: 'org-B' };
    const { POST } = await import('@/app/api/invoices/route');
    const res = await POST(post('/api/invoices', {
      amount: 100, dueDate: new Date().toISOString(), subscriptionId: 'sub-B',
    }));
    expect(res.status).toBe(400);
  });

  it('own-org subscription is accepted', async () => {
    subscriptions['sub-A'] = { id: 'sub-A', organizationId: 'org-A' };
    const { POST } = await import('@/app/api/invoices/route');
    const res = await POST(post('/api/invoices', {
      amount: 100, dueDate: new Date().toISOString(), subscriptionId: 'sub-A',
    }));
    expect(res.status).toBe(201);
  });
});

describe('P1 billing — invoice state machine', () => {
  beforeEach(() => {
    invoices['inv-1'] = { id: 'inv-1', status: 'pending', organizationId: 'org-A', notes: null };
  });

  it('pending → paid allowed, paidAt set server-side', async () => {
    const { PATCH } = await import('@/app/api/invoices/[id]/route');
    const res = await PATCH(patch('/api/invoices/inv-1', { status: 'paid' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(200);
    expect(invoices['inv-1'].status).toBe('paid');
    expect(invoices['inv-1'].paidAt).toBeInstanceOf(Date);
  });

  it('pending → overdue → paid path allowed', async () => {
    const { PATCH } = await import('@/app/api/invoices/[id]/route');
    await PATCH(patch('/api/invoices/inv-1', { status: 'overdue' }), { params: Promise.resolve({ id: 'inv-1' }) });
    const res = await PATCH(patch('/api/invoices/inv-1', { status: 'paid' }), { params: Promise.resolve({ id: 'inv-1' }) });
    expect(res.status).toBe(200);
    expect(invoices['inv-1'].status).toBe('paid');
  });

  it('paid → pending BLOCKED (paid is immutable — no payment reversal by PATCH)', async () => {
    invoices['inv-1'].status = 'paid';
    const { PATCH } = await import('@/app/api/invoices/[id]/route');
    const res = await PATCH(patch('/api/invoices/inv-1', { status: 'pending' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(409);
    expect(invoices['inv-1'].status).toBe('paid');
  });

  it('cancelled is terminal (cancelled → paid BLOCKED)', async () => {
    invoices['inv-1'].status = 'cancelled';
    const { PATCH } = await import('@/app/api/invoices/[id]/route');
    const res = await PATCH(patch('/api/invoices/inv-1', { status: 'paid' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(409);
  });

  it('invalid status value rejected (400)', async () => {
    const { PATCH } = await import('@/app/api/invoices/[id]/route');
    const res = await PATCH(patch('/api/invoices/inv-1', { status: 'exploded' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('P1 billing — quotation totals computed from items server-side', () => {
  it('subtotal/tax/total derived from items; client totals not trusted', async () => {
    const { POST } = await import('@/app/api/quotations/route');
    const res = await POST(post('/api/quotations', {
      items: [
        { description: 'GPS device', quantity: 10, unitPrice: 250 },
        { description: 'Install', quantity: 2, unitPrice: 100 },
      ],
      taxRate: 5,
      subtotal: 1, tax: 1, total: 1, // adversarial — must be ignored
    }));
    expect(res.status).toBe(201);
    const q = quotations[0] as Record<string, unknown>;
    expect(q.subtotal).toBe(2700);          // 10×250 + 2×100
    expect(q.tax).toBe(135);                // 5% VAT
    expect(q.total).toBe(2835);
  });

  it('defaults tax rate to 5 (UAE VAT) when absent', async () => {
    const { POST } = await import('@/app/api/quotations/route');
    await POST(post('/api/quotations', {
      items: [{ description: 'x', quantity: 1, unitPrice: 100 }],
    }));
    const q = quotations[0] as Record<string, unknown>;
    expect(q.taxRate).toBe(5);
    expect(q.tax).toBe(5);
    expect(q.total).toBe(105);
  });
});
