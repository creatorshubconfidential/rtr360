#!/usr/bin/env python3
"""
Fix audit logging injection — place logAudit calls after db.<model>.create/update/delete
instead of before return statements (which can be error returns spanning multiple lines).
Strategy:
1. Remove all existing logAudit calls (from bad injection)
2. Re-insert them after the correct db operation line
"""

import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(BASE, "src", "app", "api")

ENTITY_MAP = {
    "vehicles": ("Vehicle", "vehicle"),
    "drivers": ("Driver", "driver"),
    "devices": ("Device", "device"),
    "technicians": ("Technician", "technician"),
    "trips": ("Trip", "trip"),
    "geofences": ("Geofence", "geofence"),
    "maintenance": ("MaintenanceRecord", "maintenanceRecord"),
    "installations": ("Installation", "installation"),
    "leads": ("Lead", "lead"),
    "contacts": ("Contact", "contact"),
    "quotations": ("Quotation", "quotation"),
    "invoices": ("Invoice", "invoice"),
    "contracts": ("Contract", "contract"),
    "tickets": ("Ticket", "ticket"),
    "subscriptions": ("Subscription", "subscription"),
    "activities": ("Activity", "activity"),
    "alert-rules": ("AlertRule", "alertRule"),
    "users": ("User", "userObj"),
    "settings": ("Setting", "setting"),
    "notifications": ("Notification", "notification"),
    "ai/chat": ("AIConversation", "conversation"),
    "ai/conversations": ("AIConversation", "conversation"),
    "admin/organizations": ("Organization", "org"),
    "pipeline": ("Opportunity", "opportunity"),
}

def get_entity(rel_path):
    p = rel_path.replace("src/app/api/", "").replace("/route.ts", "").replace("/[id]/route.ts", "").replace("/[id]/branding/route.ts", "")
    for key, val in ENTITY_MAP.items():
        if p.startswith(key):
            return val
    first = p.split("/")[0].replace("-", "_")
    return (first.capitalize(), first[0].lower() + first[1:])

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
            if "'@/lib/audit'" not in content and "auth/login" not in rel and "auth/logout" not in rel:
                continue
            routes.append((rel, full, content))
    return routes

def remove_bad_audit_calls(content):
    """Remove all logAudit calls that are NOT inside login/logout routes."""
    lines = content.split("\n")
    new_lines = []
    for line in lines:
        if "await logAudit(" in line and "// Audit log" not in line:
            continue  # Remove old auto-injected audit calls
        new_lines.append(line)
    return "\n".join(new_lines)

def find_closing_paren(lines, start):
    """Find the line index where the opening paren on start closes."""
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count("(") - lines[i].count(")")
        if depth <= 0:
            return i
    return start + 10  # Fallback

def inject_after_db_op(lines, method_start, entity_name, var_name, action, id_var="id"):
    """
    Find db.<model>.create/update/delete and insert audit after the closing paren.
    Returns (modified_lines, was_injected).
    """
    op_keyword = "delete" if action == "delete" else ("update" if action in ("update",) else "create")
    
    # For PATCH/PUT, look for update; for DELETE, look for delete; for POST, look for create
    if action == "create":
        search_ops = ["create"]
    elif action == "delete":
        search_ops = ["delete"]
    else:
        search_ops = ["update"]
    
    for i in range(method_start, min(method_start + 120, len(lines))):
        stripped = lines[i].strip()
        for op in search_ops:
            if f"db." in stripped and f".{op}(" in stripped:
                # Found the DB operation — find where its closing paren is
                close_line = find_closing_paren(lines, i)
                insert_at = close_line + 1
                
                # Determine indentation
                indent = "    "
                for ch in lines[close_line]:
                    if ch == ' ':
                        indent += ' '
                    elif ch == '\t':
                        indent += '    '
                    else:
                        break
                
                if action == "create":
                    audit_call = f"{indent}await logAudit({{ user, action: 'create', entity: '{entity_name}', entityId: {var_name}?.id, ipAddress: getClientIp(request) }});"
                elif action == "delete":
                    audit_call = f"{indent}await logAudit({{ user, action: 'delete', entity: '{entity_name}', entityId: {id_var}, ipAddress: getClientIp(request) }});"
                else:
                    audit_call = f"{indent}await logAudit({{ user, action: 'update', entity: '{entity_name}', entityId: {id_var}, ipAddress: getClientIp(request) }});"
                
                lines.insert(insert_at, audit_call)
                return lines, True
    
    return lines, False

def find_method_start(lines, method_name):
    for i, line in enumerate(lines):
        if f"export async function {method_name}(" in line:
            return i
    return -1

def find_id_param(lines, method_start):
    """Find the id parameter name in a [id] route method."""
    for i in range(method_start, min(method_start + 8, len(lines))):
        m = re.search(r'\{\s*(\w+)\s*:', lines[i])
        if m:
            return m.group(1)
    return "id"

def find_create_var(lines, method_start):
    """Find the variable name used for db.create result."""
    for i in range(method_start, min(method_start + 60, len(lines))):
        m = re.match(r'\s*const\s+(\w+)\s*=\s*await\s+db\.\w+\.create\(', lines[i])
        if m:
            return m.group(1)
    return None

def main():
    routes = find_routes()
    print(f"Found {len(routes)} files with audit import\n")
    
    modified = 0
    for rel, full, content in routes:
        lines = content.split("\n")
        entity_name, var_name = get_entity(rel)
        is_id_route = "[id]" in rel
        
        # Remove old bad audit calls (keep imports and login/logout manual calls)
        new_content = remove_bad_audit_calls(content)
        lines = new_content.split("\n")
        
        changed = False
        
        # For login route, skip (already manually handled)
        if "auth/login" in rel or "auth/logout" in rel:
            # Just restore manual audit calls
            with open(full, "w") as f:
                f.write(new_content)
            continue
        
        # Process POST (collection routes)
        post_start = find_method_start(lines, "POST")
        if post_start >= 0:
            create_var = find_create_var(lines, post_start)
            used_var = create_var or var_name
            lines, injected = inject_after_db_op(lines, post_start, entity_name, used_var, "create")
            if injected:
                changed = True
                new_content = "\n".join(lines)
                lines = new_content.split("\n")
        
        # Process PATCH/PUT (usually [id] routes)
        if is_id_route:
            id_var = find_id_param(lines, 0)  # id param is usually in all methods
            
            for method, action in [("PATCH", "update"), ("PUT", "update"), ("DELETE", "delete")]:
                method_start = find_method_start(lines, method)
                if method_start >= 0:
                    if method == "DELETE":
                        id_var_m = find_id_param(lines, method_start)
                    else:
                        id_var_m = find_id_param(lines, method_start)
                    lines, injected = inject_after_db_op(lines, method_start, entity_name, var_name, action, id_var_m)
                    if injected:
                        changed = True
                        new_content = "\n".join(lines)
                        lines = new_content.split("\n")
        
        if changed:
            with open(full, "w") as f:
                f.write(new_content)
            modified += 1
            print(f"  FIXED: {rel} → {entity_name}")
        else:
            # Write back cleaned content (removed bad audit calls)
            if new_content != content:
                with open(full, "w") as f:
                    f.write(new_content)
                print(f"  CLEANED: {rel} (removed bad calls)")
            else:
                print(f"  OK: {rel}")
    
    print(f"\n=== Fixed: {modified} ===")

if __name__ == "__main__":
    main()