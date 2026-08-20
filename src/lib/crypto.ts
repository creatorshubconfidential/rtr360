/**
 * RTR 360 — Secret Encryption (AES-256-GCM)
 *
 * Encrypts webhook secrets and other sensitive values at rest.
 * Format: v1:<iv>:<authTag>:<ciphertext>
 *   - v1: version prefix for future algorithm migration
 *   - iv: 12-byte initialization vector (base64url)
 *   - authTag: 16-byte authentication tag (base64url)
 *   - ciphertext: AES-256-GCM encrypted data (base64url)
 *
 * Master key MUST come from ENCRYPTION_MASTER_KEY environment variable.
 * Never logged. Never committed.
 *
 * Fail-closed semantics:
 *   - If key is missing in production → throw (refuse to operate)
 *   - If decryption fails → throw (do not fall back to plaintext)
 *   - Corrupted data is never silently returned
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '@/lib/logger';

// ── Configuration ───────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const VERSION = 'v1';

// ── Key Management ───────────────────────────────────────────────

/**
 * Get the encryption master key from environment.
 * Returns null if not configured (acceptable in dev/test).
 * In production, the caller should treat null as a fatal error.
 */
function getMasterKey(): Buffer | null {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) return null;

  const keyBuffer = Buffer.from(key, 'base64');
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must be exactly ${KEY_LENGTH} bytes (base64-encoded), got ${keyBuffer.length} bytes`
    );
  }
  return keyBuffer;
}

/**
 * Check if encryption is available (key is configured).
 */
export function isEncryptionAvailable(): boolean {
  try {
    return getMasterKey() !== null;
  } catch {
    return false;
  }
}

// ── Encryption ───────────────────────────────────────────────────

/**
 * Encrypt a plaintext secret using AES-256-GCM.
 *
 * Returns versioned format: v1:<iv>:<authTag>:<ciphertext>
 * All components are base64url-encoded.
 *
 * @param plaintext - The secret value to encrypt
 * @returns Encrypted string in versioned format
 * @throws Error if ENCRYPTION_MASTER_KEY is not configured
 */
export function encryptSecret(plaintext: string): string {
  const masterKey = getMasterKey();
  if (!masterKey) {
    throw new Error('ENCRYPTION_MASTER_KEY is not configured — cannot encrypt secrets');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });

  let ciphertext: Buffer;
  try {
    ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
  } catch (error) {
    logger.error('crypto.encryption_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Encryption failed');
  }

  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

// ── Decryption ───────────────────────────────────────────────────

/**
 * Decrypt a secret that was encrypted with encryptSecret().
 *
 * Supports versioned format: v1:<iv>:<authTag>:<ciphertext>
 * Also supports plaintext passthrough for safe migration:
 *   - If the input does NOT start with "v1:", it is returned as-is.
 *     This allows existing plaintext secrets to be read during migration.
 *
 * @param encrypted - The encrypted or plaintext secret
 * @returns Decrypted plaintext, or original plaintext if not encrypted
 * @throws Error if decryption fails (corrupted data, wrong key, etc.)
 */
export function decryptSecret(encrypted: string): string {
  // Plaintext passthrough: if not versioned, return as-is
  if (!encrypted.startsWith(VERSION + ':')) {
    return encrypted;
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    throw new Error('ENCRYPTION_MASTER_KEY is not configured — cannot decrypt secrets');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(`Invalid encrypted format: expected v1:<iv>:<authTag>:<ciphertext>`);
  }

  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;

  try {
    iv = Buffer.from(parts[1], 'base64url');
    authTag = Buffer.from(parts[2], 'base64url');
    ciphertext = Buffer.from(parts[3], 'base64url');
  } catch (error) {
    logger.error('crypto.decoding_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Failed to decode encrypted secret — corrupted base64');
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
  } catch (error) {
    logger.error('crypto.decryption_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Decryption failed — wrong key or corrupted data');
  }
}

// ── Backfill Helper ─────────────────────────────────────────────

/**
 * Check if a value is already encrypted (starts with version prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(VERSION + ':');
}
