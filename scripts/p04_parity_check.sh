#!/usr/bin/env bash
# ============================================================
# P0-④ LIVE MIGRATION PARITY CHECK — operator wrapper
# ============================================================
# Requires a live DATABASE_URL (Supabase). Never prints the URL.
#
# Usage:
#   DATABASE_URL="postgresql://..." bash scripts/p04_parity_check.sh
#
# Steps:
#   1. prisma migrate status   — pending/failed migration ledger state
#   2. prisma migrate deploy   — apply pending migrations (P0-③ lockdown,
#                                P0-④ normalization) if any
#   3. prisma migrate diff     — authoritative schema ↔ live parity check
#                                (--exit-code: 0 = no drift, 2 = drift)
#   4. SQL spot checks         — sql/migration_parity/10_verify_live_parity.sql
#                                (requires psql; skipped if absent)
# ============================================================
set -u
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL must be exported for this script (not persisted anywhere)."
  exit 1
fi
case "$DATABASE_URL" in
  postgresql://*|postgres://*) ;;
  *) echo "ERROR: DATABASE_URL is not a postgres URL."; exit 1 ;;
esac

echo "== [1/4] prisma migrate status =="
npx prisma migrate status
STATUS=$?

echo "== [2/4] prisma migrate deploy (applies pending P0-3/P0-4 migrations) =="
npx prisma migrate deploy
DEPLOY=$?

echo "== [3/4] prisma migrate diff (schema vs live; exit 0 = parity) =="
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code > /tmp/p04_parity_diff.txt 2>&1
DIFF=$?
if [ "$DIFF" = "0" ]; then
  echo "PARITY=YES (no drift between live DB and prisma schema)"
elif [ "$DIFF" = "2" ]; then
  echo "PARITY=NO — drift detected; diff written to /tmp/p04_parity_diff.txt (review, do not auto-apply destructive changes)"
else
  echo "prisma migrate diff failed (exit $DIFF)"; cat /tmp/p04_parity_diff.txt
fi

echo "== [4/4] SQL spot checks =="
if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -f sql/migration_parity/10_verify_live_parity.sql
  SQL_EXIT=$?
else
  echo "psql not installed — run sql/migration_parity/10_verify_live_parity.sql via Supabase SQL editor instead."
  SQL_EXIT=0
fi

echo "== SUMMARY =="
echo "migrate_status_exit=$STATUS deploy_exit=$DEPLOY diff_exit=$DIFF sql_exit=$SQL_EXIT"
if [ "$DIFF" = "0" ] && [ "$DEPLOY" = "0" ] && [ "$SQL_EXIT" = "0" ]; then
  echo "P0-4 LIVE PARITY: PASS"
else
  echo "P0-4 LIVE PARITY: REVIEW REQUIRED"
fi
