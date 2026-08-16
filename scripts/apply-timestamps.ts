import { db } from '../src/lib/db';

async function main() {
  const tables = ['AlertRule', 'Alert', 'Trip', 'Document', 'Notification', 'Setting', 'ApiKey'];
  
  for (const table of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "updated_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'`);
      console.log(`✅ Added updated_at to ${table}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate column name')) {
        console.log(`⏭️  ${table} already has updated_at`);
      } else {
        console.error(`❌ ${table}: ${msg}`);
      }
    }
  }

  // Also add created_at to Setting if missing
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).executeRawUnsafe(`ALTER TABLE "Setting" ADD COLUMN "created_at" DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'`);
    console.log('✅ Added created_at to Setting');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate column name')) {
      console.log('⏭️  Setting already has created_at');
    } else {
      console.error(`❌ Setting created_at: ${msg}`);
    }
  }

  // Update existing rows to have correct timestamps
  const now = new Date().toISOString();
  for (const table of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).executeRawUnsafe(`UPDATE "${table}" SET "updated_at" = "created_at" WHERE "updated_at" = '2026-01-01T00:00:00.000Z'`);
      console.log(`✅ Synced ${table} timestamps`);
    } catch {
      console.log(`⚠️  Could not sync ${table} timestamps (may not have created_at)`);
    }
  }

  console.log('\nDone! Run prisma generate to regenerate client.');
}

main().catch(console.error);
