#!/usr/bin/env python3
"""Fix multi-line function signatures that missed checkRateLimit."""
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

    # Find multi-line function signatures: export async function METHOD(
    # followed by params on next line(s), then ) {
    pattern = r"(export async function (POST|PUT|PATCH|DELETE)\(\s*\n[^}]*?\{)"
    matches = list(re.finditer(pattern, content, re.DOTALL))

    if not matches:
        return 0

    changes = 0
    # Process in reverse
    for m in reversed(matches):
        block = m.group(1)
        # Check if checkRateLimit is already in this block (within first few lines)
        end_of_block = m.end()
        # Look ahead 200 chars for checkRateLimit
        lookahead = content[end_of_block:end_of_block + 200]
        if 'checkRateLimit' in lookahead:
            continue

        # Find the opening brace position within the matched block
        brace_pos = block.rfind('{')
        if brace_pos == -1:
            continue

        # The brace is the last char of the match. Insert after it.
        insert_pos = m.start() + brace_pos + 1

        # Determine tier
        tier = 'api'
        if 'ai/' in rel or 'analytics/' in rel:
            tier = 'analytics'

        indent = '    '
        check_code = f"\n{indent}const rl = checkRateLimit(request, '{tier}');\n{indent}if (rl) return rl;"

        content = content[:insert_pos] + check_code + content[insert_pos:]
        changes += 1
        print(f"  Fixed multi-line: {rel}")

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
    print(f"Total multi-line fixes: {total}")

if __name__ == '__main__':
    main()
