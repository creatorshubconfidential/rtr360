/**
 * P0-⑤ — Operator CLI: encrypt plaintext webhook secrets at rest.
 *
 * Usage (with live database + ENCRYPTION_MASTER_KEY set):
 *   ENCRYPTION_MASTER_KEY=$(openssl rand -base64 32) \
 *   DATABASE_URL="postgresql://..." npx tsx scripts/p05_backfill_secrets.ts
 *
 * Safety:
 *   - Refuses to run without ENCRYPTION_MASTER_KEY (fail-closed).
 *   - Refuses to run in plain production URL check? No — the operator
 *     decides; the operation is idempotent and non-destructive.
 *   - Prints counts only; never prints secret values or the key.
 *   - Idempotent: safe to re-run (skips v1: rows).
 */
import { PrismaClient } from '@prisma/client';
import { backfillWebhookSecrets } from '../src/lib/crypto-backfill';

async function main() {
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    console.error('REFUSING TO RUN: ENCRYPTION_MASTER_KEY is not set (fail-closed).');
    console.error('Generate one with: openssl rand -base64 32');
    process.exit(1);
  }

  const client = new PrismaClient();
  try {
    const result = await backfillWebhookSecrets(client);
    console.log('Webhook secret backfill complete:');
    console.log(`  scanned:          ${result.scanned}`);
    console.log(`  already encrypted: ${result.alreadyEncrypted}`);
    console.log(`  newly encrypted:   ${result.encrypted}`);
    console.log(`  failed:            ${result.failed.length}`);
    if (result.failed.length > 0) {
      for (const f of result.failed) {
        console.error(`  FAILED ${f.id}: ${f.reason}`);
      }
      process.exit(2);
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((e) => {
  console.error('Backfill failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
