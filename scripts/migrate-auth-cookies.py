#!/usr/bin/env python3
"""Migrate all local authFetch definitions to import from @/lib/api.
Also removes localStorage-based auth from RealtimeEventToasts.
"""

import re
import os

BASE = "/home/z/my-project/src"

# Files that have a LOCAL authFetch function (not imported from @/lib/api)
LOCAL_AUTHFETCH_FILES = [
    "components/views/DevicesView.tsx",
    "components/views/AnalyticsView.tsx",
    "components/views/NotificationsView.tsx",
    "components/views/MaintenanceView.tsx",
    "components/views/InvoicesView.tsx",
    "components/views/AlertRulesView.tsx",
    "components/views/InstallationsView.tsx",
    "components/views/SubscriptionsView.tsx",
    "components/views/LiveTrackingView.tsx",
    "components/views/ReportsView.tsx",
    "components/views/TicketsView.tsx",
    "components/views/UsersView.tsx",
    "components/views/TechniciansView.tsx",
    "components/views/TripsView.tsx",
    "components/views/GeofencesView.tsx",
    "components/views/SuperAdminView.tsx",
    "components/views/ContractsView.tsx",
    "components/views/SettingsView.tsx",
    "components/views/DriversView.tsx",
    "components/views/AuditLogsView.tsx",
    "components/AIChatPanel.tsx",
]

# Regex to match the local authFetch function definition (covers both `function authFetch` and `const authFetch =`)
AUTHFETCH_RE = re.compile(
    r'^(?:const |function )authFetch\s*[=(].*?^\}\s*;?\s*$',
    re.MULTILINE | re.DOTALL
)

# Regex to match `import { authFetch` (for files that already import it)
EXISTING_IMPORT_RE = re.compile(r"import\s*\{[^}]*authFetch[^}]*\}\s*from\s*'@/lib/api'\s*;")

# Regex to match the last import statement (to insert before it)
LAST_IMPORT_RE = re.compile(r"^(import\s.*?;)\s*$", re.MULTILINE)

def migrate_file(filepath):
    full_path = os.path.join(BASE, filepath)
    with open(full_path, 'r') as f:
        content = f.read()
    
    original = content
    
    # Check if already imports authFetch from @/lib/api
    if EXISTING_IMPORT_RE.search(content):
        # Just remove the local definition
        content = AUTHFETCH_RE.sub('', content)
        print(f"  [import-exists] Removed local authFetch: {filepath}")
    else:
        # Remove local authFetch definition
        content = AUTHFETCH_RE.sub('', content)
        
        # Find the last import statement and add authFetch import after it
        imports = list(LAST_IMPORT_RE.finditer(content))
        if imports:
            last_import = imports[-1]
            insert_pos = last_import.end()
            # Check if there's already an import from @/lib/api to merge with
            api_import = re.search(r"import\s*\{([^}]*)\}\s*from\s*'@/lib/api'\s*;", content)
            if api_import:
                # Add authFetch to the existing import
                existing_items = api_import.group(1).strip()
                new_items = f"authFetch, {existing_items}" if existing_items else "authFetch"
                old_import = api_import.group(0)
                new_import = old_import.replace(existing_items, new_items)
                content = content.replace(old_import, new_import)
                print(f"  [merged-import] Added authFetch to existing @/lib/api import: {filepath}")
            else:
                # Insert new import after the last import
                content = content[:insert_pos] + "\nimport { authFetch } from '@/lib/api';" + content[insert_pos:]
                print(f"  [new-import] Added authFetch import: {filepath}")
        else:
            # No imports found — add at top after 'use client' if present
            if content.startswith("'use client'"):
                content = "'use client';\nimport { authFetch } from '@/lib/api';\n" + content[len("'use client';\n"):]
            else:
                content = "import { authFetch } from '@/lib/api';\n" + content
            print(f"  [top-import] Added authFetch import at top: {filepath}")
    
    # Also remove any remaining localStorage references for auth
    # Remove: const token = ... localStorage.getItem('rtr_token') ...
    content = re.sub(r"\n?\s*const\s+token\s*=\s*(?:typeof\s+window\s+!==\s*'undefined'\s*\?\s*)?localStorage\.getItem\(['\"]rtr_token['\"][^)]*\);?\s*\n?", '\n', content)
    # Remove: if (!token) return; (used in LiveTrackingView EventSource)
    content = re.sub(r"\n?\s*if\s*\(\s*!token\s*\)\s*return\s*;?\s*\n?", '\n', content)
    
    if content != original:
        with open(full_path, 'w') as f:
            f.write(content)
        return True
    else:
        print(f"  [no-change] {filepath}")
        return False

def fix_realtime_toasts():
    """Fix RealtimeEventToasts.tsx — replace direct localStorage with authFetch."""
    filepath = os.path.join(BASE, "components/RealtimeEventToasts.tsx")
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Remove: const token = localStorage.getItem('rtr_token');
    content = re.sub(r"\s*const\s+token\s*=\s*localStorage\.getItem\(['\"]rtr_token['\"][^)]*\);?\s*\n?", '\n', content)
    
    # Add authFetch import at top (after 'use client')
    if 'import { authFetch' not in content:
        if "'use client'" in content:
            content = content.replace("'use client';", "'use client';\nimport { authFetch } from '@/lib/api';")
        else:
            content = "import { authFetch } from '@/lib/api';\n" + content
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  [fixed] RealtimeEventToasts.tsx")
        return True
    return False

def fix_livetracking_eventsource():
    """Fix LiveTrackingView EventSource — remove token from URL, cookie is sent automatically."""
    filepath = os.path.join(BASE, "components/views/LiveTrackingView.tsx")
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Replace: new EventSource(`/api/realtime/vehicles?token=${token}`)  
    # With:    new EventSource('/api/realtime/vehicles')
    content = re.sub(
        r"new EventSource\(['\"]`/api/realtime/vehicles\?token=\$\{token\}`['\"]\)",
        "new EventSource('/api/realtime/vehicles')",
        content
    )
    # Also handle template literal versions
    content = re.sub(
        r"new EventSource\(\`/api/realtime/vehicles\?token=\$\{token\}\`\)",
        "new EventSource('/api/realtime/vehicles')",
        content
    )
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  [fixed] LiveTrackingView.tsx EventSource")
        return True
    return False

if __name__ == '__main__':
    changed = 0
    for f in LOCAL_AUTHFETCH_FILES:
        if migrate_file(f):
            changed += 1
    
    if fix_realtime_toasts():
        changed += 1
    
    if fix_livetracking_eventsource():
        changed += 1
    
    print(f"\nTotal files changed: {changed}")
