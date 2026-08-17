#!/usr/bin/env python3
"""Add checkRateLimit() to all API route write methods."""
import re, os, sys

API_DIR = "src/app/api"
SKIP_FILES = {"auth/login/route.ts"}  # Already has custom rate limiting

# Routes that should use 'analytics' tier (AI-heavy, expensive operations)
ANALYTICS_ROUTES = {
    "ai/chat/route.ts",
    "ai/conversations/[id]/route.ts",
    "analytics/",  # any file under analytics/
    "reports/",
}

def get_tier(filepath: str) -> str:
    rel = os.path.relpath(filepath, API_DIR)
    for ar in ANALYTICS_ROUTES:
        if rel.startswith(ar):
            return "analytics"
    return "api"

def process_file(filepath: str) -> int:
    rel = os.path.relpath(filepath, API_DIR)
    if rel in SKIP_FILES:
        print(f"  SKIP (already has RL): {rel}")
        return 0

    with open(filepath, 'r') as f:
        content = f.read()

    # Check if already has checkRateLimit
    if 'checkRateLimit' in content:
        print(f"  SKIP (already imported): {rel}")
        return 0

    tier = get_tier(filepath)
    changes = 0

    # Add import if not present
    if "from '@/lib/rate-limit'" not in content:
        # Find the first import line and add after it
        import_match = re.search(r"^(import .+;)$", content, re.MULTILINE)
        if import_match:
            insert_pos = import_match.end()
            content = content[:insert_pos] + f"\nimport {{ checkRateLimit }} from '@/lib/rate-limit';" + content[insert_pos:]
            changes += 1

    # Find all write method functions and add checkRateLimit at the top
    write_methods = re.finditer(
        r"(export async function (POST|PUT|PATCH|DELETE)\(request: Request\))",
        content
    )

    # Work backwards to preserve positions
    method_positions = [(m.start(), m.group(0), m.group(2)) for m in write_methods]
    method_positions.reverse()

    for start, signature, method in method_positions:
        # Find the opening brace of the function
        brace_pos = content.find('{', start + len(signature))
        if brace_pos == -1:
            continue
        # Find the end of the opening line (after the brace)
        # Look for the first newline after the opening brace
        newline_pos = content.find('\n', brace_pos)
        if newline_pos == -1:
            continue

        indent = '    '
        check_code = f"\n{indent}const rl = checkRateLimit(request, '{tier}');\n{indent}if (rl) return rl;"

        # Insert after the opening brace line
        content = content[:newline_pos] + check_code + content[newline_pos:]
        changes += 1

    if changes > 0:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  OK (+{changes} changes, tier={tier}): {rel}")
    else:
        print(f"  NOOP: {rel}")

    return changes

def main():
    total_changes = 0
    for root, dirs, files in os.walk(API_DIR):
        for fname in files:
            if fname == 'route.ts':
                filepath = os.path.join(root, fname)
                # Only process files that have write methods
                with open(filepath, 'r') as f:
                    fc = f.read()
                if re.search(r'export async function (POST|PUT|PATCH|DELETE)', fc):
                    total_changes += process_file(filepath)
    print(f"\nTotal changes: {total_changes}")

if __name__ == '__main__':
    main()
