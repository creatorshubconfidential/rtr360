#!/usr/bin/env python3
"""Fix broken FK relations and add organizationId to Trip/Activity.

P1-3: Add @relation declarations for 13 orphan FK fields
P1-4: Add organizationId to Trip and Activity models
"""

import re

SCHEMA_PATH = '/home/z/my-project/prisma/schema.prisma'

with open(SCHEMA_PATH, 'r') as f:
    content = f.read()

# ============================================================
# 1. Add @relation to Installation: vehicleId -> Vehicle, deviceId -> Device
# ============================================================
# Installation already has organization and technician relations.
# Need to add vehicle and device relations + back-relations.

# Add vehicle/device relations to Installation model
content = content.replace(
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  technician    Technician?  @relation(fields: [technicianId], references: [id])',
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  technician    Technician?  @relation(fields: [technicianId], references: [id])\n  vehicle       Vehicle    @relation(fields: [vehicleId], references: [id])\n  device        Device     @relation(fields: [deviceId], references: [id])'
)

# ============================================================
# 2. Add @relation to Opportunity: assignedToId -> User, leadId -> Lead
# ============================================================
content = content.replace(
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  activities     Activity[]',
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  assignedTo     User?         @relation("OpportunityAssigned", fields: [assignedToId], references: [id])\n  lead           Lead?         @relation("OpportunityLead", fields: [leadId], references: [id])\n  activities     Activity[]'
)

# Add back-relations to User model for Opportunity
content = content.replace(
    '  assignedLeads  Lead[] @relation("LeadAssigned")\n  sessions       Session[]',
    '  assignedLeads  Lead[] @relation("LeadAssigned")\n  assignedOpportunities Opportunity[] @relation("OpportunityAssigned")\n  sessions       Session[]'
)

# Add back-relation to Lead for Opportunity
content = content.replace(
    '  activities     Activity[]\n  quotations     Quotation[]',
    '  activities     Activity[]\n  opportunities  Opportunity[] @relation("OpportunityLead")\n  quotations     Quotation[]'
)

# ============================================================
# 3. Add @relation to SIM: organizationId -> Organization
# ============================================================
content = content.replace(
    '  devices        Device[]\n}',
    '  organization   Organization? @relation(fields: [organizationId], references: [id])\n  devices        Device[]\n  @@index([organizationId])\n  @@index([status])\n}'
)

# ============================================================
# 4. Add @relation to Alert: vehicleId -> Vehicle
# ============================================================
content = content.replace(
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}',
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  vehicle        Vehicle?    @relation("AlertVehicle", fields: [vehicleId], references: [id])\n  @@index([createdAt])\n}'
)

# Add back-relation to Vehicle for Alert
content = content.replace(
    '  trips          Trip[]\n  maintenanceRecords MaintenanceRecord[]',
    '  trips          Trip[]\n  alerts         Alert[] @relation("AlertVehicle")\n  maintenanceRecords MaintenanceRecord[]'
)

# ============================================================
# 5. Add @relation to Quotation: contactId -> Contact
# ============================================================
content = content.replace(
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  lead           Lead?       @relation(fields: [leadId], references: [id])',
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  contact        Contact?   @relation(fields: [contactId], references: [id])\n  lead           Lead?       @relation(fields: [leadId], references: [id])'
)

# Add back-relation to Contact for Quotation
content = content.replace(
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}',
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  quotations     Quotation[]\n  @@index([organizationId])\n}'
)

# ============================================================
# 6. Add @relation to Ticket: assignedToId -> User
# ============================================================
content = content.replace(
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}',
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  assignedTo     User? @relation("TicketAssigned", fields: [assignedToId], references: [id])\n  @@index([assignedToId])\n}'
)

# Add back-relation to User for Ticket
content = content.replace(
    '  assignedOpportunities Opportunity[] @relation("OpportunityAssigned")\n  sessions       Session[]',
    '  assignedOpportunities Opportunity[] @relation("OpportunityAssigned")\n  assignedTickets  Ticket[] @relation("TicketAssigned")\n  sessions       Session[]'
)

# ============================================================
# 7. Add @relation to Document: uploadedBy -> User
# ============================================================
content = content.replace(
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}',
    '  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  uploadedByUser User?      @relation("DocumentUploader", fields: [uploadedBy], references: [id])\n  @@index([type])\n}'
)

# Add back-relation to User for Document
content = content.replace(
    '  assignedTickets  Ticket[] @relation("TicketAssigned")\n  sessions       Session[]',
    '  assignedTickets  Ticket[] @relation("TicketAssigned")\n  documents      Document[] @relation("DocumentUploader")\n  sessions       Session[]'
)

# ============================================================
# 8. Add @relation to Notification: userId -> User (already has org relation)
# ============================================================
content = content.replace(
    '  organization   Organization? @relation(fields: [organizationId], references: [id])\n}',
    '  user           User? @relation("NotificationUser", fields: [userId], references: [id])\n  organization   Organization? @relation(fields: [organizationId], references: [id])\n  @@index([userId])\n  @@index([organizationId])\n}'
)

# Add back-relation to User for Notification
content = content.replace(
    '  documents      Document[] @relation("DocumentUploader")\n  sessions       Session[]',
    '  documents      Document[] @relation("DocumentUploader")\n  notifications  Notification[] @relation("NotificationUser")\n  sessions       Session[]'
)

# ============================================================
# 9. Add @relation to AIConversation: userId -> User, organizationId -> Organization
# ============================================================
content = content.replace(
    '  userId         String?  @map("user_id")\n  organizationId String?  @map("organization_id")\n  type           String   @default("fleet_assistant")\n  messages       String\n  createdAt      DateTime @default(now()) @map("created_at")\n  updatedAt      DateTime @updatedAt @map("updated_at")\n}',
    '  userId         String?  @map("user_id")\n  organizationId String?  @map("organization_id")\n  type           String   @default("fleet_assistant")\n  messages       String\n  createdAt      DateTime @default(now()) @map("created_at")\n  updatedAt      DateTime @updatedAt @map("updated_at")\n\n  user           User? @relation("AIConversationUser", fields: [userId], references: [id])\n  organization   Organization? @relation(fields: [organizationId], references: [id])\n\n  @@index([userId])\n  @@index([organizationId])\n}'
)

# Add back-relation to User for AIConversation
content = content.replace(
    '  notifications  Notification[] @relation("NotificationUser")\n  sessions       Session[]',
    '  notifications  Notification[] @relation("NotificationUser")\n  aiConversations AIConversation[] @relation("AIConversationUser")\n  sessions       Session[]'
)

# ============================================================
# 10. Add @relation to AuditLog: organizationId -> Organization (already has user relation)
# ============================================================
content = content.replace(
    '  user          User?    @relation(fields: [userId], references: [id])\n}',
    '  user          User?    @relation(fields: [userId], references: [id])\n  organization   Organization? @relation("AuditLogOrganization", fields: [organizationId], references: [id])\n}'
)

# ============================================================
# P1-4: Add organizationId to Trip model
# ============================================================
content = content.replace(
    '  status         String   @default("in_progress")\n  createdAt      DateTime @default(now()) @map("created_at")\n\n  vehicle        Vehicle  @relation(fields: [vehicleId], references: [id])\n}',
    '  organizationId String?  @map("organization_id")\n  status         String   @default("in_progress")\n  createdAt      DateTime @default(now()) @map("created_at")\n\n  vehicle        Vehicle  @relation(fields: [vehicleId], references: [id])\n  @@index([organizationId])\n}'
)

# ============================================================
# P1-4: Add organizationId to Activity model
# ============================================================
content = content.replace(
    '  userId         String?  @map("user_id")\n  leadId         String?  @map("lead_id")\n  opportunityId  String?  @map("opportunity_id")\n  createdAt      DateTime @default(now()) @map("created_at")\n\n  user           User?       @relation(fields: [userId], references: [id])\n  lead           Lead?       @relation(fields: [leadId], references: [id])\n  opportunity    Opportunity? @relation(fields: [opportunityId], references: [id])\n}',
    '  userId         String?  @map("user_id")\n  leadId         String?  @map("lead_id")\n  opportunityId  String?  @map("opportunity_id")\n  organizationId String?  @map("organization_id")\n  createdAt      DateTime @default(now()) @map("created_at")\n\n  user           User?       @relation(fields: [userId], references: [id])\n  lead           Lead?       @relation(fields: [leadId], references: [id])\n  opportunity    Opportunity? @relation(fields: [opportunityId], references: [id])\n  @@index([userId])\n  @@index([leadId])\n  @@index([opportunityId])\n  @@index([organizationId])\n}'
)

# ============================================================
# Add Organization back-relations for all new FKs
# ============================================================
# Find the Organization model's relation fields and add missing ones
org_rels = '  aiConversations AIConversation[]'
content = content.replace(
    '  apiKeys        ApiKey[]\n\n  @@index([status])\n  @@index([emirate])\n}',
    '  apiKeys        ApiKey[]\n  auditLogs      AuditLog[] @relation("AuditLogOrganization")\n  sims           SIM[]\n  aiConversations AIConversation[]\n\n  @@index([status])\n  @@index([emirate])\n}'
)

# Add Vehicle back-relation for Installation
content = content.replace(
    '  device         Device?    @relation(fields: [deviceId], references: [id])\n  trips          Trip[]\n  alerts         Alert[] @relation("AlertVehicle")',
    '  device         Device?    @relation(fields: [deviceId], references: [id])\n  trips          Trip[]\n  installations  Installation[]\n  alerts         Alert[] @relation("AlertVehicle")'
)

# Add Device back-relation for Installation
content = content.replace(
    '  organization   Organization? @relation(fields: [organizationId], references: [id])\n  vehicles       Vehicle[]\n  sim            SIM?',
    '  organization   Organization? @relation(fields: [organizationId], references: [id])\n  vehicles       Vehicle[]\n  installations  Installation[]\n  sim            SIM?'
)

with open(SCHEMA_PATH, 'w') as f:
    f.write(content)

print('Schema updated with FK relations and Trip/Activity organizationId')
