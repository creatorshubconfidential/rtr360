# DATABASE-AUDIT.md — RTR360

> **Audit Date:** 2026-08-16
> **Schema File:** `prisma/schema.prisma` | **Models:** 31 | **Provider:** SQLite (dev) / PostgreSQL (prod planned)
> **Migration Files:** NONE | **Migration Strategy:** `prisma db push` (no rollback, no history)

---

## 1. P0 Critical Issues

### 1.1 Twelve (12) Money Fields Using `Float`

IEEE-754 `Float` causes rounding errors on monetary values. `0.1 + 0.2 = 0.30000000000000004`. In a billing system, this means invoices don't add up, tax calculations are wrong, and financial reports are inaccurate.

| Model | Field | Current Type | Required Type |
|-------|-------|-------------|---------------|
| `Opportunity` | `value` | `Float?` | `Decimal` |
| `Device` | `purchaseCost` | `Float?` | `Decimal` |
| `Plan` | `priceMonthly` | `Float` | `Decimal` |
| `Plan` | `priceAnnual` | `Float?` | `Decimal` |
| `Invoice` | `amount` | `Float` | `Decimal` |
| `Invoice` | `tax` | `Float` | `Decimal` |
| `Invoice` | `total` | `Float` | `Decimal` |
| `Quotation` | `subtotal` | `Float` | `Decimal` |
| `Quotation` | `taxRate` | `Float` | `Decimal` |
| `Quotation` | `tax` | `Float` | `Decimal` |
| `Quotation` | `total` | `Float` | `Decimal` |
| `MaintenanceRecord` | `cost` | `Float?` | `Decimal` |

**Fix:** Migrate to PostgreSQL (supports `Decimal` natively) and change all fields to `Decimal @db.Decimal(15, 2)`.

### 1.2 Zero (0) Database Indexes

No `@@index` directive exists anywhere in the schema. In a multi-tenant SaaS, every query filters by `organizationId`. Without indexes, every query is a full table scan. With 10,000 vehicles, a simple list query scans all rows.

**Minimum required indexes (19):**

| Model | Index | Reason |
|-------|-------|--------|
| `User` | `@@index([organizationId, status])` | User list by org |
| `User` | `@@index([email])` | Login lookup |
| `Vehicle` | `@@index([organizationId, status])` | Fleet list |
| `Vehicle` | `@@index([plateNumber])` | Plate lookup |
| `Driver` | `@@index([organizationId, status])` | Driver list |
| `Device` | `@@index([organizationId, status])` | Device inventory |
| `Lead` | `@@index([organizationId, status])` | Pipeline |
| `Lead` | `@@index([organizationId, assignedToId])` | My leads |
| `Opportunity` | `@@index([organizationId, stage])` | Pipeline |
| `Ticket` | `@@index([organizationId, status])` | Ticket board |
| `Invoice` | `@@index([organizationId, status])` | AR aging |
| `Installation` | `@@index([organizationId, status])` | Ops board |
| `Alert` | `@@index([organizationId, status])` | Alert feed |
| `MaintenanceRecord` | `@@index([organizationId, status])` | Maintenance board |
| `Trip` | `@@index([vehicleId, startTime])` | Trip history |
| `AuditLog` | `@@index([organizationId, createdAt])` | Audit trail |
| `Notification` | `@@index([userId, read])` | Unread count |
| `Session` | `@@index([token])` | Auth lookup (covered by @unique) |
| `AIConversation` | `@@index([organizationId, createdAt])` | Conversation list |

---

## 2. P1 High Issues

### 2.1 Fifteen (15) Broken Foreign Key Relations

These fields exist as raw `String` columns with NO `@relation` declaration. No referential integrity, no cascade on delete, no Prisma `include` support.

| Model | Field | Should Reference |
|-------|-------|-----------------|
| `AuditLog` | `organizationId` | `Organization` |
| `Opportunity` | `assignedToId` | `User` |
| `Opportunity` | `leadId` | `Lead` |
| `Installation` | `vehicleId` | `Vehicle` |
| `Installation` | `deviceId` | `Device` |
| `SIM` | `organizationId` | `Organization` |
| `Alert` | `vehicleId` | `Vehicle` |
| `Quotation` | `contactId` | `Contact` |
| `Ticket` | `assignedToId` | `User` |
| `Document` | `uploadedBy` | `User` |
| `Notification` | `userId` | `User` |
| `AIConversation` | `userId` | `User` |
| `AIConversation` | `organizationId` | `Organization` |
| `User` | (back-relations) | `Opportunity`, `Ticket`, `Document`, `Notification` |
| `Device` | (back-relation) | `Installation` |

### 2.2 Two Models Missing `organizationId`

| Model | Risk |
|-------|------|
| `Trip` | Only has `vehicleId`. Any missed join exposes cross-tenant data. |
| `Activity` | Has `userId`, `leadId`, `opportunityId` but no direct org link. |

### 2.3 Quotation Items Stored as JSON Blob

```prisma
model Quotation {
  items String  // JSON string of line items
}
```

This prevents querying individual items, validating data integrity, and generating accurate per-product reports.

**Required:** New `QuotationItem` model with normalized fields.

### 2.4 Cascade Delete Inconsistencies

Seven models have `organizationId` but NO `onDelete: Cascade`:

`User`, `Lead`, `Device`, `Subscription`, `Invoice`, `Notification`, `SIM`

Deleting an organization will either fail (foreign key constraint) or leave orphaned records.

### 2.5 Missing Unique Constraints

| Model | Field | Needed Constraint |
|-------|-------|-----------------|
| `Vehicle` | `plateNumber` | `@@unique([organizationId, plateNumber])` |
| `Driver` | `licenseNumber` | `@@unique([organizationId, licenseNumber])` |
| `Driver` | `passportNumber` | `@@unique([organizationId, passportNumber])` |

### 2.6 Nine (9) Missing Models

| Model | Purpose |
|-------|---------|
| `Role` | RBAC — permission sets, hierarchy |
| `Permission` | Fine-grained access control |
| `Payment` | Payment tracking linked to Invoice |
| `QuotationItem` | Normalized quotation line items |
| `Telemetry` | GPS position storage |
| `VehicleEvent` | Ignition, door, harsh brake events |
| `VehicleDevice` | Junction table for device history |
| `Webhook` | Outbound integration support |
| `Integration` | Third-party integration tracking |

---

## 3. P2 Medium Issues

### 3.1 Thirty-One (31) Status/Type Fields Using `String`

No database-level validation. A typo like `"actve"` silently corrupts data. Prisma enums require PostgreSQL.

Key fields: `User.status`, `User.role`, `Lead.status`, `Lead.priority`, `Vehicle.status`, `Device.status`, `Invoice.status`, `Quotation.status`, `Ticket.priority`, `Ticket.status`, `Contract.status`, `Subscription.status`, `Installation.status`, `MaintenanceRecord.status`, `Alert.severity`, `Alert.status`, `Trip.status`, `Geofence.type`

### 3.2 Eight (8) Models Missing `updatedAt`

`AlertRule`, `Alert`, `Trip`, `Document`, `Notification`, `Setting`, `ApiKey`, `AIConversation`

### 3.3 Denormalized Counter Fields

| Model | Fields | Issue |
|-------|--------|-------|
| `Driver` | `score`, `totalTrips`, `totalDistance`, `totalViolations` | No sync mechanism |
| `Technician` | `totalInstalled`, `rating` | No sync mechanism |
| `Alert` | `driverName`, `vehiclePlate` | Must stay in sync with source records |
| `Trip` | `driverName` | Should reference Driver instead |

### 3.4 Other Issues

- `Installation.scheduledTime` is `String?` not `DateTime` — timezone-unsafe
- `AIConversation.messages` is a JSON blob — should be normalized `AIMessage` model
- `AuditLog` uses polymorphic `entity`/`entityId` pattern — prevents FK integrity
- `Branch` has no `@@unique([organizationId, name])`
- `Setting` has no `createdAt`/`updatedAt`

---

## 4. Migration Strategy Gap

**Current:** `prisma db push` — applies schema changes directly, no migration files, no rollback.

**Required for production:**
1. `prisma migrate dev --name init` — create initial migration
2. `prisma migrate deploy` — apply migrations in production
3. Never use `db push` in production
4. Never use `db push --accept-data-loss`

**Blockers:**
- SQLite doesn't support `Decimal` or `enum` types
- Must migrate to PostgreSQL BEFORE fixing P0 money fields
- No migration files exist — the initial migration will capture the entire current schema

---

## 5. Schema Statistics

| Metric | Value |
|--------|-------|
| Total models | 31 |
| Models with `organizationId` | 26 |
| Models missing `organizationId` | 5 (Trip, Activity, Session, Setting, Plan) |
| P0 money fields (Float) | 12 |
| P0 missing indexes | 19+ |
| P1 broken FK relations | 15 |
| P1 missing unique constraints | 3 |
| P1 missing models | 9 |
| P2 String-instead-of-Enum fields | 31 |
| P2 missing `updatedAt` | 8 |
| Total `@@index` directives | 0 |
| Total `@@unique` directives | 4 |