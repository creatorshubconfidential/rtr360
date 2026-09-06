# P0-③ — Supabase RLS + Database Security (Audit, Verdict, Runbook)

Status: **IMPLEMENTED (Tier 1) — Tier 2 operator-gated.**
Owner: production hardening program. Related: `docs/P2-16_RLS_ARCHITECTURE_EXECUTION_PLAN.md`.

---

## A. What was inspected

| Area | Method | Result |
|---|---|---|
| Live Supabase DB (pg_tables, pg_policies, grants, roles, functions, views, storage, `_prisma_migrations`) | Direct SQL inspection | **BLOCKED in this environment** — no Supabase credentials available (sandbox `DATABASE_URL` is a local SQLite placeholder; no psql; no Postgres reachable). Live execution delegated to the runbook below. |
| Prior live evidence | `docs/P2-16_RLS_ARCHITECTURE_EXECUTION_PLAN.md` | Supabase project `hwmvxjmdqkkupcirsjuw` (ap-northeast-1, PG 17.6): **34 public tables, RLS enabled 0/34, 0 policies, broad anon/authenticated privileges, Security Advisor flagged `rls_disabled_in_public` critical.** Later, RLS was reportedly enabled manually (see migration `20260905122500_enable_quotation_item_rls` comment) — **no SQL evidence in repo; live state must be re-verified by operator.** |
| Application DB identity | `src/lib/db.ts`, `src/lib/env.ts`, `prisma/schema.prisma` | App connects via Prisma as a privileged role (`postgres` / Supabase Vercel integration `POSTGRES_PRISMA_URL`). **No `@supabase/supabase-js` dependency exists** — the app never uses Supabase auth, PostgREST, Realtime or Storage clients. |
| Identity bridge | Session architecture | Custom DB-backed sessions (`Session` table + `requireAuth()` → `UserSession{id, role, organizationId}`). |
| Schema surface | `prisma/schema.prisma` | 36 models: 20 hard tenant-scoped (`organizationId` NOT NULL), 11 nullable-tenant, 5 global (`Plan`, `Setting`, `Session`, `RateLimitCounter`) + `QuotationItem` (tenant-derived via `quotation_id → Quotation.organizationId`). |
| Storage usage | repo-wide search | No Supabase Storage usage anywhere in application code. |
| Existing RLS SQL | `prisma/migrations/*` | Only one RLS statement existed pre-P0-③ (`QuotationItem ENABLE ROW LEVEL SECURITY`, no policies). |

## B. Findings (10-point audit answers)

1. **Which tables have RLS enabled?** Unknown live (blocked). Per repo evidence: none had RLS via migrations; one manual enable is claimed by a comment. After this phase, the lockdown migration enables RLS on **every** public table (dynamic loop, idempotent) — deployed via `prisma migrate deploy`.
2. **Which have zero policies?** All public tables have zero policies. **This is intentional and fail-closed**: RLS enabled + zero policies ⇒ deny-all for every non-owner role.
3. **Which policies actually enforce tenant isolation?** None at PostgREST level (nothing legitimate runs there). Tenant isolation for the application path is enforced in the Prisma data layer (`src/lib/tenant.ts`, fail-closed `__none__` sentinel) and proven by the P0-①/P0-② behavioral matrix (323 tests). Tier-2 GUC policies (`sql/rls/10_tier2_tenant_policies.sql`) add DB-level enforcement for a future RLS-subject app role.
4. **Which tables are publicly readable/writable?** Pre-lockdown per P2-16 evidence: potentially all (broad anon/authenticated grants). Post-lockdown: **none** — grants revoked (`REVOKE ... FROM anon, authenticated, PUBLIC` + default-privilege lockdown).
5. **Can anon/authenticated bypass tenant isolation?** Pre-lockdown: possible where grants existed (P2-16 evidence). Post-lockdown: **no** — deny-all (no grants AND no policies; both are required for access, neither exists).
6. **Does the app's custom session auth have a safe identity bridge to the database?** **No — and none is invented.** `auth.uid()` is unusable (no Supabase auth identities). The safe bridge is Tier-2 transaction-local GUC (`SET LOCAL rtr.org_id`, scoped to the transaction, cannot leak across pooled connections) with fail-closed `NULL ⇒ deny` semantics, provided in `sql/rls/10_tier2_tenant_policies.sql` and gated on staging validation.
7. **Is `auth.uid()` usable?** **No.** Documented fact, not a gap to paper over: the product's identity lives in the `Session`/`User` tables, not in `auth.users`.
8. **Can NULL `organizationId` records leak?** Via PostgREST post-lockdown: no (zero access). Via application: no — P0-② replaced `organizationId: null`-matching leaks with fail-closed `__none__` sentinels; nullable-org semantics (warehouse devices/SIMs, super_admin users) are covered by the behavioral matrix.
9. **Can cross-tenant INSERT/UPDATE/DELETE happen directly through Supabase?** Post-lockdown: **no** (anon/authenticated have zero privileges). Through the app: enforced + behaviorally tested (P0-①/P0-②).
10. **Can Storage objects cross tenant boundaries?** Application never touches Storage. Post-lockdown `storage.objects` is revoked for anon/authenticated/PUBLIC ⇒ no client path exists. Operator dashboard access (service_role) is unaffected.

## C. What was implemented

| Artifact | Purpose |
|---|---|
| `prisma/migrations/20260906000000_p03_database_security_lockdown/migration.sql` | **Tier 1 (deployed with migrations)**: enable RLS on all public tables (dynamic, idempotent), revoke table/sequence/schema-usage/function privileges from `anon`/`authenticated`/`PUBLIC`, lock default privileges for future objects, lock `storage.objects`. Fully guarded (`to_regrole`/`to_regclass`) ⇒ portable to plain PostgreSQL. Non-destructive; app (owner role) unaffected. |
| `sql/rls/10_tier2_tenant_policies.sql` | **Tier 2 (operator-gated)**: `rtr_app` RLS-subject role, GUC tenant-context functions (`rtr_org_matches` — NULL context ⇒ deny), per-table tenant policies incl. tenant-derived `QuotationItem`, optional `FORCE RLS` section with owner policies. NOT executed automatically. |
| `sql/rls/20_verify_rls.sql` | 12-check verification suite (RLS coverage, zero policies for PostgREST roles, zero grants, schema usage, identity tables, Session/ApiKey read lock, storage, app-role-ownership). `FAIL_COUNT = 0` required. |
| `sql/rls/30_preflight.sql` | 8-point pre-state snapshot (current role, owners, RLS state, policies, grants, buckets, connections, non-owner grants) = rollback reference. |
| `sql/rls/40_rollback_emergency.sql` | Incident-only rollback with root-cause triage + re-apply instructions. |
| `tests/db-rls-coverage.test.ts` | Structural tests: migration exists & is dynamic; all four lockdown blocks present; every schema.prisma model is covered by the RLS surface; verify SQL contains the 12 checks; Tier-2 covers all tenant models incl. `QuotationItem` derivation and NULL-org fail-closed rule. |

## D. Operator runbook (production execution)

### Tier 1 — apply lockdown (REQUIRED, ~15 min)

1. **Preflight** (archive output):
   ```bash
   psql "$SUPABASE_DB_URL" -f sql/rls/30_preflight.sql > preflight_$(date +%Y%m%dT%H%M).txt
   ```
   *Confirm PF1/PF2: the app role is the table owner (e.g. `postgres`). If NOT — STOP and read the Tier-2 note in §E; do not blind-run.*
2. **Apply via migrations** (also records the migration row):
   ```bash
   npx prisma migrate deploy
   ```
3. **Verify** (must end with `VERDICT | FAIL_COUNT | 0`):
   ```bash
   psql "$SUPABASE_DB_URL" -f sql/rls/20_verify_rls.sql
   ```
4. **App smoke test**: login → vehicles list → live map → one invoice page. (App uses the owner path; expect zero behavioral change.)
5. **Security Advisor**: Supabase Dashboard → Database → Advisors → confirm `rls_disabled_in_public` findings are gone.
6. **Evidence**: commit `preflight_*.txt` + verify output reference into the ops log (never credentials).

### Tier 2 — RLS-subject app role (OPTIONAL, defense-in-depth, staged)

Prerequisites: staging DB with production-like data; app change implementing the `SET LOCAL rtr.org_id` transaction contract (documented in the SQL header); cross-tenant regression green on staging.

1. Run `sql/rls/10_tier2_tenant_policies.sql` on **staging** (set a real password for `rtr_app`).
2. Wire the app: after `requireAuth()`, run request queries inside `prisma.$transaction` with `SELECT set_config('rtr.org_id', $org, true)` first.
3. Point staging `DATABASE_URL` at `rtr_app` (pooler) and run the full test suite + smoke tests.
4. Cross-tenant DB-level tests (staging): with context A, attempt SELECT/UPDATE/DELETE on org-B rows — must return 0 rows / throw.
5. Only after all green: repeat on production during a low-traffic window, keep the previous `DATABASE_URL` ready for instant rollback, then re-run `20_verify_rls.sql`.
6. Evaluate §7/§8 (`FORCE RLS` on `Session`/`ApiKey`/`User`/`AuditLog`) as the final step.

## E. Architecture verdict (documented fact)

RTR360's authentication is custom and DB-backed; Supabase auth is not the identity source. Therefore:

- `auth.uid()`-style policies **cannot** be the tenant mechanism — using them would deny everything (or, worse, be bypassed by the owner role while appearing to protect it).
- The **safest practical defense-in-depth** implemented today: (1) PostgREST surface closed completely (Tier 1, fail-closed by construction); (2) application-path tenant isolation enforced in the Prisma data layer with fail-closed sentinels and proven by 323 behavioral tests; (3) a complete, validated-shaped Tier-2 path (GUC + RLS-subject role) prepared for operator-gated activation when staging validation is available.

## F. Verification matrix (this phase)

| Gate | Requirement |
|---|---|
| Structural tests | `tests/db-rls-coverage.test.ts` all pass |
| Full suite | vitest all green (existing 1162 + new) |
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors |
| `next build` | success |
| secret scan | baseline unchanged |
| Live DB | **operator-gated** via runbook (Tier 1 steps 1–6) — evidence to be archived in ops log |
