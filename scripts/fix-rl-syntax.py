#!/usr/bin/env python3
"""Fix incorrectly inserted checkRateLimit in multi-line signatures."""
import re, os, glob

API_DIR = "src/app/api"

# Pattern: the broken insertion - checkRateLimit appears inside function params
BROKEN_PATTERN = re.compile(
    r'(\{\s*
    const rl = checkRateLimit\(request, .+?\);\n    if \(rl\) return rl; )'
    r'([^}]+?\}: \{[^}]*\})'
    r'(\)\s*\{)',
    re.DOTALL
)

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    if 'const rl = checkRateLimit' not in content:
        return 0

    # Check if file has the broken pattern (rl inside params)
    # Look for: { \n    const rl = ... \n    if (rl) return rl; params
    broken = re.compile(
        r'\{\s*
    const rl = checkRateLimit\(request, (\'[^\']+\')\);\s*
    if \(rl\) return rl;\s*([^}]+?)\}\s*:\s*\{[^}]*\}\s*\)\s*\{'
    )

    matches = list(broken.finditer(content))
    if not matches:
        return 0

    changes = 0
    for m in reversed(matches):
        tier = m.group(1)
        params_content = m.group(2).strip()  # e.g. "params }: { params: Promise<..."

        # Reconstruct the correct function signature
        # Original was: { params }: { params: Promise<{ id: string }> }\n) {
        # We need to restore it to: { params }: { params: Promise<{ id: string }> }\n) {\n    const rl = checkRateLimit(request, 'api');\n    if (rl) return rl;
        correct_params = '{ ' + params_content
        # params_content is like "params }: { params: Promise<{ id: string }>"
        # We just need to put back the { at the start
        replacement = '{ ' + params_content + '\n) {\n    const rl = checkRateLimit(request, ' + tier + ');\n    if (rl) return rl;'

        content = content[:m.start()] + replacement + content[m.end():]
        changes += 1
        print(f"  Fixed: {os.path.relpath(filepath, API_DIR)}")

    if changes:
        with open(filepath, 'w') as f:
            f.write(content)
    return changes

def main():
    total = 0
    for root, dirs, files in os.walk(API_DIR):
        for fname in files:
            if fname == 'route.ts':
                total += fix_file(os.path.join(root, fname))
    print(f"Total syntax fixes: {total}")

if __name__ == '__main__':
    main()