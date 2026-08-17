#!/usr/bin/env python3
"""
Fix admin routes v2: The first script already changed session.role to user.role.
We need to replace the entire manual auth block (lines 10-21 roughly) with getAuthUser.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ADMIN_FILES = [
    'src/app/api/admin/organizations/route.ts',
    'src/app/api/admin/organizations/[id]/route.ts',
    'src/app/api/admin/organizations/[id]/branding/route.ts',
    'src/app/api/admin/organizations/[id]/usage/route.ts',
    'src/app/api/admin/platform-stats/route.ts',
]

REPLACEMENT = """    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: ADMIN_MANAGE
    const permErr = requirePermission(user, ADMIN_MANAGE);
    if (permErr) return permErr;"""


def fix_file(filepath: str):
    full_path = os.path.join(BASE, filepath)
    with open(full_path, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')
    new_lines = []
    i = 0
    replaced = 0
    
    while i < len(lines):
        line = lines[i]
        # Detect start of manual auth block
        if 'const authHeader = request.headers.get' in line and 'Authorization' in line:
            # Skip until we find the closing of the if block
            # Pattern: lines from 'const authHeader' to the closing '}' of the forbidden check
            block_start = i
            j = i
            while j < len(lines):
                if 'verifySession' in lines[j]:
                    # Found the verifySession line — next lines should be the check
                    break
                j += 1
            
            # Now find the closing brace of the if (!session || ...) check
            k = j + 1
            while k < len(lines):
                if lines[k].strip() == '}':
                    break
                k += 1
            
            # Replace lines block_start..k with our replacement
            new_lines.append(REPLACEMENT)
            replaced += 1
            i = k + 1
            continue
        
        new_lines.append(line)
        i += 1
    
    new_content = '\n'.join(new_lines)
    
    if replaced > 0:
        with open(full_path, 'w') as f:
            f.write(new_content)
        print(f'  ✅ {filepath} — replaced {replaced} auth block(s)')
    else:
        print(f'  ⚠️  {filepath} — no auth blocks found')
    
    return replaced


def main():
    total = 0
    for filepath in ADMIN_FILES:
        total += fix_file(filepath)
    print(f'\nTotal auth blocks replaced: {total}')


if __name__ == '__main__':
    main()
