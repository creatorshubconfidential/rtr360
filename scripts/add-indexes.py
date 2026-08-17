#!/usr/bin/env python3
"""Add @@index directives to Prisma schema for P0-4 fix."""

import re

SCHEMA_PATH = "/home/z/my-project/prisma/schema.prisma"

# Maps model name -> list of index field arrays
INDEXES = {
    # Organization already has @@index([status]) and @@index([emirate])
    "Branch": [["organizationId"]],
    "User": [["organizationId"], ["role"], ["status"]],
    "AuditLog": [["userId"], ["organizationId"], ["action"], ["createdAt"]],
    "Lead": [["organizationId"], ["assignedToId"], ["status"], ["priority"]],
    "Contact": [["organizationId"]],
    "Opportunity": [["organizationId"], ["leadId"], ["stage"]],
    "Activity": [["userId"], ["leadId"], ["opportunityId"]],
    "Vehicle": [["organizationId"], ["plateNumber"], ["driverId"], ["deviceId"], ["status"]],
    "Driver": [["organizationId"], ["status"], ["licenseNumber"]],
    "Device": [["organizationId"], ["status"]],
    "SIM": [["organizationId"], ["status"]],
    "Technician": [["organizationId"], ["status"]],
    "Installation": [["organizationId"], ["status"], ["technicianId"], ["vehicleId"], ["deviceId"]],
    "Trip": [["vehicleId"], ["startTime"], ["status"]],
    "Geofence": [["organizationId"]],
    "AlertRule": [["organizationId"], ["type"]],
    "Alert": [["organizationId"], ["status"], ["vehicleId"], ["createdAt"]],
    "MaintenanceRecord": [["vehicleId"], ["organizationId"], ["status"]],
    "Invoice": [["organizationId"], ["status"], ["subscriptionId"]],
    "Quotation": [["organizationId"], ["leadId"], ["status"]],
    "Ticket": [["organizationId"], ["status"], ["assignedToId"]],
    "Contract": [["organizationId"], ["status"]],
    "Document": [["organizationId"], ["type"]],
    "Notification": [["userId"], ["organizationId"]],
    "Session": [["userId"]],
    "ApiKey": [["organizationId"], ["userId"]],
    "AIConversation": [["userId"], ["organizationId"]],
}

with open(SCHEMA_PATH, 'r') as f:
    content = f.read()

# Find each model and add indexes before the closing brace
lines = content.split('\n')
output = []
i = 0
total_added = 0

while i < len(lines):
    line = lines[i]
    output.append(line)

    # Check if this line closes a model block (just '}' at start, possibly with whitespace)
    if re.match(r'^\s*\}\s*$', line):
        # Look backwards to find which model we're in
        model_name = None
        for j in range(len(output) - 2, -1, -1):
            m = re.match(r'^model\s+(\w+)\s*\{', output[j])
            if m:
                model_name = m.group(1)
                break
        
        if model_name and model_name in INDEXES:
            # Check if indexes already exist (don't duplicate)
            existing_indexes = set()
            for k in range(len(output) - 2, -1, -1):
                idx_match = re.match(r'^\s*@@index\(\[([^\]]+)\]\)', output[k])
                if idx_match:
                    existing_indexes.add(idx_match.group(1).strip())
                elif re.match(r'^\s*\}\s*$', output[k]):
                    break
                elif re.match(r'^model\s+', output[k]):
                    break
            
            # Add missing indexes
            idx_lines = []
            for fields in INDEXES[model_name]:
                field_str = ', '.join(fields)
                if field_str not in existing_indexes:
                    idx_lines.append(f'  @@index([{field_str}])')
                    total_added += 1
            
            # Insert before the closing brace (which is the last item in output)
            if idx_lines:
                output = output[:-1] + idx_lines + [line]
    
    i += 1

result = '\n'.join(output)
with open(SCHEMA_PATH, 'w') as f:
    f.write(result)

print(f'Added {total_added} new indexes to Prisma schema')
