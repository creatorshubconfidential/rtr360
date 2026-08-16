#!/usr/bin/env python3
"""
Bulk fix TypeScript errors in RTR 360 API routes.

1. Replace getAuthUser → requireAuth (fixes 307 'user possibly null' errors)
2. Fix 'Request' import from 'next/server' → global (fixes 5 errors)
3. Fix TS2345 by adjusting requirePermission calls
"""

import re
import os
import subprocess

BASE = "/home/z/my-project/src/app/api"

def fix_require_auth():
    """Replace getAuthUser with requireAuth in all API route files."""
    count = 0
    for root, dirs, files in os.walk(BASE):
        for fname in files:
            if fname != 'route.ts':
                continue
            fpath = os.path.join(root, fname)
            with open(fpath, 'r') as f:
                content = f.read()
            
            original = content
            
            # Replace import: getAuthUser → requireAuth
            # Handle various import patterns
            # Pattern 1: import { getAuthUser } from '@/lib/auth';
            # Pattern 2: import { getAuthUser, ... } from '@/lib/auth';
            # Pattern 3: import { ..., getAuthUser } from '@/lib/auth';
            
            if 'getAuthUser' in content:
                # Add requireAuth to import if not already present
                if 'requireAuth' not in content:
                    # Find the import from '@/lib/auth'
                    import_match = re.search(
                        r"import\s*\{([^}]+)\}\s*from\s*'@/lib/auth'\s*;",
                        content
                    )
                    if import_match:
                        items = import_match.group(1).strip()
                        # Replace getAuthUser with requireAuth in the import
                        new_items = items.replace('getAuthUser', 'requireAuth')
                        old_import = import_match.group(0)
                        new_import = old_import.replace(items, new_items)
                        content = content.replace(old_import, new_import)
                
                # Replace all destructuring: const { user, error } = await getAuthUser(
                # With: const { user, error } = await requireAuth(
                content = content.replace('await getAuthUser(', 'await requireAuth(')
                
                # Remove now-unused getAuthUser from imports (if requireAuth was already there)
                if 'getAuthUser' in content and 'requireAuth' in content:
                    # Clean up: remove getAuthUser from import if it's still there alongside requireAuth
                    import_match2 = re.search(
                        r"import\s*\{([^}]+)\}\s*from\s*'@/lib/auth'\s*;",
                        content
                    )
                    if import_match2:
                        items_str = import_match2.group(1)
                        items = [i.strip() for i in items_str.split(',')]
                        items = [i for i in items if i != 'getAuthUser']
                        if items:
                            new_items = ', '.join(items)
                            old_import = import_match2.group(0)
                            new_import = f"import {{ {new_items} }} from '@/lib/auth';"
                            content = content.replace(old_import, new_import)
            
            if content != original:
                with open(fpath, 'w') as f:
                    f.write(content)
                count += 1
                rel = os.path.relpath(fpath, '/home/z/my-project')
                print(f'  [requireAuth] {rel}')
    
    return count


def fix_request_import():
    """Fix 'Request' import from 'next/server' — use global Request in Next.js 16."""
    count = 0
    for root, dirs, files in os.walk(BASE):
        for fname in files:
            if fname != 'route.ts':
                continue
            fpath = os.path.join(root, fname)
            with open(fpath, 'r') as f:
                content = f.read()
            
            original = content
            
            # Check if Request is imported from 'next/server'
            import_match = re.search(
                r"import\s*\{([^}]*\bRequest\b[^}]*)\}\s*from\s*'next/server'\s*;",
                content
            )
            if import_match:
                items_str = import_match.group(1)
                items = [i.strip() for i in items_str.split(',')]
                
                # Separate Request from other items
                request_items = [i for i in items if i == 'Request']
                other_items = [i for i in items if i != 'Request']
                
                if request_items:
                    # Remove Request from next/server import
                    if other_items:
                        new_import = f"import {{ {', '.join(other_items)} }} from 'next/server';"
                    else:
                        new_import = ''  # Remove entire import line
                    
                    old_import = import_match.group(0)
                    content = content.replace(old_import, new_import)
                    count += 1
                    rel = os.path.relpath(fpath, '/home/z/my-project')
                    print(f'  [Request import] {rel}')
            
            if content != original:
                with open(fpath, 'w') as f:
                    f.write(content)
    
    return count


if __name__ == '__main__':
    print('=== Fix 1: Replace getAuthUser → requireAuth ===')
    c1 = fix_require_auth()
    print(f'  Files changed: {c1}')
    
    print('\n=== Fix 2: Remove Request import from next/server ===')
    c2 = fix_request_import()
    print(f'  Files changed: {c2}')
    
    print(f'\nTotal: {c1 + c2} files changed')
