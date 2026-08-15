#!/usr/bin/env python3
"""
Tenant Isolation Fix Script for RTR 360
Fixes ALL tenant isolation vulnerabilities across API routes.
"""

import re
import os

BASE = '/home/z/my-project/src/app/api'

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def add_tenant_import(content):
    """Add tenant imports if not already present."""
    if 'getTenantFilter' in content or 'isTenantAccessible' in content:
        return content, False
    
    # Add import after existing imports
    if "from '@/lib/auth'" in content:
        content = content.replace(
            "from '@/lib/auth'",
            "from '@/lib/auth'\nimport { getTenantFilter, isTenantAccessible } from '@/lib/tenant'"
        )
        return content, True
    return content, False

def fix_list_route_tenant_filter(content):
    """Replace inline tenant check with getTenantFilter() in GET list routes.
    Handles the pattern: if (user.role !== 'super_admin' && user.organizationId) { where.organizationId = ... }
    """
    # Pattern 1: Direct organizationId on where
    pattern1 = re.compile(
        r"// Tenant isolation[^
]*\n\s*if \(user\.role !== 'super_admin' && user\.organizationId\) \{\n\s*where\.organizationId = user\.organizationId;\n\s*\}",
        re.MULTILINE
    )
    replacement1 = "Object.assign(where, getTenantFilter(user));"
    
    if pattern1.search(content):
        content = pattern1.sub(replacement1, content)
        return content, True
    
    # Pattern 2: With comment variations
    pattern2 = re.compile(
        r"// Tenant[^
]*\n\s*if \(user\.role !== 'super_admin' && user\.organizationId\) \{\n\s*where\.organizationId = user\.organizationId;\n\s*\}",
        re.MULTILINE
    )
    if pattern2.search(content):
        content = pattern2.sub(replacement1, content)
        return content, True
    
    # Pattern 3: Trips-style - filter via vehicle relation
    pattern3 = re.compile(
        r"// Tenant[^
]*\n\s*if \(user\.role !== 'super_admin' && user\.organizationId\) \{\n\s*where\.vehicle = \{ organizationId: user\.organizationId \};\n\s*\}",
        re.MULTILINE
    )
    if pattern3.search(content):
        content = pattern3.sub(
            "const orgFilter = getTenantFilter(user);\n    if (orgFilter.organizationId) {\n      where.vehicle = { organizationId: orgFilter.organizationId };\n    }",
            content
        )
        return content, True
    
    return content, False

def fix_id_route_tenant_check(content):
    """Replace inline tenant check in [id] PATCH/DELETE routes.
    Pattern: if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId)
    """
    pattern = re.compile(
        r"if \(user\.role !== 'super_admin' && existing\.organizationId !== user\.organizationId\) \{",
        re.MULTILINE
    )
    replacement = "if (!isTenantAccessible(user, existing.organizationId)) {"
    
    if pattern.search(content):
        content = pattern.sub(replacement, content)
        return content, True
    return content, False

def fix_post_org_assignment(content):
    """Fix POST routes that conditionally assign organizationId.
    Pattern: if (user.organizationId) { data.organizationId = user.organizationId; }
    Fix: Always use getTenantFilter or force from user
    """
    # For routes where orgId should always come from user (not body)
    pattern = re.compile(
        r"if \(user\.organizationId\) \{\n\s*(\w+)\.organizationId = user\.organizationId;\n\s*\}",
        re.MULTILINE
    )
    replacement = r"\1.organizationId = user.organizationId || null;"
    
    if pattern.search(content):
        content = pattern.sub(replacement, content)
        return content, True
    return content, False

# ============================================================
# ROUTE-SPECIFIC FIXES
# ============================================================

def fix_devices_route(content):
    """Fix CRITICAL bugs in devices/route.ts"""
    # 1. Add import
    content, _ = add_tenant_import(content)
    
    # 2. Fix GET tenant filter (replace inline check)
    old_get = """    // Tenant isolation: org users only see their org's devices
    if (user.role !== 'super_admin') {
      if (user.organizationId) {
        where.organizationId = user.organizationId;
      }
    }"""
    
    new_get = """    // Tenant isolation via centralized helper
    Object.assign(where, getTenantFilter(user));"""
    
    if old_get in content:
        content = content.replace(old_get, new_get)
    
    # 3. Fix search OR overwriting tenant filter
    # The bug: when search is set, where.OR is overwritten, losing tenant filter
    # Fix: wrap tenant filter inside the search OR using AND
    old_search = """    if (search) {
      where.OR = [
        { imei: { contains: search } },
        { serialNumber: { contains: search } },
        { simNumber: { contains: search } },
      ];
    }"""
    
    new_search = """    if (search) {
      const searchOr = [
        { imei: { contains: search } },
        { serialNumber: { contains: search } },
        { simNumber: { contains: search } },
      ];
      // Merge with existing tenant filter using AND
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchOr },
        ];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }"""
    
    if old_search in content:
        content = content.replace(old_search, new_search)
    
    # 4. Fix statusCounts - add tenant filter
    old_status = """    const statusCounts = await db.device.groupBy({
      by: ['status'],
      _count: { status: true },
    });"""
    
    new_status = """    const statusCounts = await db.device.groupBy({
      by: ['status'],
      where: getTenantFilter(user),
      _count: { status: true },
    });"""
    
    if old_status in content:
        content = content.replace(old_status, new_status)
    
    # 5. Fix POST - assign organizationId from user
    old_post = """    if (user.organizationId) {
      deviceData.organizationId = user.organizationId;
    }"""
    
    new_post = """    // Always assign org from authenticated user (never from body)
    deviceData.organizationId = user.organizationId || null;"""
    
    if old_post in content:
        content = content.replace(old_post, new_post)
    
    return content

def fix_installations_route(content):
    """Fix installations/route.ts bugs"""
    content, _ = add_tenant_import(content)
    
    # 1. Fix GET tenant filter
    old_get = """    // Tenant isolation
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }"""
    
    new_get = """    // Tenant isolation via centralized helper
    Object.assign(where, getTenantFilter(user));"""
    
    if old_get in content:
        content = content.replace(old_get, new_get)
    
    # 2. Fix statusCounts
    old_status = """    const statusCounts = await db.installation.groupBy({
      by: ['status'],
      _count: { status: true },
    });"""
    
    new_status = """    const statusCounts = await db.installation.groupBy({
      by: ['status'],
      where: getTenantFilter(user),
      _count: { status: true },
    });"""
    
    if old_status in content:
        content = content.replace(old_status, new_status)
    
    # 3. Fix POST - add cross-org validation for vehicleId and deviceId
    old_post_validate = """    if (!vehicleId || !technicianId) {
      return NextResponse.json(
        { error: 'vehicleId and technicianId are required' },
        { status: 400 }
      );
    }"""
    
    new_post_validate = """    if (!vehicleId || !technicianId) {
      return NextResponse.json(
        { error: 'vehicleId and technicianId are required' },
        { status: 400 }
      );
    }

    // Cross-org validation: ensure vehicle belongs to user's org
    if (user.role !== 'super_admin') {
      const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle || !isTenantAccessible(user, vehicle.organizationId)) {
        return NextResponse.json({ error: 'Vehicle not found or access denied' }, { status: 403 });
      }
    }"""
    
    if old_post_validate in content:
        content = content.replace(old_post_validate, new_post_validate)
    
    return content

def fix_users_route(content):
    """Fix users/route.ts - prevent organizationId escalation from request body"""
    content, _ = add_tenant_import(content)
    
    # Fix GET tenant filter
    old_get = """    // Tenant isolation
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }"""
    
    new_get = """    // Tenant isolation via centralized helper
    Object.assign(where, getTenantFilter(user));"""
    
    if old_get in content:
        content = content.replace(old_get, new_get)
    
    # Fix POST - prevent orgId from body for non-super_admin
    old_org = """      organizationId: organizationId || user.organizationId || null,"""
    new_org = """      // Non-super_admin cannot set orgId from body — always use their own org
      organizationId: user.role === 'super_admin' ? (organizationId || null) : (user.organizationId || null),"""
    
    if old_org in content:
        content = content.replace(old_org, new_org)
    
    return content

def fix_activities_route(content):
    """Fix activities/route.ts - add opportunityId ownership check and orgId on POST"""
    # Add isTenantAccessible import if not present
    if 'isTenantAccessible' not in content:
        content = content.replace(
            "from '@/lib/tenant'",
            "from '@/lib/tenant'\nimport { isTenantAccessible } from '@/lib/tenant'"
        ) if 'from' in content else content
    
    # The activities route already uses getTenantFilter for GET
    # Need to add opportunityId ownership check
    old_opp = """    if (opportunityId) where.opportunityId = opportunityId;"""
    new_opp = """    if (opportunityId) {
      // Verify opportunity belongs to user's org before filtering
      const opp = await db.opportunity.findUnique({ where: { id: opportunityId } });
      if (!opp || !isTenantAccessible(user, opp.organizationId)) {
        return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
      }
      where.opportunityId = opportunityId;
    }"""
    
    if old_opp in content:
        content = content.replace(old_opp, new_opp)
    
    # Add organizationId to POST data
    # Find the activity creation and add orgId
    old_create = """    const activity = await db.activity.create({
      data: {
        userId: user.id,"""
    new_create = """    const activity = await db.activity.create({
      data: {
        organizationId: user.organizationId || null,
        userId: user.id,"""
    
    if old_create in content:
        content = content.replace(old_create, new_create)
    
    return content

def fix_audit_logs_route(content):
    """Fix audit-logs/route.ts - add tenant filter for platform_admin"""
    content, added = add_tenant_import(content)
    
    # Add tenant filter after role check
    old = """    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;"""
    
    new = """    const where: Record<string, unknown> = {};
    // platform_admin can only see their own org's audit logs
    if (user.role === 'platform_admin') {
      Object.assign(where, getTenantFilter(user));
    }
    if (action) where.action = action;
    if (entity) where.entity = entity;"""
    
    if old in content:
        content = content.replace(old, new)
    
    return content

def fix_settings_route(content):
    """Fix settings/route.ts - scope settings to user's org"""
    content, _ = add_tenant_import(content)
    
    old = """    const settings = await db.setting.findMany({
      orderBy: { key: 'asc' },
    });"""
    
    new = """    // Non-super_admin users only see their org's settings
    const orgFilter = getTenantFilter(user);
    const settings = await db.setting.findMany({
      where: orgFilter.organizationId ? { organizationId: orgFilter.organizationId } : undefined,
      orderBy: { key: 'asc' },
    });"""
    
    if old in content:
        content = content.replace(old, new)
    
    return content

# ============================================================
# GENERIC FIXES FOR STANDARD ROUTES
# ============================================================

def generic_list_fix(filepath):
    """Apply standard tenant filter fix to list routes."""
    content = read_file(filepath)
    content, import_added = add_tenant_import(content)
    content, filter_fixed = fix_list_route_tenant_filter(content)
    if import_added or filter_fixed:
        write_file(filepath, content)
        return True
    return False

def generic_id_fix(filepath):
    """Apply standard tenant check fix to [id] routes."""
    content = read_file(filepath)
    content, import_added = add_tenant_import(content)
    content, check_fixed = fix_id_route_tenant_check(content)
    if import_added or check_fixed:
        write_file(filepath, content)
        return True
    return False

# ============================================================
# MAIN EXECUTION
# ============================================================

fixes = []

# 1. Fix CRITICAL: devices/route.ts
path = f'{BASE}/devices/route.ts'
content = fix_devices_route(read_file(path))
write_file(path, content)
fixes.append(('CRITICAL', 'devices/route.ts', 'Fixed search OR override, statusCounts leak, POST orgId'))

# 2. Fix CRITICAL: installations/route.ts
path = f'{BASE}/installations/route.ts'
content = fix_installations_route(read_file(path))
write_file(path, content)
fixes.append(('CRITICAL', 'installations/route.ts', 'Fixed statusCounts leak, POST cross-org validation'))

# 3. Fix HIGH: users/route.ts
path = f'{BASE}/users/route.ts'
content = fix_users_route(read_file(path))
write_file(path, content)
fixes.append(('HIGH', 'users/route.ts', 'Prevented organizationId escalation from request body'))

# 4. Fix HIGH: activities/route.ts
path = f'{BASE}/activities/route.ts'
content = fix_activities_route(read_file(path))
write_file(path, content)
fixes.append(('HIGH', 'activities/route.ts', 'Added opportunityId ownership check, orgId on POST'))

# 5. Fix MEDIUM: audit-logs/route.ts
path = f'{BASE}/audit-logs/route.ts'
content = fix_audit_logs_route(read_file(path))
write_file(path, content)
fixes.append(('MEDIUM', 'audit-logs/route.ts', 'Added tenant filter for platform_admin'))

# 6. Fix MEDIUM: settings/route.ts
path = f'{BASE}/settings/route.ts'
content = fix_settings_route(read_file(path))
write_file(path, content)
fixes.append(('MEDIUM', 'settings/route.ts', 'Scoped settings to user\'s organization'))

# 7. Generic list route fixes (Pattern A → getTenantFilter)
list_routes = [
    'vehicles/route.ts',
    'drivers/route.ts',
    'geofences/route.ts',
    'maintenance/route.ts',
    'alert-rules/route.ts',
    'contacts/route.ts',
    'contracts/route.ts',
    'invoices/route.ts',
    'leads/route.ts',
    'quotations/route.ts',
    'tickets/route.ts',
    'technicians/route.ts',
    'subscriptions/route.ts',
    'pipeline/route.ts',
]

for route in list_routes:
    path = f'{BASE}/{route}'
    if os.path.exists(path):
        if generic_list_fix(path):
            fixes.append(('HIGH', route, 'Replaced inline tenant check with getTenantFilter()'))

# 8. Generic [id] route fixes (Pattern C → isTenantAccessible)
id_routes = [
    'drivers/[id]/route.ts',
    'geofences/[id]/route.ts',
    'maintenance/[id]/route.ts',
    'alert-rules/[id]/route.ts',
    'contracts/[id]/route.ts',
    'invoices/[id]/route.ts',
    'leads/[id]/route.ts',
    'quotations/[id]/route.ts',
    'tickets/[id]/route.ts',
    'technicians/[id]/route.ts',
    'users/[id]/route.ts',
    'subscriptions/[id]/route.ts',
]

for route in id_routes:
    path = f'{BASE}/{route}'
    if os.path.exists(path):
        if generic_id_fix(path):
            fixes.append(('HIGH', route, 'Replaced inline tenant check with isTenantAccessible()'))

# 9. Fix devices/[id]/route.ts - uses different variable pattern
path = f'{BASE}/devices/[id]/route.ts'
if os.path.exists(path):
    content = read_file(path)
    content, _ = add_tenant_import(content)
    # This route might use a different pattern
    old = "if (user.role !== 'super_admin' && device.organizationId !== user.organizationId)"
    new = "if (!isTenantAccessible(user, device.organizationId))"
    if old in content:
        content = content.replace(old, new)
        write_file(path, content)
        fixes.append(('HIGH', 'devices/[id]/route.ts', 'Replaced inline tenant check with isTenantAccessible()'))

# 10. Fix installations/[id]/route.ts
path = f'{BASE}/installations/[id]/route.ts'
if os.path.exists(path):
    content = read_file(path)
    content, _ = add_tenant_import(content)
    old = "if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId)"
    new = "if (!isTenantAccessible(user, existing.organizationId))"
    if old in content:
        content = content.replace(old, new)
        write_file(path, content)
        fixes.append(('HIGH', 'installations/[id]/route.ts', 'Replaced inline tenant check with isTenantAccessible()'))

# Print results
print(f'\n=== Tenant Isolation Fixes Applied: {len(fixes)} ===\n')
for severity, file, desc in fixes:
    print(f'  [{severity}] {file}: {desc}')

print(f'\nTotal files modified: {len(fixes)}')
