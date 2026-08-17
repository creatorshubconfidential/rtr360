#!/usr/bin/env python3
"""Fix single-line signatures with extra params that missed checkRateLimit."""
import re, os

API_DIR = "src/app/api"
SKIP_FILES = {"auth/login/route.ts"}

def process_file(filepath: str):
    rel = os.path.relpath(filepath, API_DIR)
    if rel in SKIP_FILES:
        return 0

    with open(filepath, 'r') as f:
        content = f.read()

    if 'checkRateLimit' not in content:
        return 0

    # Match: export async function METHOD(request: Request, ...) {
    pattern = r"(export async function (PUT|PATCH|DELETE)\(request: Request[^)]*\) \{)"
    matches = list(re.finditer(pattern, content))

    if not matches:
        return 0

    changes = 0
    for m in reversed(matches):
        end_pos = m.end()
        # Look ahead for existing checkRateLimit
        lookahead = content[end_pos:end_pos + 200]
        if 'checkRateLimit' in lookahead:
            continue

        tier = 'api'
        if 'ai/' in rel or 'analytics/' in rel:
            tier = 'analytics'

        indent = '  '
        check_code = f"\n{indent}const rl = checkRateLimit(request, '{tier}');\n{indent}if (rl) return rl;"

        content = content[:end_pos] + check_code + content[end_pos:]
        changes += 1
        print(f"  Fixed: {rel}")

    if changes > 0:
        with open(filepath, 'w') as f:
            f.write(content)

    return changes

def main():
    total = 0
    for root, dirs, files in os.walk(API_DIR):
        for fname in files:
            if fname == 'route.ts':
                filepath = os.path.join(root, fname)
                total += process_file(filepath)
    print(f"Total remaining fixes: {total}")

if __name__ == '__main__':
    main()