/**
 * RTR 360 — Crypto Module Tests (P2-6)
 *
 * Tests AES-256-GCM encrypt/decrypt, versioned format,
 * fail-closed semantics, and plaintext passthrough for migration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We need to test the crypto module with a real key
describe('P2-6: Crypto Module', () => {
  const originalKey = process.env.ENCRYPTION_MASTER_KEY;
  const TEST_KEY_32 = Buffer.alloc(32, 'a').toString('base64'); // 32 bytes of 'a'
  const WRONG_KEY = Buffer.alloc(32, 'b').toString('base64');

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_KEY_32;
    // Clear module cache to pick up new env var
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = originalKey;
  });

  it('encryptSecret produces versioned v1: format', async () => {
    const { encryptSecret } = await import('@/lib/crypto');
    const result = encryptSecret('my-secret-value');
    expect(result).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  });

  it('decryptSecret recovers the original plaintext', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto');
    const plaintext = 'whsec_abcdef1234567890';
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('different encryptions of the same plaintext produce different ciphertexts (random IV)', async () => {
    const { encryptSecret } = await import('@/lib/crypto');
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a).not.toBe(b);
  });

  it('decryptSecret with wrong key throws', async () => {
    const { encryptSecret } = await import('@/lib/crypto');
    const encrypted = encryptSecret('secret-data');

    process.env.ENCRYPTION_MASTER_KEY = WRONG_KEY;
    vi.resetModules();
    const { decryptSecret: decryptWithWrongKey } = await import('@/lib/crypto');

    expect(() => decryptWithWrongKey(encrypted)).toThrow('Decryption failed');
  });

  it('decryptSecret without ENCRYPTION_MASTER_KEY throws', async () => {
    const { encryptSecret } = await import('@/lib/crypto');
    const encrypted = encryptSecret('secret-data');

    delete process.env.ENCRYPTION_MASTER_KEY;
    vi.resetModules();
    const { decryptSecret: decryptNoKey } = await import('@/lib/crypto');

    expect(() => decryptNoKey(encrypted)).toThrow('ENCRYPTION_MASTER_KEY is not configured');
  });

  it('encryptSecret without ENCRYPTION_MASTER_KEY throws', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    vi.resetModules();
    const { encryptSecret } = await import('@/lib/crypto');

    expect(() => encryptSecret('test')).toThrow('ENCRYPTION_MASTER_KEY is not configured');
  });

  it('isEncrypted returns true for v1: format', async () => {
    const { encryptSecret, isEncrypted } = await import('@/lib/crypto');
    const encrypted = encryptSecret('test');
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('isEncrypted returns false for plaintext', async () => {
    const { isEncrypted } = await import('@/lib/crypto');
    expect(isEncrypted('whsec_abc123')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted('v2:something')).toBe(false);
  });

  it('decryptSecret passes through plaintext (migration support)', async () => {
    const { decryptSecret } = await import('@/lib/crypto');
    const plaintext = 'whsec_plaintext_migration_key';
    expect(decryptSecret(plaintext)).toBe(plaintext);
  });

  it('rejects malformed encrypted format', async () => {
    const { decryptSecret } = await import('@/lib/crypto');
    // Not enough parts
    expect(() => decryptSecret('v1:onlytwo')).toThrow('Invalid encrypted format');
    // Wrong version — treated as plaintext (migration passthrough)
    const { decryptSecret: ds2 } = await import('@/lib/crypto');
    expect(ds2('v2:a:b:c')).toBe('v2:a:b:c');
  });

  it('rejects ENCRYPTION_MASTER_KEY of wrong length', async () => {
    process.env.ENCRYPTION_MASTER_KEY = 'short';
    vi.resetModules();
    const { encryptSecret } = await import('@/lib/crypto');
    expect(() => encryptSecret('test')).toThrow('must be exactly 32 bytes');
  });

  it('handles empty string encryption/decryption', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto');
    const encrypted = encryptSecret('');
    expect(decryptSecret(encrypted)).toBe('');
  });

  it('handles long secret values', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto');
    const longSecret = 'a'.repeat(10000);
    const encrypted = encryptSecret(longSecret);
    expect(decryptSecret(encrypted)).toBe(longSecret);
  });
});

import { vi } from 'vitest';
