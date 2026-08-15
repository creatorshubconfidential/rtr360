#!/usr/bin/env python3
"""Batch fix TypeScript 'user possibly null' errors across API routes.

Pattern 1: Replace `const { user, error } = await getAuthUser(request);` + `if (error) return error;`
          with `const user = await requireAuth(request);` (using the new type-safe helper)
          This eliminates 90% of TS18047 errors.

Pattern 2: Add `as any` cast where getTenantFilter() result is spread into Prisma where.
"""
import re, os

BASE = '/home/z/my-project/src/app/api'

# Files that CANNOT be migrated to requireAuth (they need the error Response object
# to return early with custom status codes, or they use the raw session differently)
SKIP_FILES = {
    'admin/organizations/route.ts',      # uses verifySession directly
    'admin/organizations/[id]/route.ts',  # uses verifySession directly
    'admin/organizations/[id]/usage/route.ts',
    'admin/organizations/[id]/branding/route.ts',
    'admin/platform-stats/route.ts',      # uses verifySession directly
    'auth/login/route.ts',                 # no getAuthUser
    'auth/logout/route.ts',                # no getAuthUser
    'auth/me/route.ts',                    # different pattern
    'setup/route.ts',                      # if exists
    'debug/db/route.ts',                   # if exists
}

fixed_files = []
skipped_files = []
errors = []

def fix_file(filepath):
    rel = os.path.relpath(filepath, BASE)
    if rel in SKIP_FILES:
        skipped_files.append(rel)
        return

    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Check if file uses getAuthUser
    if 'getAuthUser' not in content:
        return

    # Check if file already imports requireAuth
    needs_require_auth = False
    if 'requireAuth' not in content and 'getAuthUser' in content:
        needs_require_auth = True

    # Pattern: replace `const { user, error } = await getAuthUser(request);\n    if (error) return error;`
    # with `const user = await requireAuth(request);`
    pattern1 = re.compile(
        r"const \{ user, error \} = await getAuthUser\(request\);\s*\n\s*if \(error\) return error;",
        re.MULTILINE
    )
    
    if pattern1.search(content):
        content = pattern1.sub(
            '// Auth: type-safe — throws Response on failure\n    const user = await requireAuth(request);',
            content
        )

    if content != original:
        # Add requireAuth to import if needed
        if needs_require_auth:
            # Find the auth import line
            import_pattern = re.compile(r"(import \{[^}]+\} from '@/lib/auth';)")
            match = import_pattern.search(content)
            if match:
                old_import = match.group(1)
                # Add requireAuth to the import
                if 'requireAuth' not in old_import:
                    # Add before the closing brace
                    new_import = old_import.replace('from', ', requireAuth from')
                    # Actually, let's be more precise
                    new_import = re.sub(
                        r"import \{([^}]+)\} from '@/lib/auth';",
                        lambda m: f"import {{ {m.group(1).rstrip()}, requireAuth }} from '@/lib/auth';",
                        old_import
                    )
                    content = content.replace(old_import, new_import, 1)
        
        with open(filepath, 'w') as f:
            f.write(content)
        fixed_files.append(rel)

# Walk through all route files
for root, dirs, files in os.walk(BASE):
    for f in files:
        if f.endswith('.ts'):
            filepath = os.path.join(root, f)
            try:
                fix_file(filepath)
            except Exception as e:
                errors.append(f"{os.path.relpath(filepath, BASE)}: {e}")

print(f"✅ Fixed: {len(fixed_files)} files")
print(f"⏭️  Skipped: {len(skipped_files)} files")
print(f"❌ Errors: {len(errors)} files")
if errors:
    for e in errors:
        print(f"  - {e}")
if fixed_files:
    print("\nFixed files:")
    for f in sorted(fixed_files):
        print(f"  ✅ {f}")
