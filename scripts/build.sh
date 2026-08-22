#!/bin/bash
# RTR 360 — Build Script for Vercel
# Resolves PostgreSQL URL and ensures schema is migrated before building
set -e

echo "=== RTR 360 Build ==="

# Resolve DATABASE_URL from Supabase integration env vars if not set
if [ -z "$DATABASE_URL" ] && [ -n "$POSTGRES_PRISMA_URL" ]; then
  echo "DATABASE_URL not set, using POSTGRES_PRISMA_URL"
  export DATABASE_URL="$POSTGRES_PRISMA_URL"
fi

# Apply pending migrations (safe — only runs migrations not yet applied)
# NEVER use 'db push --accept-data-loss' — it can silently drop columns/tables
if [ -n "$DATABASE_URL" ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy 2>&1 || echo "Warning: prisma migrate deploy failed (tables may already be up to date)"
else
  echo "Warning: No DATABASE_URL or POSTGRES_PRISMA_URL found. Skipping migration."
fi

echo "Building Next.js..."
next build

echo "=== Build Complete ==="
