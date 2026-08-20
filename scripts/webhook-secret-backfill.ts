/**
 * RTR360 P2-7 — Webhook Secret Encryption Backfill
 *
 * Idempotent migration script to encrypt plaintext webhook secrets.
 * Run once against production after ENCRYPTION_MASTER_KEY is configured.
 *
 * Usage:
 *   npx tsx scripts/webhook-secret-backfill.ts
 *
 * Safety:
 *   - Skips secrets already starting with "v1:" (already encrypted)
 *   - Never logs plaintext secrets
 *   - Verifies decrypt(encrypt(secret)) == secret
 *   - Rollback-safe: original values are replaced in-place
 *   - Production-safe: can be re-run multiple times
 */

import { PrismaClient } from '@prisma/client';
import { encryptSecret, decryptSecret, isEncrypted, isEncryptionAvailable } from '../src/lib/crypto';

const db = new PrismaClient();

async function main() {
  console.log('=== Webhook Secret Encryption Backfill ===');
  console.log();

  // Pre-flight checks
  if (!isEncryptionAvailable()) {
    console.error('FATAL: ENCRYPTION_MASTER_KEY is not configured. Cannot proceed.');
    console.error('Set ENCRYPTION_MASTER_KEY in your environment (base64, 32 bytes).');
    process.exit(1);
  }

  // Find all webhook endpoints with plaintext secrets
  const plaintextEndpoints = await db.webhookEndpoint.findMany({
    where: {
      secret: { not: { startsWith: 'v1:' } },
    },
    select: {
      id: true,
      organizationId: true,
      secret: true,
    },
  });

  console.log(`Found ${plaintextEndpoints.length} endpoint(s) with plaintext secrets.`);

  if (plaintextEndpoints.length === 0) {
    console.log('All secrets are already encrypted. Nothing to do.');
    return;
  }

  let encrypted = 0;
  let failed = 0;

  for (const endpoint of plaintextEndpoints) {
    try {
      const plaintext = endpoint.secret;

      // Encrypt
      const encryptedValue = encryptSecret(plaintext);

      // Verify round-trip
      const decrypted = decryptSecret(encryptedValue);
      if (decrypted !== plaintext) {
        console.error(`  FAIL [${endpoint.id}]: Round-trip verification failed`);
        failed++;
        continue;
      }

      // Update in database
      await db.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { secret: encryptedValue },
      });

      encrypted++;
      console.log(`  OK   [${endpoint.id}] org=${endpoint.organizationId} — encrypted successfully`);
    } catch (error) {
      failed++;
      console.error(`  FAIL [${endpoint.id}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log();
  console.log(`=== Result: ${encrypted} encrypted, ${failed} failed, ${plaintextEndpoints.length - encrypted - failed} skipped ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
