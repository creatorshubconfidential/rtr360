# 🤖 AGENTS.md — RTR 360 Development Guide

> **Powered by Mianx.ai** | MIANX.AI 14-Agent Architecture Reference
> This file serves as the **single source of truth** for any AI agent or developer working on the RTR 360 project.

---

## 🎯 Project Overview

**RTR 360** is a Fleet Technology & Management SaaS Platform being built for RTR, a UAE-based GPS and fleet tracking company. The platform is transforming RTR's service-based business model into a comprehensive multi-tenant SaaS product.

### Key Facts
- **Client**: RTR (UAE-based GPS/Fleet Tracking company)
- **Market**: United Arab Emirates (7 emirates)
- **Currency**: AED (United Arab Emirates Dirham)
- **Timezone**: Asia/Dubai (UTC+4)
- **VAT**: 5% UAE Federal Tax Authority
- **Brand Color**: Emerald-600 (#059669)
- **Architecture**: Multi-tenant SaaS with Organization-based isolation
- **Auth**: Session-based Bearer token (bcryptjs)
- **Single-Page App**: Only `/` route, all UI from `src/app/page.tsx`

### MIANX.AI 14-Agent Philosophy

All development follows the **KEEP / IMPROVE / INTEGRATE / REPLACE / BUILD** strategy:

| Strategy | Meaning |
|----------|---------|
| **KEEP** | Existing working code stays, don't rewrite unnecessarily |
| **IMPROVE** | Enhance UX, performance, and code quality |
| **INTEGRATE** | Connect modules through shared types, auth, tenant isolation |
| **REPLACE** | Replace manual processes with automated solutions |
| **BUILD** | Create new capabilities that didn't exist before |

---

## 📊 Phase Progress

| Phase | Module | Status | Routes | Views |
|-------|--------|--------|--------|-------|
| 1 | Foundation (Auth, DB, Dashboard) | ✅ Complete | 7 | 3 |
| 2 | CRM & Sales Pipeline | ✅ Complete | +5 = 12 | +3 = 6 |
| 3 | Operations (Drivers, Devices, Installs, Techs) | ✅ Complete | +8 = 20 | +4 = 10 |
| 4 | FleetOS (Live GPS Map) | ✅ Complete | 20 | +1 = 11 |
| 5 | Maintenance, Billing, Support, Settings | ✅ Complete | +10 = 30 | +6 = 17 |
| 6 | AI Intelligence & Platform Polish | ✅ Complete | +3 = 33→46 | +5 = 21+AI |
| 7 | Advanced Analytics & Predictive Intelligence | ✅ Complete | +4 = 50 | +1 = 22+AI |
| 8 | Mobile-First PWA & Real-Time WebSocket | ✅ Complete | +2 = 52 | +4 components |
| 9 | Multi-Org Super Admin & White-Label | ✅ Complete | +5 = 57 | +1 = 23+AI |
| 10 | API Gateway, Webhooks & Integrations | 🔲 Upcoming | — | — |

**Totals (Phase 1-9)**: 57 API routes, 23 view components + AI panel, 28 DB models, 45+ UI components

---

## 🏗️ Technical Architecture

### Tech Stack
```
Frontend:  Next.js 16 + React 19 + Tailwind CSS 4 + Framer Motion
UI:        shadcn/ui (Radix UI) + Lucide Icons
Backend:   Next.js App Router API Routes
Database:  PostgreSQL (prod) / SQLite (dev)
ORM:       Prisma 6
Auth:      bcryptjs + DB sessions + Bearer token
Maps:      Leaflet + React-Leaflet + OpenStreetMap
Charts:    Recharts (available, used in ReportsView)
State:     React hooks + Zustand (available)
Forms:     React Hook Form + Zod (available)
AI:        Pattern-matching fleet assistant
```

### Project Structure
```
prisma/
  schema.prisma              # 28 models — single source of truth for DB
src/
  app/
    api/                     # All API routes (57 files)
    globals.css              # RTR brand CSS variables
    layout.tsx               # Root layout (metadata, Toaster, Inter font, Leaflet CSS)
    page.tsx                 # SPA entry — LoginScreen + AdminDashboard
  components/
    ui/                      # 40+ shadcn/ui components (DO NOT EDIT)
    views/                   # 23 view components (main development area)
    AIChatPanel.tsx          # AI assistant slide-out overlay
    MobileBottomNav.tsx      # PWA mobile bottom navigation
    PWAInstallPrompt.tsx     # PWA install prompt card
    ConnectionStatus.tsx     # Online/offline/reconnecting indicator
    RealtimeEventToasts.tsx  # SSE fleet event toast notifications
  lib/
    auth.ts                  # hashPassword(), verifyPassword(), createSession(), verifySession()
    db.ts                    # Prisma client singleton
    types.ts                 # TypeScript interfaces (UserSession, Lead, Vehicle, etc.)
    constants.ts             # UAE emirates, vehicle types, status colors, etc.
    api.ts                   # authFetch(), formatAED(), formatDate(), formatDateTime()
    export.ts                # exportCSV() with 8 column presets
    utils.ts                 # cn() helper (Tailwind merge)
    seed.ts                  # Demo data generator
  hooks/
    use-mobile.ts            # Mobile detection hook
  types/
    leaflet.d.ts             # Leaflet global type declarations
```

---

## 🔐 Authentication & Multi-Tenancy

### Auth Flow
1. `POST /api/auth/login` — Validate email/password → create Session → return `{ token, user }`
2. Frontend stores token in `localStorage.getItem('rtr_token')`
3. All API calls include `Authorization: Bearer <token>` header
4. `verifySession(token)` checks DB session expiry → returns user with organizationId

### Tenant Isolation
- Every entity has `organizationId` field with `onDelete: Cascade`
- All API routes filter data by `user.organizationId`
- Super admin (no organizationId) sees all data

### Roles
```typescript
type Role =
  | 'super_admin'       // Full platform access
  | 'platform_admin'    // Platform management
  | 'operations_manager' // Fleet operations
  | 'sales_manager'     // CRM & sales
  | 'fleet_manager'     // Fleet management
  | 'dispatcher'        // Live tracking & dispatch
  | 'viewer'            // Read-only access
  | 'org_owner';        // Organization owner
```

### Auth Helper Pattern
Every API route must use:
```typescript
import { verifySession } from '@/lib/auth';

const session = await verifySession(token);
if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
// session.user.id, session.user.role, session.user.organizationId
```

### Frontend Auth Pattern
Every view component uses:
```typescript
function authFetch(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rtr_token') : null;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}
```

---

## 🗄️ Database Schema (28 Models)

### Tenant & Organization
- `Organization` — Multi-tenant root (UAE emirates, AED, Dubai TZ, branding)
- `Branch` — Org branches with emirate/address
- `Setting` — Platform key-value configuration

### Auth & Users
- `User` — 8 RBAC roles, org-scoped, email/password
- `Session` — DB-backed auth sessions with expiry
- `AuditLog` — Full audit trail (user, action, entity, IP)

### CRM & Sales
- `Lead` — Sales leads (UTM tracking, priority, assignment, status)
- `Contact` — Contact directory (name, position, phone, email)
- `Opportunity` — Sales opportunities (stage, value, close date)
- `Activity` — Activity log (call/email/meeting/visit/note/whatsapp)
- `Quotation` — Line-item quotations (JSON items, 5% VAT, AED)
- `Contract` — Service contracts (dates, terms, status)

### Fleet
- `Vehicle` — Fleet vehicles (UAE plate, make/model, mileage, warranty)
- `Driver` — Drivers (UAE license types, nationality, emergency contacts, score)
- `Device` — GPS devices (IMEI, SIM, firmware, battery, warehouse)
- `SIM` — SIM cards (provider, data plan, status)
- `Trip` — Trip tracking (distance, speed, idle, harsh events)
- `Geofence` — Geofence zones (circle/polygon, lat/lng)
- `AlertRule` — Alert configuration (type, conditions, channels)
- `Alert` — Generated alerts (severity, vehicle, message, status)

### Operations
- `Technician` — Field technicians (specialty, rating, install count)
- `Installation` — Device install workflow (4-step state machine)
- `MaintenanceRecord` — Work orders (type, cost, schedule, status)

### Billing
- `Plan` — Subscription plans (pricing, vehicle limits, features)
- `Subscription` — Org subscriptions (vehicle count, billing cycle)
- `Invoice` — Invoicing (AED, VAT, PDF, status workflow)

### Support & AI
- `Ticket` — Support tickets (priority, status, vehicle plate)
- `Notification` — In-app notifications (type, title, read status)
- `Document` — File management
- `AIConversation` — AI chat history (messages JSON)

---

## 📱 All Views (22 Modules)

| # | View | Component | Key Features |
|---|------|-----------|-------------|
| 1 | Dashboard | Inline in page.tsx | 11+ KPI cards, quick actions |
| 2 | Live Tracking | LiveTrackingView.tsx | Leaflet map, real-time sim, vehicle popups |
| 3 | Vehicles | Inline in page.tsx | CRUD, UAE plates, driver/device assignment |
| 4 | Drivers | DriversView.tsx | CRUD, UAE licenses, score, emergency contacts |
| 5 | Devices | DevicesView.tsx | Inventory, IMEI, SIM, warehouse, purchase tracking |
| 6 | Installations | InstallationsView.tsx | 4-step workflow, checklist, technician assignment |
| 7 | Technicians | TechniciansView.tsx | Field team management, install stats |
| 8 | Maintenance | MaintenanceView.tsx | Work orders, cost tracking, vehicle-linked |
| 9 | Pipeline | PipelineView.tsx | Kanban (7 stages), inline quotation creation |
| 10 | Leads | Inline in page.tsx | CRUD, UTM, priority, assignment |
| 11 | Contacts | ContactsView.tsx | Directory, search, mobile cards + desktop table |
| 12 | Quotations | QuotationsView.tsx | Line items, 5% VAT, PDF, status workflow |
| 13 | Trips | TripsView.tsx | Distance, speed, harsh driving analytics |
| 14 | Geofences | GeofencesView.tsx | Circle/polygon zones on UAE map |
| 15 | Alert Rules | AlertRulesView.tsx | Alert configuration, channels |
| 16 | Subscriptions | SubscriptionsView.tsx | Plan management, billing cycle |
| 17 | Invoices | InvoicesView.tsx | AED, VAT, PDF download, bank details |
| 18 | Contracts | ContractsView.tsx | Contract management, terms |
| 19 | Tickets | TicketsView.tsx | Priority, status, vehicle linking, CSV export |
| 20 | Notifications | NotificationsView.tsx | Bell icon, unread count, click-navigate |
| 21 | Users | UsersView.tsx | User CRUD, role assignment |
| 22 | Settings | SettingsView.tsx | Platform config, company info |
| 23 | Audit Logs | AuditLogsView.tsx | Full trail with user, action, IP |
| 24 | Reports | ReportsView.tsx | Fleet analytics, charts, KPIs |
| 25 | AI Assistant | AIChatPanel.tsx | Chat overlay, 12+ intents, quick actions |
| 26 | Super Admin | SuperAdminView.tsx | Platform stats, org management, onboarding, white-label, usage |

---

## 🛠️ Development Guidelines

### Adding a New API Route

1. Create file at `src/app/api/<module>/route.ts`
2. Always use `verifySession()` for auth
3. Filter by `organizationId` for tenant isolation
4. Follow existing patterns (see any route in `/api/vehicles/route.ts`)
5. Return consistent JSON: `{ data: [...], total: N, page: P, limit: L }`

### Adding a New View

1. Create component at `src/components/views/<Name>View.tsx`
2. Use `authFetch()` for API calls
3. Add ViewType to `src/lib/types.ts`
4. Import in `src/app/page.tsx`
5. Add to `viewTitle` record and `renderView()` switch
6. Add nav item in `NAV_SECTIONS` (page.tsx SidebarNav)

### Code Patterns

**API Response Format:**
```typescript
// List endpoint
{ data: T[], total: number, page: number, limit: number, counts?: Record<string, number> }

// Create endpoint
{ success: true, data: T }

// Error
{ error: string }
```

**Status Colors (constants.ts):**
```typescript
const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700',
  // ... etc
};
```

**AED Formatting:**
```typescript
import { formatAED } from '@/lib/api';
formatAED(1500); // "AED 1,500.00"
```

### UI/UX Standards
- **Primary Color**: Emerald-600 (#059669)
- **Sidebar**: `bg-slate-900 text-white`
- **Background**: `bg-[var(--rtr-bg)]` (light slate)
- **Cards**: White with subtle border (`border-slate-200`)
- **Animations**: Framer Motion for page transitions
- **Mobile**: Responsive with collapsible sidebar (Sheet component)
- **Tables**: Desktop table + mobile card layout pattern
- **Dialogs**: shadcn/ui Dialog for create/edit forms
- **Toasts**: `sonner` toast library for notifications
- **Badges**: Color-coded status badges
- **Pagination**: Previous/Next with page info

### UAE-Specific Constants
```typescript
// Emirates
const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

// Vehicle Types
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Pickup', 'Van', 'Truck', 'Bus', 'Trailer', 'Tanker', 'Motorcycle', 'Heavy Equipment'];

// Lead Sources
const LEAD_SOURCES = ['Website', 'Referral', 'Google Ads', 'Facebook', 'LinkedIn', 'Exhibition', 'Cold Call', 'WhatsApp', 'Email', 'Walk-in'];

// License Types (UAE)
const LICENSE_TYPES = ['Light Vehicle', 'Heavy Vehicle', 'Heavy Bus', 'Light Bus', 'Motorcycle', 'Temporary'];
```

---

## 🚀 Build & Deploy

```bash
# Development
npm run dev

# Production build (standalone output)
npm run build

# Start production
npm start

# Database
npx prisma db push          # Apply schema changes
npx prisma generate         # Generate client
npx prisma db seed          # Seed demo data
npx prisma studio           # DB GUI

# Lint
npm run lint
```

### Environment
- `DATABASE_URL` — Prisma connection string
- Output mode: `standalone` (for Docker/server deployment)
- TypeScript: `ignoreBuildErrors: true` (Prisma edge runtime compatibility)

---

## 📋 Seed Data

Default demo data includes:
- **3 Organizations**: RTR Platform, Al Fahim Logistics, Mega Logistics FZCO
- **4 Users**: admin@rtr.ae, omar@alfahim.ae, ahmed@alfahim.ae, sara@alfahim.ae
- **5 Vehicles**: UAE-plated fleet (Toyota Hilux, Nissan Patrol, etc.)
- **3 Drivers**: With UAE license types and nationalities
- **8 GPS Devices**: Various types (GPS, OBD, Wired), 2 warehouses
- **3 Technicians**: Field team across Dubai/Abu Dhabi
- **4 Installations**: Various stages of completion
- **10 Leads**: Across pipeline stages
- **3 Quotations**: With line items and 5% VAT
- **4 Contacts**: Decision makers
- **6 Maintenance Records**: Scheduled and completed
- **5 Support Tickets**: Various priorities
- **4 Invoices**: AED with VAT
- **2 Plans**: Starter and Premium
- **1 Subscription**: Active
- **15 Platform Settings**: Company info, branding, defaults

**Default Login**: `admin@rtr.ae` / `REDACTED_DEMO_PASSWORD`

---

## 🔲 Upcoming Phases

### Phase 7: Advanced Analytics & Predictive Intelligence
- Predictive maintenance (ML-based)
- Driver behavior scoring with trend analysis
- Fuel consumption analytics
- Route optimization suggestions
- Advanced fleet utilization reports
- Custom report builder

### Phase 8: Mobile-First PWA & Real-Time WebSocket
- ✅ Progressive Web App (installable, offline)
- ✅ SSE real-time vehicle updates (3s interval)
- ✅ Push notification support (service worker)
- ✅ Mobile-optimized UI with bottom navigation
- ✅ Connection status indicator (offline/reconnecting)
- ✅ Live fleet event toasts (speed, geofence, harsh braking)

### Phase 9: Multi-Org Super Admin & White-Label
- ✅ Super admin dashboard for platform management
- ✅ Organization onboarding flow (3-step wizard)
- ✅ White-label branding per organization (colors, app name, footer)
- ✅ Usage analytics per organization (30d/90d)
- ✅ Organization list with search, filters, detail dialog
- ✅ Platform-wide stats (orgs, users, vehicles, revenue, white-label count)
- ✅ Role-based nav (PLATFORM section visible only for super_admin)
- ✅ Soft-deactivate organizations with user cascading

### Phase 10: API Gateway, Webhooks & Integrations
- Public API with API key management
- Webhook configuration (events: alert, maintenance, trip)
- Third-party integrations (SAP, QuickBooks, WhatsApp Business)
- ERP/Accounting system connectors
- Email/SMS notification providers

---

## ⚠️ Important Notes

1. **DO NOT EDIT** files in `src/components/ui/` — these are shadcn/ui generated components
2. **Always use `authFetch()`** in view components for authenticated API calls
3. **Always use `verifySession()`** in API routes for authentication
4. **Always filter by `organizationId`** for tenant isolation
5. **Use `formatAED()`** for all currency displays
6. **Use `formatDate()` / `formatDateTime()`** from `@/lib/api` for date formatting
7. **UAE VAT is 5%** — hardcode in quotation/invoice calculations
8. **Plate format**: `EMIRATE-CODE-NUMBER` (e.g., DXB-A-12345)
9. **"Powered by Mianx.ai"** branding must appear in AI features and PDF outputs
10. **All new views** must follow mobile-responsive pattern (card layout on mobile, table on desktop)
11. **Single-page app** — only `/` route exists, all navigation is client-side state
12. **CSS Variables** are defined in `globals.css` under `:root` — use `var(--rtr-*)` for brand colors

---

<div align="center">
  <p><strong>RTR 360</strong> — Fleet Technology & Management Platform</p>
  <p>Powered by <strong>Mianx.ai</strong> | Built with MIANX.AI 14-Agent Architecture</p>
</div>