#!/bin/bash
# Fix generic tenant isolation patterns in API routes

BASE="/home/z/my-project/src/app/api"

# Pattern 1: Replace inline tenant check with getTenantFilter() in list routes
# This handles the exact pattern found in: vehicles, drivers, geofences, maintenance,
# alert-rules, contacts, contracts, invoices, leads, quotations, tickets, technicians, subscriptions, pipeline

LIST_ROUTES=(
  "vehicles/route.ts"
  "drivers/route.ts"
  "geofences/route.ts"
  "maintenance/route.ts"
  "alert-rules/route.ts"
  "contacts/route.ts"
  "contracts/route.ts"
  "invoices/route.ts"
  "leads/route.ts"
  "quotations/route.ts"
  "tickets/route.ts"
  "technicians/route.ts"
  "subscriptions/route.ts"
  "pipeline/route.ts"
)

OLD_CHECK="if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }"
NEW_CHECK="// Tenant isolation via centralized helper
    Object.assign(where, getTenantFilter(user));"

for route in "${LIST_ROUTES[@]}"; do
  FILE="$BASE/$route"
  if [ -f "$FILE" ]; then
    # Check if file has the old pattern
    if rg -q "user.role !== 'super_admin' && user.organizationId" "$FILE" 2>/dev/null; then
      # Add import if not present
      if ! rg -q "getTenantFilter" "$FILE" 2>/dev/null; then
        sed -i "s|from '@/lib/auth';|from '@/lib/auth';\nimport { getTenantFilter } from '@/lib/tenant';|" "$FILE"
        echo "  [IMPORT] $route"
      fi
      # Replace the inline check
      # Use python for reliable multi-line replacement
      python3 -c "
import sys
with open('$FILE', 'r') as f:
    content = f.read()
old = """if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }"""
new = """// Tenant isolation via centralized helper
    Object.assign(where, getTenantFilter(user));"""
if old in content:
    content = content.replace(old, new)
    with open('$FILE', 'w') as f:
        f.write(content)
    print(f'  [FIXED] $route')
else:
    print(f'  [SKIP] $route (pattern not found)')
"
    else
      echo "  [OK] $route (already uses getTenantFilter)"
    fi
  else
    echo "  [MISSING] $route"
  fi
done

echo ""

# Pattern 2: Fix [id] routes - replace inline ownership check with isTenantAccessible
ID_ROUTES=(
  "drivers/[id]/route.ts"
  "geofences/[id]/route.ts"
  "maintenance/[id]/route.ts"
  "alert-rules/[id]/route.ts"
  "contracts/[id]/route.ts"
  "invoices/[id]/route.ts"
  "installations/[id]/route.ts"
  "leads/[id]/route.ts"
  "quotations/[id]/route.ts"
  "tickets/[id]/route.ts"
  "technicians/[id]/route.ts"
  "users/[id]/route.ts"
  "subscriptions/[id]/route.ts"
)

for route in "${ID_ROUTES[@]}"; do
  FILE="$BASE/$route"
  if [ -f "$FILE" ]; then
    # Add import if not present
    if ! rg -q "isTenantAccessible" "$FILE" 2>/dev/null; then
      if rg -q "getTenantFilter" "$FILE" 2>/dev/null; then
        sed -i "s|from '@/lib/tenant';|from '@/lib/tenant';\nimport { isTenantAccessible } from '@/lib/tenant';|" "$FILE" 2>/dev/null
      else
        sed -i "s|from '@/lib/auth';|from '@/lib/auth';\nimport { isTenantAccessible } from '@/lib/tenant';|" "$FILE"
      fi
      echo "  [IMPORT] $route"
    fi
    
    # Replace inline ownership check patterns
    python3 -c "
import sys
with open('$FILE', 'r') as f:
    content = f.read()

# Pattern: existing.organizationId
old1 = """if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {"""
new1 = """if (!isTenantAccessible(user, existing.organizationId)) {"""
if old1 in content:
    content = content.replace(old1, new1)

# Pattern: device.organizationId
old2 = """if (user.role !== 'super_admin' && device.organizationId !== user.organizationId) {"""
new2 = """if (!isTenantAccessible(user, device.organizationId)) {"""
if old2 in content:
    content = content.replace(old2, new2)

# Pattern: installation.organizationId
old3 = """if (user.role !== 'super_admin' && installation.organizationId !== user.organizationId) {"""
new3 = """if (!isTenantAccessible(user, installation.organizationId)) {"""
if old3 in content:
    content = content.replace(old3, new3)

changed = any(p in content for p in [old1, old2, old3]) or \n    old1 not in content and old2 not in content and old3 not in content
    
with open('$FILE', 'w') as f:
    f.write(content)
    
if old1 not in content and old2 not in content and old3 not in content:
    print(f'  [FIXED] $route')
else:
    print(f'  [CHECK] $route')
"
  else
    echo "  [MISSING] $route"
  fi
done

echo ""
echo "=== Generic tenant fixes complete ==="
