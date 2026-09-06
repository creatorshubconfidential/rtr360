/**
 * P0-⑤ — Secret Encryption Backfill
 *
 * Encrypts plaintext sensitive values at rest. Currently covers:
 *   - WebhookEndpoint.secret (HMAC signing secret for outbound webhooks)
 *
 * Semantics:
 *   - Idempotent: rows already encrypted (v1: prefix) are skipped.
 *   - Transactional per row: encrypt-then-update; a failed row does not
 *     abort the whole backfill (reported, never silent).
 *   - Fail-closed: without ENCRYPTION_MASTER_KEY the entire backfill
 *     refuses to start (encryptSecret throws) — plaintext is NEVER
 *     "accidentally" kept writable.
 *   - Never logs secret values — only counts and row ids.
 *
 * Used by: scripts/p05_backfill_secrets.ts (operator CLI)
 * Rotation runbook: docs/P0-5_SECRETS_ENCRYPTION.md
 */
import type { PrismaClient } from '@prisma/client';
import { encryptSecret, isEncrypted } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export interface BackfillResult {
  scanned: number;
  alreadyEncrypted: number;
  encrypted: number;
  failed: { id: string; reason: string }[];
}

/**
 * Backfill all plaintext webhook secrets.
 * Returns counts only — secret values never appear in the result or logs.
 */
export async function backfillWebhookSecrets(
  client: PrismaClient | { webhookEndpoint: { findMany: Function; update: Function } }
): Promise<BackfillResult> {
  const rows = await client.webhookEndpoint.findMany({
    select: { id: true, secret: true },
  });

  const result: BackfillResult = {
    scanned: rows.length,
    alreadyEncrypted: 0,
    encrypted: 0,
    failed: [],
  };

  for (const row of rows) {
    if (isEncrypted(row.secret)) {
      result.alreadyEncrypted++;
      continue;
    }
    try {
      // Encrypt BEFORE the update — if encryption throws, the row is
      // untouched and reported. (encryptSecret also throws without a key.)
      const encrypted = encryptSecret(row.secret);
      await client.webhookEndpoint.update({
        where: { id: row.id },
        data: { secret: encrypted },
      });
      result.encrypted++;
    } catch (error) {
      result.failed.push({
        id: row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('secrets.backfill_completed', {
    scanned: result.scanned,
    alreadyEncrypted: result.alreadyEncrypted,
    encrypted: result.encrypted,
    failed: result.failed.length,
  });

  return result;
}
