#!/usr/bin/env python3
import re, os

BROKEN_FILES = [
    'src/app/api/devices/[id]/route.ts',
    'src/app/api/drivers/[id]/route.ts',
    'src/app/api/installations/[id]/route.ts',
    'src/app/api/invoices/[id]/route.ts',
    'src/app/api/leads/[id]/route.ts',
    'src/app/api/maintenance/[id]/route.ts',
    'src/app/api/quotations/[id]/route.ts',
    'src/app/api/subscriptions/[id]/route.ts',
    'src/app/api/technicians/[id]/route.ts',
    'src/app/api/tickets/[id]/route.ts',
    'src/app/api/ai/conversations/[id]/route.ts',
]

# The broken pattern is:
#   {
#     const rl = checkRateLimit(request, 'api');
#     if (rl) return rl; params }: { params: Promise<{ id: string }> }
# ) {
# Should be:
#   { params }: { params: Promise<{ id: string }> }
# ) {
#     const rl = checkRateLimit(request, 'api');
#     if (rl) return rl;

pattern = re.compile(
    r'\{\s*'          # opening brace of destructuring
    r'const rl = checkRateLimit\(request, ([^)]+)\);\s*'
    r'if \(rl\) return rl;\s*'
    r'(.+?)\}'         # rest of params up to closing brace
    r'\s*\)\s*\{',  # ) {
    re.DOTALL
)

def fix(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    def replacer(m):
        tier = m.group(1).strip()
        rest = m.group(2).strip()  # e.g. "params }: { params: Promise<{ id: string }> }"
        return '{ ' + rest + '\n) {\n    const rl = checkRateLimit(request, ' + tier + ');\n    if (rl) return rl;'
    
    new_content = pattern.sub(replacer, content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f'Fixed: {filepath}')
        return 1
    return 0

total = 0
for f in BROKEN_FILES:
    if os.path.exists(f):
        total += fix(f)
print(f'Total: {total}')
