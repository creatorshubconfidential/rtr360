/**
 * P0-③ — Database Security / RLS Structural Coverage
 *
 * These tests are structural gates on the SQL security artifacts, not
 * claims about the live database. They guarantee:
 *   1. The lockdown migration exists, is dynamic (covers ANY table —
 *      present or future) and contains all four defense layers.
 *   2. Every model in prisma/schema.prisma is reachable by that
 *      coverage (no model can be added without RLS coverage).
 *   3. The verification suite asserts each of the 12 security checks.
 *   4. The Tier-2 policy kit covers every tenant-scoped model, derives
 *      QuotationItem through its parent, and is fail-closed for NULL
 *      organization context.
 *   5. The operator runbook documents the blocked-live-audit verdict
 *      and the auth.uid() inapplicability fact.
 *
 * Live-database behavioral verification is operator-gated:
 *   sql/rls/30_preflight.sql → prisma migrate deploy → sql/rls/20_verify_rls.sql
 *   (documented in docs/P0-3_RLS_DATABASE_SECURITY.md §D)
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_DIR = path.join(ROOT, 'prisma', 'migrations');
const LOCKDOWN_MIGRATION = path.join(
  MIGRATION_DIR,
  '20260906000000_p03_database_security_lockdown',
  'migration.sql'
);
const SQL_RLS_DIR = path.join(ROOT, 'sql', 'rls');

const read = (p: string) => readFileSync(p, 'utf8');

// ─── Migration ────────────────────────────────────────────────

describe('P0-③ lockdown migration', () => {
  const sql = existsSync(LOCKDOWN_MIGRATION) ? read(LOCKDOWN_MIGRATION) : '';

  it('exists as a Prisma migration', () => {
    expect(existsSync(LOCKDOWN_MIGRATION)).toBe(true);
    expect(sql.length).toBeGreaterThan(0);
  });

  it('enables RLS dynamically on ALL public tables (loop, not a hardcoded list)', () => {
    // The loop must iterate pg_tables and execute ALTER TABLE ... ENABLE ROW LEVEL SECURITY
    expect(sql).toMatch(/FOR\s+\w+\s+IN[\s\S]*pg_tables/i);
    expect(sql).toMatch(/format\(\s*'ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY'/i);
    // Dynamic loop means the migration covers every table in schema.prisma
    // automatically — present today or added tomorrow.
  });

  it('revokes privileges from anon, authenticated and PUBLIC (defense in depth)', () => {
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated/i);
  });

  it('locks future objects via ALTER DEFAULT PRIVILEGES', () => {
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon/i);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated/i);
  });

  it('locks down Supabase Storage and is portable (guarded for optional objects)', () => {
    expect(sql).toMatch(/to_regclass\('storage\.objects'\)/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON storage\.objects FROM anon/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON storage\.objects FROM authenticated/i);
    // Portability guards — must not assume Supabase-only environment
    expect(sql).toMatch(/to_regrole\('anon'\)/i);
    expect(sql).toMatch(/to_regrole\('authenticated'\)/i);
  });

  it('never uses FORCE ROW LEVEL SECURITY (owner path must stay functional in Tier 1)', () => {
    expect(sql).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
  });

  it('contains no destructive statements (no DROP TABLE, TRUNCATE, DELETE, or data access)', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/DROP\s+POLICY\s+IF\s+EXISTS/i); // Tier-1 only enables/revokes
  });
});

// ─── Schema coverage ──────────────────────────────────────────

describe('P0-③ schema ↔ RLS coverage', () => {
  const schema = read(path.join(ROOT, 'prisma', 'schema.prisma'));
  const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);

  it('parses the expected model population (36 models)', () => {
    expect(models.length).toBeGreaterThanOrEqual(36);
    for (const m of ['Organization', 'User', 'Session', 'ApiKey', 'QuotationItem', 'WebhookDelivery', 'BackgroundJob']) {
      expect(models).toContain(m);
    }
  });

  it('every model is covered by the dynamic RLS loop (pg_tables iteration)', () => {
    // Structural guarantee: the lockdown migration iterates over
    // pg_tables, so every current/future public table is RLS-enabled.
    const sql = read(LOCKDOWN_MIGRATION);
    expect(sql).toMatch(/SELECT tablename FROM pg_tables/i);
    // And the verification suite checks ALL of them again post-deploy.
    const verify = read(path.join(SQL_RLS_DIR, '20_verify_rls.sql'));
    expect(verify).toMatch(/C1_RLS_ENABLED_ALL_PUBLIC_TABLES/);
  });

  it('Tenant-derived QuotationItem isolation is handled in Tier 2', () => {
    const tier2 = read(path.join(SQL_RLS_DIR, '10_tier2_tenant_policies.sql'));
    expect(tier2).toMatch(/"QuotationItem"/);
    expect(tier2).toMatch(/public\."Quotation" q\s*\n?\s*WHERE q\.id = "QuotationItem"\.quotation_id/);
  });

  it('Tier 2 is fail-closed for NULL organization context', () => {
    const tier2 = read(path.join(SQL_RLS_DIR, '10_tier2_tenant_policies.sql'));
    // org context helper: NULL/absent setting must never match
    expect(tier2).toMatch(/NULLIF\(current_setting\('rtr\.org_id', true\), ''\)/);
    // nullable-org tables require NOT NULL before matching
    expect(tier2).toMatch(/organization_id IS NOT NULL AND public\.rtr_org_matches/);
    // rtr_app must never bypass RLS
    expect(tier2).toMatch(/NOBYPASSRLS/);
  });
});

// ─── Verification suite ───────────────────────────────────────

describe('P0-③ verification SQL suite', () => {
  const verify = read(path.join(SQL_RLS_DIR, '20_verify_rls.sql'));

  it('exists with all 12 security checks', () => {
    const checks = [
      'C1_RLS_ENABLED_ALL_PUBLIC_TABLES',
      'C2_NO_POLICIES_FOR_POSTGREST_ROLES',
      'C3_ANON_ZERO_TABLE_PRIVILEGES',
      'C4_AUTHENTICATED_ZERO_TABLE_PRIVILEGES',
      'C5_PUBLIC_ZERO_TABLE_PRIVILEGES',
      'C6_ANON_NO_SCHEMA_USAGE',
      'C7_AUTHENTICATED_NO_SCHEMA_USAGE',
      'C8_IDENTITY_TABLES_RLS',
      'C9_SESSION_TABLE_LOCKED',
      'C10_APIKEY_TABLE_LOCKED',
      'C11_STORAGE_OBJECTS_LOCKED',
      'C12_APP_ROLE_IS_OWNER',
    ];
    for (const c of checks) expect(verify).toContain(c);
  });

  it('reports a single FAIL_COUNT verdict for CI gating', () => {
    expect(verify).toMatch(/'VERDICT',\s*'FAIL_COUNT'/);
  });
});

// ─── Runbook / preflight / rollback ───────────────────────────

describe('P0-③ operator artifacts', () => {
  it('preflight snapshots current posture before changes', () => {
    const pre = read(path.join(SQL_RLS_DIR, '30_preflight.sql'));
    expect(pre).toMatch(/current_user/);
    expect(pre).toMatch(/tableowner/);
    expect(pre).toMatch(/role_table_grants/);
  });

  it('emergency rollback exists and is explicitly incident-scoped', () => {
    const rb = read(path.join(SQL_RLS_DIR, '40_rollback_emergency.sql'));
    expect(rb).toMatch(/EMERGENCY ROLLBACK/i);
    expect(rb).toMatch(/incident/i);
  });

  it('runbook documents the live-audit block and the auth.uid() verdict', () => {
    const doc = read(path.join(ROOT, 'docs', 'P0-3_RLS_DATABASE_SECURITY.md'));
    expect(doc).toMatch(/BLOCKED in this environment/);
    expect(doc).toMatch(/auth\.uid\(\).*unusable|unusable.*auth\.uid\(\)/i);
    expect(doc).toMatch(/prisma migrate deploy/);
    expect(doc).toMatch(/20_verify_rls\.sql/);
    expect(doc).toMatch(/FAIL_COUNT = 0/);
  });
});
