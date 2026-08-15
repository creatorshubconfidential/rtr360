#!/usr/bin/env python3
"""Fix generic tenant isolation patterns in API routes."""

import os
import re

BASE = '/home/z/my-project/src/app/api'

LIST_ROUTES = [
    'vehicles/route.ts', 'drivers/route.ts', 'geofences/route.ts',
    'maintenance/route.ts', 'alert-rules/route.ts', 'contacts/route.ts',
    'contracts/route.ts', 'invoices/route.ts', 'leads/route.ts',
    'quotations/route.ts', 'tickets/route.ts', 'technicians/route.ts',
    'subscriptions/route.ts', 'pipeline/route.ts',
]

ID_ROUTES = [
    'drivers/[id]/route.ts', 'geofences/[id]/route.ts',
    'maintenance/[id]/route.ts', 'alert-rules/[id]/route.ts',
    'contracts/[id]/route.ts', 'invoices/[id]/route.ts',
    'installations/[id]/route.ts', 'leads/[id]/route.ts',
    'quotations/[id]/route.ts', 'tickets/[id]/route.ts',
    'technicians/[id]/route.ts', 'users/[id]/route.ts',
    'subscriptions/[id]/route.ts',
]

OLD_LIST_CHECK = """if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }"""
NEW_LIST_CHECK = """// Tenant isolation via centralized helper
    Object.assign(where, getTenantFilter(user));"""

def fix_list_route(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    changed = False
    
    # Add import if missing
    if 'getTenantFilter' not in content:
        content = content.replace(
            "from '@/lib/auth';",
            "from '@/lib/auth';\nimport { getTenantFilter } from '@/lib/tenant';"
        )
        changed = True
    
    # Replace inline check
    if OLD_LIST_CHECK in content:
        content = content.replace(OLD_LIST_CHECK, NEW_LIST_CHECK)
        changed = True
    
    if changed:
        with open(filepath, 'w') as f:
            f.write(content)
    return changed

def fix_id_route(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    changed = False
    
    # Add import if missing
    if 'isTenantAccessible' not in content:
        if 'getTenantFilter' in content:
            content = content.replace(
                "from '@/lib/tenant';",
                "from '@/lib/tenant';\nimport { isTenantAccessible } from '@/lib/tenant';"
            )
        else:
            content = content.replace(
                "from '@/lib/auth';",
                "from '@/lib/auth';\nimport { isTenantAccessible } from '@/lib/tenant';"
            )
        changed = True
    
    # Replace various ownership check patterns
    replacements = [
        ("if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {",
         "if (!isTenantAccessible(user, existing.organizationId)) {"),
        ("if (user.role !== 'super_admin' && device.organizationId !== user.organizationId) {",
         "if (!isTenantAccessible(user, device.organizationId)) {"),
        ("if (user.role !== 'super_admin' && installation.organizationId !== user.organizationId) {",
         "if (!isTenantAccessible(user, installation.organizationId)) {"),
    ]
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            changed = True
    
    if changed:
        with open(filepath, 'w') as f:
            f.write(content)
    return changed

# Fix list routes
print('=== Fixing List Routes ===')
for route in LIST_ROUTES:
    filepath = os.path.join(BASE, route)
    if os.path.exists(filepath):
        if fix_list_route(filepath):
            print(f'  [FIXED] {route}')
        else:
            print(f'  [OK] {route} (already uses helper)')
    else:
        print(f'  [MISSING] {route}')

# Fix [id] routes
print('\n=== Fixing [id] Routes ===')
for route in ID_ROUTES:
    filepath = os.path.join(BASE, route)
    if os.path.exists(filepath):
        if fix_id_route(filepath):
            print(f'  [FIXED] {route}')
        else:
            print(f'  [OK] {route}')
    else:
        print(f'  [MISSING] {route}')

# Fix trips/route.ts GET (special case - filters via vehicle)
print('\n=== Fixing Special Cases ===')
trips_file = os.path.join(BASE, 'trips/route.ts')
if os.path.exists(trips_file):
    with open(trips_file, 'r') as f:
        content = f.read()
    old = """    // Tenant: filter by org via vehicle
    if (user.role !== 'super_admin' && user.organizationId) {
      where.vehicle = { organizationId: user.organizationId };
    }"""
    new = """    // Tenant isolation via centralized helper (filter by vehicle's org)
    const orgFilter = getTenantFilter(user);
    if (orgFilter.organizationId) {
      where.vehicle = { organizationId: orgFilter.organizationId };
    }"""
    if old in content:
        content = content.replace(old, new)
        if 'getTenantFilter' not in content:
            content = content.replace(
                "from '@/lib/auth';",
                "from '@/lib/auth';\nimport { getTenantFilter } from '@/lib/tenant';"
            )
        with open(trips_file, 'w') as f:
            f.write(content)
        print('  [FIXED] trips/route.ts')
    else:
        print('  [OK] trips/route.ts')

# Fix trips/[id]/route.ts (uses vehicle relation for ownership)
trips_id_file = os.path.join(BASE, 'trips/[id]/route.ts')
if os.path.exists(trips_id_file):
    with open(trips_id_file, 'r') as f:
        content = f.read()
    # This route already checks via vehicle.organizationId — it's actually correct
    # but we should add isTenantAccessible for consistency
    old = "if (user.role !== 'super_admin' && existing.vehicle?.organizationId !== user.organizationId)"
    new = "if (!isTenantAccessible(user, existing.vehicle?.organizationId ?? null))"
    if old in content:
        content = content.replace(old, new)
        if 'isTenantAccessible' not in content:
            content = content.replace(
                "from '@/lib/auth';",
                "from '@/lib/auth';\nimport { isTenantAccessible } from '@/lib/tenant';"
            )
        with open(trips_id_file, 'w') as f:
            f.write(content)
        print('  [FIXED] trips/[id]/route.ts')
    else:
        print('  [OK] trips/[id]/route.ts')

print('\n=== All generic tenant fixes complete ===')
