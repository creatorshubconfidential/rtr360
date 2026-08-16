#!/bin/bash
# RTR 360 — Build Script for Vercel
# Resolves PostgreSQL URL and ensures schema is pushed before building
set -e

echo "=== RTR 360 Build ==="

# Resolve DATABASE_URL from Supabase integration env vars if not set
if [ -z "$DATABASE_URL" ] && [ -n "$POSTGRES_PRISMA_URL" ]; then
  echo "DATABASE_URL not set, using POSTGRES_PRISMA_URL"
  export DATABASE_URL="$POSTGRES_PRISMA_URL"
fi

# Push schema to database (creates/updates tables)
if [ -n "$DATABASE_URL" ]; then
  echo "Pushing Prisma schema to database..."
  npx prisma db push --skip-generate --accept-data-loss 2>&1 || echo "Warning: prisma db push failed (tables may already exist)"
else
  echo "Warning: No DATABASE_URL or POSTGRES_PRISMA_URL found. Skipping schema push."
fi

echo "Building Next.js..."
next build

echo "=== Build Complete ==="
