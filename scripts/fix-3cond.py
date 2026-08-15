#!/usr/bin/env python3
"""Fix 3-condition tenant check pattern in [id] routes."""
import os

BASE = '/home/z/my-project/src/app/api'
ROUTES = [
    'tickets/[id]/route.ts',
    'technicians/[id]/route.ts',
    'drivers/[id]/route.ts',
    'maintenance/[id]/route.ts',
    'installations/[id]/route.ts',
]

OLD = """if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }"""
NEW = """if (!isTenantAccessible(user, existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }"""

for route in ROUTES:
    fp = os.path.join(BASE, route)
    if not os.path.exists(fp):
        print(f'[MISSING] {route}')
        continue
    with open(fp, 'r') as f:
        content = f.read()
    if 'isTenantAccessible' not in content:
        content = content.replace(
            "from '@/lib/auth';",
            "from '@/lib/auth';\nimport { isTenantAccessible } from '@/lib/tenant';"
        )
    if OLD in content:
        content = content.replace(OLD, NEW)
        with open(fp, 'w') as f:
            f.write(content)
        print(f'[FIXED] {route}')
    else:
        print(f'[OK/OTHER] {route}')