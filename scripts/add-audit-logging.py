#!/usr/bin/env python3
"""
Inject audit logging into all POST/PUT/PATCH/DELETE API routes.
Uses simple pattern matching to insert logAudit calls after successful DB operations.
"""

import re
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(BASE, "src", "app", "api")

# Map API path to entity name
ENTITY_MAP = {
    "vehicles": "Vehicle",
    "drivers": "Driver", 
    "devices": "Device",
    "technicians": "Technician",
    "trips": "Trip",
    "geofences": "Geofence",
    "maintenance": "MaintenanceRecord",
    "installations": "Installation",
    "leads": "Lead",
    "contacts": "Contact",
    "quotations": "Quotation",
    "invoices": "Invoice",
    "contracts": "Contract",
    "tickets": "Ticket",
    "subscriptions": "Subscription",
    "activities": "Activity",
    "alert-rules": "AlertRule",
    "users": "User",
    "settings": "Setting",
    "notifications": "Notification",
    "ai/chat": "AIConversation",
    "ai/conversations": "AIConversation",
    "admin/organizations": "Organization",
    "pipeline": "Opportunity",
}

def get_entity(rel_path):
    """Extract entity name from relative path."""
    p = rel_path.replace("src/app/api/", "").replace("/route.ts", "").replace("/[id]/route.ts", "").replace("/[id]/branding/route.ts", "")
    for key, val in ENTITY_MAP.items():
        if p.startswith(key):
            return val
    # Fallback: first path segment
    return p.split("/")[0].replace("-", "_").capitalize()

SKIP = {"auth/login", "auth/logout"}

def find_routes():
    routes = []
    for root, dirs, files in os.walk(API_DIR):
        for f in files:
            if f != "route.ts":
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, BASE)
            with open(full, "r") as fh:
                content = fh.read()
            methods = []
            for m in ["POST", "PUT", "PATCH", "DELETE"]:
                if f"export async function {m}(" in content:
                    methods.append(m)
            if methods:
                routes.append((rel, full, methods, content))
    return routes

def add_import(content):
    """Add audit import if not present."""
    if "'@/lib/audit'" in content:
        return content
    lines = content.split("\n")
    # Find last import line
    last_import = -1
    for i, line in enumerate(lines):
        if line.startswith("import "):
            last_import = i
    if last_import >= 0:
        lines.insert(last_import + 1, "import { logAudit, getClientIp } from '@/lib/audit';")
    else:
        lines.insert(0, "import { logAudit, getClientIp } from '@/lib/audit';")
    return "\n".join(lines)

def inject_post_audit(content, entity):
    """Inject audit call after successful create in POST method."""
    lines = content.split("\n")
    # Find POST function
    post_start = -1
    for i, line in enumerate(lines):
        if "export async function POST(" in line:
            post_start = i
            break
    if post_start == -1:
        return content
    
    # Find successful return (status 200/201 or just NextResponse.json without error status)
    for i in range(post_start + 1, min(post_start + 120, len(lines))):
        stripped = lines[i].strip()
        if stripped.startswith("return ") and ("NextResponse" in stripped or "Response" in stripped):
            # Check it's not an error return
            if "status: 4" in lines[i] or "status: 5" in lines[i] or "status: 3" in lines[i]:
                continue
            # This is a success return — insert audit before it
            indent = "    "
            entity_lower = entity[0].lower() + entity[1:]
            audit_line = f"{indent}await logAudit({{ user, action: 'create', entity: '{entity}', entityId: {entity_lower}?.id, ipAddress: getClientIp(request) }});"
            lines.insert(i, audit_line)
            return "\n".join(lines)
        # Stop at catch block
        if stripped.startswith("} catch"):
            break
    return content

def inject_patch_audit(content, entity):
    """Inject audit call after successful update in PATCH method."""
    lines = content.split("\n")
    for method in ["PATCH", "PUT", "DELETE"]:
        method_start = -1
        for i, line in enumerate(lines):
            if f"export async function {method}(" in line:
                method_start = i
                break
        if method_start == -1:
            continue
        
        action = "update" if method in ("PATCH", "PUT") else "delete"
        
        # Find the id parameter
        id_var = "id"
        for i in range(method_start, min(method_start + 5, len(lines))):
            m = re.search(r'\{\s*(\w+)\s*:', lines[i])
            if m:
                id_var = m.group(1)
                break
        
        # Find successful return
        for i in range(method_start + 1, min(method_start + 120, len(lines))):
            stripped = lines[i].strip()
            if stripped.startswith("return ") and ("NextResponse" in stripped or "Response" in stripped):
                if "status: 4" in lines[i] or "status: 5" in lines[i] or "status: 3" in lines[i]:
                    continue
                indent = "    "
                audit_line = f"{indent}await logAudit({{ user, action: '{action}', entity: '{entity}', entityId: {id_var}, ipAddress: getClientIp(request) }});"
                lines.insert(i, audit_line)
                content = "\n".join(lines)
                lines = content.split("\n")
                break
            if stripped.startswith("} catch"):
                break
    return content

def main():
    routes = find_routes()
    print(f"Found {len(routes)} files with write methods\n")
    
    modified = 0
    skipped = 0
    
    for rel, full, methods, content in routes:
        # Skip auth routes
        if any(s in rel for s in SKIP):
            print(f"  SKIP (auth): {rel}")
            skipped += 1
            continue
        
        if "'@/lib/audit'" in content:
            print(f"  SKIP (done):  {rel}")
            skipped += 1
            continue
        
        entity = get_entity(rel)
        new_content = content
        
        # Add import
        new_content = add_import(new_content)
        
        # Inject audit for each write method
        if "POST" in methods:
            new_content = inject_post_audit(new_content, entity)
        
        is_id_route = "[id]" in rel
        if is_id_route and any(m in methods for m in ["PATCH", "PUT", "DELETE"]):
            new_content = inject_patch_audit(new_content, entity)
        elif not is_id_route and any(m in methods for m in ["PATCH", "PUT", "DELETE"]):
            # Collection route with PUT/PATCH/DELETE (rare but possible)
            new_content = inject_patch_audit(new_content, entity)
        
        if new_content != content:
            with open(full, "w") as f:
                f.write(new_content)
            modified += 1
            print(f"  DONE: {rel} → {entity} ({', '.join(methods)})")
        else:
            print(f"  NOOP: {rel} ({', '.join(methods)})")
    
    print(f"\n=== Modified: {modified}, Skipped: {skipped}, Total: {len(routes)} ===")

if __name__ == "__main__":
    main()