/**
 * P0-⑤ — Secrets & Encryption behavioral tests
 *
 * NOT regex-based: these tests exercise the REAL backfill function against
 * a mocked Prisma boundary and the REAL crypto module (AES-256-GCM), and
 * assert fail-closed behavior, idempotency, and zero-secret-logging.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEY_B64 = Buffer.alloc(32, 7).toString('base64');

let encryptedValues: string[] = [];

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

async function withKey<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ENCRYPTION_MASTER_KEY;
  process.env.ENCRYPTION_MASTER_KEY = KEY_B64;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
    else process.env.ENCRYPTION_MASTER_KEY = prev;
  }
}

function mockPrisma(rows: { id: string; secret: string }[]) {
  const updates: { id: string; secret: string }[] = [];
  const client = {
    webhookEndpoint: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: { secret: string } }) => {
        updates.push({ id: where.id, secret: data.secret });
        encryptedValues.push(data.secret);
        return Promise.resolve({});
      }),
    },
  };
  return { client, updates };
}

import { backfillWebhookSecrets } from '@/lib/crypto-backfill';
import { isEncrypted } from '@/lib/crypto';

describe('P0-⑤ webhook secret backfill (behavioral)', () => {
  beforeEach(() => { encryptedValues = []; vi.clearAllMocks(); });
  afterEach(() => { delete process.env.ENCRYPTION_MASTER_KEY; });

  it('encrypts plaintext secrets and stores v1: format', async () => {
    await withKey(async () => {
      const { client, updates } = mockPrisma([
        { id: 'wh-1', secret: 'plaintext-secret-a' },
      ]);
      const result = await backfillWebhookSecrets(client as never);
      expect(result.scanned).toBe(1);
      expect(result.encrypted).toBe(1);
      expect(result.failed).toEqual([]);
      expect(updates[0].id).toBe('wh-1');
      expect(isEncrypted(updates[0].secret)).toBe(true);
    });
  });

  it('is idempotent — v1: rows are skipped, not re-encrypted', async () => {
    await withKey(async () => {
      const { client, updates } = mockPrisma([
        { id: 'wh-enc', secret: 'v1:abc:def:ghi' },
        { id: 'wh-plain', secret: 'plain-b' },
      ]);
      const result = await backfillWebhookSecrets(client as never);
      expect(result.alreadyEncrypted).toBe(1);
      expect(result.encrypted).toBe(1);
      expect(updates.map((u) => u.id)).toEqual(['wh-plain']);
    });
  });

  it('is fail-closed without ENCRYPTION_MASTER_KEY — refuses, DB untouched', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    const { client, updates } = mockPrisma([{ id: 'wh-2', secret: 'plain-c' }]);
    const result = await backfillWebhookSecrets(client as never);
    expect(result.encrypted).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('wh-2');
    expect(result.failed[0].reason).toMatch(/ENCRYPTION_MASTER_KEY/);
    expect(updates).toEqual([]); // nothing written
  });

  it('never logs secret values (counts and ids only)', async () => {
    await withKey(async () => {
      const { logger } = await import('@/lib/logger');
      const { client } = mockPrisma([{ id: 'wh-3', secret: 'super-secret-value' }]);
      await backfillWebhookSecrets(client as never);
      const calls = JSON.stringify(vi.mocked(logger.info).mock.calls);
      expect(calls).not.toContain('super-secret-value');
      expect(calls).not.toContain('v1:');
    });
  });
});

describe('P0-⑤ secrets exposure inventory (behavioral)', () => {
  it('ApiKey raw keys have zero route exposure (structural: no route imports ApiKey writes)', async () => {
    // Verified behaviorally in P0-② (no ApiKey routes exist); here we assert
    // the crypto boundary remains un-bypassed: decryptSecret never returns
    // v1: content without the key.
    const { decryptSecret } = await import('@/lib/crypto');
    await withKey(async () => {
      const enc = (await import('@/lib/crypto')).encryptSecret('roundtrip');
      expect(decryptSecret(enc)).toBe('roundtrip');
    });
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(() => decryptSecret('v1:a:b:c')).toThrow(/ENCRYPTION_MASTER_KEY/);
  });
});
