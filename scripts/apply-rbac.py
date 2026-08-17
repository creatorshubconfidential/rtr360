#!/usr/bin/env python3
"""
STEP 4 (P1-1): Apply RBAC requirePermission() to all API routes that are missing it.
This script programmatically adds permission checks to 28 route files.
"""

import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ─── Route → Permission mapping ───────────────────────────────────
# Format: { relative_file_path: [(import_const, import_alias, methods_to_protect)] }

ROUTE_PERMISSIONS = {
    # --- Fleet Operations ---
    'src/app/api/vehicles/route.ts': [
        ('VEHICLES_MANAGE', 'VEHICLES_MANAGE', ['POST']),
    ],
    'src/app/api/drivers/route.ts': [
        ('DRIVERS_MANAGE', 'DRIVERS_MANAGE', ['POST']),
    ],
    'src/app/api/drivers/[id]/route.ts': [
        ('DRIVERS_MANAGE', 'DRIVERS_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/devices/route.ts': [
        ('DEVICES_MANAGE', 'DEVICES_MANAGE', ['POST']),
    ],
    'src/app/api/devices/[id]/route.ts': [
        ('DEVICES_MANAGE', 'DEVICES_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/trips/[id]/route.ts': [
        ('TRIPS_MANAGE', 'TRIPS_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/geofences/route.ts': [
        ('GEOFENCES_MANAGE', 'GEOFENCES_MANAGE', ['POST']),
    ],
    'src/app/api/geofences/[id]/route.ts': [
        ('GEOFENCES_MANAGE', 'GEOFENCES_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/maintenance/route.ts': [
        ('MAINTENANCE_MANAGE', 'MAINTENANCE_MANAGE', ['POST']),
    ],
    'src/app/api/maintenance/[id]/route.ts': [
        ('MAINTENANCE_MANAGE', 'MAINTENANCE_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/installations/route.ts': [
        ('INSTALLATIONS_MANAGE', 'INSTALLATIONS_MANAGE', ['POST']),
    ],
    'src/app/api/installations/[id]/route.ts': [
        ('INSTALLATIONS_MANAGE', 'INSTALLATIONS_MANAGE', ['PATCH']),
    ],
    'src/app/api/technicians/route.ts': [
        ('TECHNICIANS_MANAGE', 'TECHNICIANS_MANAGE', ['POST']),
    ],
    'src/app/api/technicians/[id]/route.ts': [
        ('TECHNICIANS_MANAGE', 'TECHNICIANS_MANAGE', ['PATCH', 'DELETE']),
    ],
    # --- CRM ---
    'src/app/api/leads/[id]/route.ts': [
        ('LEADS_MANAGE', 'LEADS_MANAGE', ['PATCH']),
    ],
    'src/app/api/contracts/route.ts': [
        ('CONTRACTS_MANAGE', 'CONTRACTS_MANAGE', ['POST']),
    ],
    'src/app/api/contracts/[id]/route.ts': [
        ('CONTRACTS_MANAGE', 'CONTRACTS_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/activities/route.ts': [
        ('ACTIVITIES_MANAGE', 'ACTIVITIES_MANAGE', ['POST']),
    ],
    # --- Billing ---
    'src/app/api/invoices/[id]/route.ts': [
        ('INVOICES_MANAGE', 'INVOICES_MANAGE', ['PATCH']),
    ],
    'src/app/api/subscriptions/[id]/route.ts': [
        ('SUBSCRIPTIONS_MANAGE', 'SUBSCRIPTIONS_MANAGE', ['PATCH']),
    ],
    # --- Operations ---
    'src/app/api/tickets/route.ts': [
        ('TICKETS_MANAGE', 'TICKETS_MANAGE', ['POST']),
    ],
    'src/app/api/tickets/[id]/route.ts': [
        ('TICKETS_MANAGE', 'TICKETS_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/alert-rules/route.ts': [
        ('ALERT_RULES_MANAGE', 'ALERT_RULES_MANAGE', ['POST']),
    ],
    'src/app/api/alert-rules/[id]/route.ts': [
        ('ALERT_RULES_MANAGE', 'ALERT_RULES_MANAGE', ['PATCH', 'DELETE']),
    ],
    # --- Platform ---
    'src/app/api/users/route.ts': [
        ('USERS_MANAGE', 'USERS_MANAGE', ['POST']),
    ],
    'src/app/api/users/[id]/route.ts': [
        ('USERS_MANAGE', 'USERS_MANAGE', ['PATCH', 'DELETE']),
    ],
    'src/app/api/settings/route.ts': [
        ('SETTINGS_MANAGE', 'SETTINGS_MANAGE', ['PUT']),
    ],
    'src/app/api/ai/chat/route.ts': [
        ('AI_USE', 'AI_USE', ['POST']),
    ],
}

# ─── Admin routes to normalize (replace manual auth with getAuthUser + requirePermission) ───

ADMIN_ROUTES = {
    'src/app/api/admin/organizations/route.ts': 'ADMIN_MANAGE',
    'src/app/api/admin/organizations/[id]/route.ts': 'ADMIN_MANAGE',
    'src/app/api/admin/organizations/[id]/branding/route.ts': 'ADMIN_MANAGE',
    'src/app/api/admin/organizations/[id]/usage/route.ts': 'ADMIN_MANAGE',
    'src/app/api/admin/platform-stats/route.ts': 'ADMIN_MANAGE',
}


def add_permission_import(content: str, perm_const: str) -> str:
    """Add requirePermission and the permission constant to the import from @/lib/permissions, or add a new import."""
    # Check if there's already an import from '@/lib/permissions'
    existing_perm_import = re.search(r"import\s*\{([^}]+)\}\s*from\s*'@/lib/permissions';", content)
    if existing_perm_import:
        existing_items = [item.strip() for item in existing_perm_import.group(1).split(',')]
        if 'requirePermission' not in existing_items:
            existing_items.insert(0, 'requirePermission')
        if perm_const not in existing_items:
            existing_items.append(perm_const)
        new_import = f"import {{ {', '.join(existing_items)} }} from '@/lib/permissions';"
        content = content[:existing_perm_import.start()] + new_import + content[existing_perm_import.end():]
        return content
    
    # Check if there's an import from '@/lib/auth' — add permissions import after it
    auth_import = re.search(r"import\s*\{[^}]+\}\s*from\s*'@/lib/auth';\s*\n", content)
    if auth_import:
        insert_pos = auth_import.end()
        new_import = f"import {{ requirePermission, {perm_const} }} from '@/lib/permissions';\n"
        content = content[:insert_pos] + new_import + content[insert_pos:]
        return content
    
    # Fallback: add after the last import line at the top
    last_import = list(re.finditer(r"^import\s+.*;\s*$", content, re.MULTILINE))
    if last_import:
        insert_pos = last_import[-1].end()
        new_import = f"\nimport {{ requirePermission, {perm_const} }} from '@/lib/permissions';\n"
        content = content[:insert_pos] + new_import + content[insert_pos:]
        return content
    
    # Last resort: add at the beginning
    return f"import {{ requirePermission, {perm_const} }} from '@/lib/permissions';\n\n" + content


def inject_permission_check(content: str, method: str, perm_const: str) -> str:
    """Inject requirePermission check right after the getAuthUser call in the specified method."""
    # Pattern: find 'const { user, error } = await getAuthUser(request);' followed by 'if (error) return error;'
    # Then inject the permission check right after
    
    # We need to find the specific method (GET/POST/PATCH/PUT/DELETE) and inject after auth
    method_pattern = rf'(export\s+async\s+function\s+{method}\s*\([^)]*\)\s*\{{[^}}]*?const\s*\{{\s*user\s*,\s*error\s*\}}\s*=\s*await\s+getAuthUser\(request\);\s*\n\s*if\s*\(error\)\s+return\s+error;)'
    
    match = re.search(method_pattern, content, re.DOTALL)
    if match:
        insert_pos = match.end()
        # Use 4-space indent to match existing code style
        check_code = f"\n\n    // RBAC: {perm_const}\n    const permErr = requirePermission(user, {perm_const});\n    if (permErr) return permErr;"
        content = content[:insert_pos] + check_code + content[insert_pos:]
        return content
    
    print(f"  ⚠️  Could not find auth pattern for {method} — skipping injection")
    return content


def replace_inline_role_check(content: str, perm_const: str) -> str:
    """
    For users/route.ts POST: Replace the inline 3-role check with requirePermission.
    The inline check is: if (user.role !== 'super_admin' && user.role !== 'platform_admin' && user.role !== 'org_owner')
    """
    # Pattern for the users POST inline check
    inline_pattern = r"if\s*\(user\.role\s*!==\s*'super_admin'\s*&&\s*user\.role\s*!==\s*'platform_admin'\s*&&\s*user\.role\s*!==\s*'org_owner'\s*\)\s*\{\s*\n\s*return\s+NextResponse\.json\(\s*\{\s*error:\s*'Insufficient permissions'\s*\}\s*,\s*\{\s*status:\s*403\s*\}\s*\);\s*\n\s*\}"
    
    match = re.search(inline_pattern, content)
    if match:
        replacement = f"// RBAC: {perm_const}\n    const permErr = requirePermission(user, {perm_const});\n    if (permErr) return permErr;"
        content = content[:match.start()] + replacement + content[match.end():]
        return content
    
    return content


def normalize_admin_route(filepath: str, content: str, perm_const: str) -> str:
    """
    Normalize admin routes: replace manual token extraction + verifySession with getAuthUser + requirePermission.
    """
    # Replace the manual token extraction block with getAuthUser
    # The pattern is a ~10-line block that extracts token from headers/cookies
    
    manual_auth_pattern = re.compile(
        r"const\s+authHeader\s*=\s*request\.headers\.get\('Authorization'\);\s*\n"
        r"const\s+cookieHeader\s*=\s*request\.headers\.get\('Cookie'\);\s*\n"
        r"let\s+token:\s*string\s*\|\s*null\s*=\s*null;\s*\n"
        r"if\s*\(authHeader\)\s*token\s*=\s*authHeader\.replace\('Bearer\s+',\s*''\);\s*\n"
        r"if\s*\(!token\s*&&\s*cookieHeader\)\s*\{\s*\n"
        r"const\s+match\s*=\s*cookieHeader\.match\(/\(\?:\^\|;\\\s*\*\)rtr_session=\(\[\^;\]\*\)/\);\s*\n"
        r"if\s*\(match\)\s*token\s*=\s*decodeURIComponent\(match\[1\]\);\s*\n"
        r"\}\s*\n"
        r"const\s+session\s*=\s*await\s+verifySession\(token\s*\|\|\s*''\);\s*\n"
        r"if\s*\(!session\s*\|\|\s*session\.role\s*!==\s*'super_admin'\)\s*\{\s*\n"
        r"return\s+Response\.json\(\s*\{\s*error:\s*['\"]Forbidden[^\"]*['\"]\s*\}\s*,\s*\{\s*status:\s*403\s*\}\s*\);\s*\n"
        r"\}"
    )
    
    matches = list(manual_auth_pattern.finditer(content))
    if not matches:
        print(f"  ⚠️  No manual auth pattern found in {filepath}")
        return content
    
    # Replace from the end to preserve positions
    for match in reversed(matches):
        replacement = "const { user, error } = await getAuthUser(request);\n    if (error) return error;\n\n    // RBAC: ADMIN_MANAGE\n    const permErr = requirePermission(user, ADMIN_MANAGE);\n    if (permErr) return permErr;"
        content = content[:match.start()] + replacement + content[match.end():]
    
    return content


def fix_admin_imports(content: str) -> str:
    """
    Fix imports for admin routes:
    - Remove verifySession import (if only used for auth)
    - Add getAuthUser import
    - Add requirePermission + ADMIN_MANAGE import
    """
    # Remove verifySession from imports if present
    # Replace 'NextRequest' with 'Request' in function signatures
    content = re.sub(r'NextRequest', 'Request', content)
    
    # Fix imports from '@/lib/auth'
    auth_import_match = re.search(r"import\s*\{([^}]+)\}\s*from\s*'@/lib/auth';", content)
    if auth_import_match:
        items = [item.strip() for item in auth_import_match.group(1).split(',')]
        # Remove verifySession, createSession, hashPassword, validatePasswordStrength if they were only for admin auth
        # Keep hashPassword/validatePasswordStrength if still used (e.g., in org create)
        items_to_remove = []
        for item in items:
            if item == 'verifySession':
                items_to_remove.append(item)
        
        for item in items_to_remove:
            items.remove(item)
        
        if 'getAuthUser' not in items:
            items.insert(0, 'getAuthUser')
        
        new_import = f"import {{ {', '.join(items)} }} from '@/lib/auth';"
        content = content[:auth_import_match.start()] + new_import + content[auth_import_match.end():]
    else:
        # Add new import
        content = "import { getAuthUser } from '@/lib/auth';\n" + content
    
    # Add or merge permissions import
    existing_perm_import = re.search(r"import\s*\{([^}]+)\}\s*from\s*'@/lib/permissions';", content)
    if existing_perm_import:
        items = [item.strip() for item in existing_perm_import.group(1).split(',')]
        if 'requirePermission' not in items:
            items.insert(0, 'requirePermission')
        if 'ADMIN_MANAGE' not in items:
            items.append('ADMIN_MANAGE')
        new_import = f"import {{ {', '.join(items)} }} from '@/lib/permissions';"
        content = content[:existing_perm_import.start()] + new_import + content[existing_perm_import.end():]
    else:
        # Add after auth import
        auth_import = re.search(r"import\s*\{[^}]+\}\s*from\s*'@/lib/auth';\s*\n", content)
        if auth_import:
            insert_pos = auth_import.end()
            content = content[:insert_pos] + "import { requirePermission, ADMIN_MANAGE } from '@/lib/permissions';\n" + content[insert_pos:]
    
    return content


def fix_session_references(content: str) -> str:
    """Replace any remaining 'session.' references with 'user.' in admin routes."""
    # Only replace 'session.role' and 'session.id' type references, not session DB operations
    content = re.sub(r'session\.role', 'user.role', content)
    content = re.sub(r'session\.id', 'user.id', content)
    content = re.sub(r'session\.email', 'user.email', content)
    content = re.sub(r'session\.name', 'user.name', content)
    content = re.sub(r'session\.organizationId', 'user.organizationId', content)
    return content


def main():
    stats = {"modified": 0, "skipped": 0, "errors": 0}
    
    print("=" * 60)
    print("STEP 4 (P1-1): Applying RBAC requirePermission() to all routes")
    print("=" * 60)
    
    # ─── Phase 1: Standard route files ───
    print("\n📍 Phase 1: Standard routes (28 files)")
    for filepath, perms in ROUTE_PERMISSIONS.items():
        full_path = os.path.join(BASE, filepath)
        if not os.path.exists(full_path):
            print(f"  ❌ {filepath} — file not found")
            stats["errors"] += 1
            continue
        
        with open(full_path, 'r') as f:
            content = f.read()
        
        original = content
        
        for perm_const, perm_alias, methods in perms:
            # Add import
            content = add_permission_import(content, perm_const)
            
            # For users/route.ts POST — replace inline role check instead of injecting
            if filepath == 'src/app/api/users/route.ts' and 'POST' in methods:
                content = replace_inline_role_check(content, perm_const)
                continue
            
            # For settings/route.ts PUT — replace inline role check
            if filepath == 'src/app/api/settings/route.ts' and 'PUT' in methods:
                # Replace the inline check for PUT only
                inline_put = re.search(
                    r"(export\s+async\s+function\s+PUT[^{]*\{[^}]*?const\s*\{\s*user\s*,\s*error\s*\}\s*=\s*await\s+getAuthUser\(request\);\s*\n\s*if\s*\(error\)\s+return\s+error;\s*\n)\s*if\s*\(user\.role\s*!==\s*'super_admin'\s*&&\s*user\.role\s*!==\s*'platform_admin'\)\s*\{\s*\n\s*return\s+NextResponse\.json\(\s*\{\s*error:\s*'[^']*'\s*\}\s*,\s*\{\s*status:\s*403\s*\}\s*\);\s*\n\s*\}",
                    content, re.DOTALL
                )
                if inline_put:
                    replacement = inline_put.group(1) + f"\n    // RBAC: {perm_const}\n    const permErr = requirePermission(user, {perm_const});\n    if (permErr) return permErr;"
                    content = content[:inline_put.start()] + replacement + content[inline_put.end():]
                    continue
            
            # Standard injection for all other routes
            for method in methods:
                content = inject_permission_check(content, method, perm_const)
        
        if content != original:
            with open(full_path, 'w') as f:
                f.write(content)
            methods_str = ', '.join([m for _, _, methods in perms for m in methods])
            print(f"  ✅ {filepath} — added {perm_const} to {methods_str}")
            stats["modified"] += 1
        else:
            print(f"  ⏭️  {filepath} — no changes needed (already has RBAC or pattern not found)")
            stats["skipped"] += 1
    
    # ─── Phase 2: Admin route normalization ───
    print("\n📍 Phase 2: Admin routes normalization (5 files)")
    for filepath, perm_const in ADMIN_ROUTES.items():
        full_path = os.path.join(BASE, filepath)
        if not os.path.exists(full_path):
            print(f"  ❌ {filepath} — file not found")
            stats["errors"] += 1
            continue
        
        with open(full_path, 'r') as f:
            content = f.read()
        
        original = content
        
        # Step 1: Fix imports
        content = fix_admin_imports(content)
        
        # Step 2: Replace manual auth blocks
        content = normalize_admin_route(filepath, content, perm_const)
        
        # Step 3: Fix remaining session references
        content = fix_session_references(content)
        
        if content != original:
            with open(full_path, 'w') as f:
                f.write(content)
            print(f"  ✅ {filepath} — normalized to getAuthUser + {perm_const}")
            stats["modified"] += 1
        else:
            print(f"  ⏭️  {filepath} — no changes needed")
            stats["skipped"] += 1
    
    # ─── Summary ───
    print("\n" + "=" * 60)
    print(f"Results: {stats['modified']} modified, {stats['skipped']} skipped, {stats['errors']} errors")
    print("=" * 60)


if __name__ == '__main__':
    main()
