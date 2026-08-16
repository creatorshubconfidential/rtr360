#!/usr/bin/env python3
"""
Fix the 5 admin routes: replace manual token extraction with getAuthUser + requirePermission.
The initial script fixed imports but the regex for the auth block didn't match.
"""

import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ADMIN_FILES = [
    'src/app/api/admin/organizations/route.ts',
    'src/app/api/admin/organizations/[id]/route.ts',
    'src/app/api/admin/organizations/[id]/branding/route.ts',
    'src/app/api/admin/organizations/[id]/usage/route.ts',
    'src/app/api/admin/platform-stats/route.ts',
]

# The manual auth block pattern (with varying whitespace and comments)
# This is more flexible than the previous regex

MANUAL_AUTH_BLOCKS = [
    # Block type 1: standard pattern with 'session.role !=='
    re.compile(
        r"    const authHeader = request\.headers\.get\('Authorization'\);\s*\n"
        r"    const cookieHeader = request\.headers\.get\('Cookie'\);\s*\n"
        r"    let token: string \| null = null;\s*\n"
        r"    if \(authHeader\) token = authHeader\.replace\('Bearer ', ''\);\s*\n"
        r"    if \(!token && cookieHeader\) \{\s*\n"
        r"      const match = cookieHeader\.match\(/\(\?:\^\|;\\s\*\)rtr_session=\([^;\]\)*/\);\s*\n"
        r"      if \(match\) token = decodeURIComponent\(match\[1\]\);\s*\n"
        r"    \}\s*\n"
        r"    const (\w+) = await verifySession\(token \|\| ''\);\s*\n"
        r"    if \(!\1 \|\| \1\.role !== 'super_admin'\) \{\s*\n"
        r"      return Response\.json\(\{ error: 'Forbidden[^']*' \}, \{ status: 403 \}\);\s*\n"
        r"    \}",
        re.DOTALL
    ),
    # Block type 2: with 'session.role !==' and extra period
    re.compile(
        r"    const authHeader = request\.headers\.get\('Authorization'\);\s*\n"
        r"    const cookieHeader = request\.headers\.get\('Cookie'\);\s*\n"
        r"    let token: string \| null = null;\s*\n"
        r"    if \(authHeader\) token = authHeader\.replace\('Bearer ', ''\);\s*\n"
        r"    if \(!token && cookieHeader\) \{\s*\n"
        r"      const match = cookieHeader\.match\(/\(\?:\^\|;\\s\*\)rtr_session=\([^;\]\)*/\);\s*\n"
        r"      if \(match\) token = decodeURIComponent\(match\[1\]\);\s*\n"
        r"    \}\s*\n"
        r"    const (\w+) = await verifySession\(token \|\| ''\);\s*\n"
        r"    if \(!\1 \|\| (\w+)\.role !== 'super_admin'\) \{\s*\n"
        r"      return Response\.json\(\{ error: 'Forbidden[^']*' \}, \{ status: 403 \}\);\s*\n"
        r"    \}",
        re.DOTALL
    ),
]

REPLACEMENT = """    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: ADMIN_MANAGE
    const permErr = requirePermission(user, ADMIN_MANAGE);
    if (permErr) return permErr;"""


def fix_route(filepath: str) -> bool:
    full_path = os.path.join(BASE, filepath)
    with open(full_path, 'r') as f:
        content = f.read()
    
    original = content
    
    for pattern in MANUAL_AUTH_BLOCKS:
        content = pattern.sub(REPLACEMENT, content)
    
    # Also fix any remaining 'verifySession' references
    # Replace 'session' var with 'user' in the remaining code
    # Be careful not to replace inside strings or comments
    
    if content != original:
        with open(full_path, 'w') as f:
            f.write(content)
        return True
    return False


def main():
    for filepath in ADMIN_FILES:
        full_path = os.path.join(BASE, filepath)
        if not os.path.exists(full_path):
            print(f"  ❌ {filepath} — not found")
            continue
        
        if fix_route(filepath):
            print(f"  ✅ {filepath} — fixed")
        else:
            print(f"  ⚠️  {filepath} — pattern not matched, checking contents...")
            with open(full_path, 'r') as f:
                lines = f.readlines()
            # Show lines 8-22 (where the auth block should be)
            for i, line in enumerate(lines[7:25], start=8):
                print(f"    {i:3}: {line.rstrip()}")


if __name__ == '__main__':
    main()
