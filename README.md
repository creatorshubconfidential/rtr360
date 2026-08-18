# RTR 360 v2 — Fleet Technology & Management Platform

> **Powered by Mianx.ai** | Multi-tenant SaaS for UAE Fleet & GPS Tracking Companies

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma" alt="Prisma 6" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Platform-v2_Emerald-emerald?logo=upgrade" alt="v2" />
  <img src="https://img.shields.io/badge/License-Confidential-red" alt="Confidential" />
  <br /><br />
  <a href="https://rtr360.vercel.app"><img src="https://img.shields.io/badge/Live_Demo-rtr360.vercel.app-blue?logo=vercel" alt="Live Demo" /></a>
</div>

---

## About RTR 360

RTR 360 is a comprehensive **Fleet Technology & Management SaaS Platform** built for RTR — a UAE-based GPS and fleet tracking company. The platform transforms RTR's service-based business into a complete SaaS product covering every aspect of fleet management, GPS tracking, CRM, billing, and AI-powered analytics.

The platform serves the **UAE market** with support for AED currency, Dubai timezone (Asia/Dubai), all 7 emirates, and UAE vehicle plate formats (e.g., DXB-A-12345).

---

## What's New in v2

The v2 upgrade is a **full overhaul** — redesigned dashboard, unified data table system, reusable hooks library, error boundaries, and polished UX across all 25 views.

### Dashboard v2
- **Smart greeting header** with time-aware message and org name
- **8 KPI cards** with sparkline mini-charts, trend indicators, and count-up animations
- **Predictive insights panel** with AI-driven fleet recommendations
- **Fleet status donut chart** (active / idle / maintenance / inactive)
- **Operations panel** with live recent alerts and hot leads
- **Quick navigation grid** for fast access to any module
- **Quick actions** — one-click shortcuts for common tasks

### DataTable System (20 views converted)
A generic, reusable `DataTable<T>` component now powers 20 out of 25 views with:
- **Client-side sorting** on any column (toggle asc/desc)
- **Pagination** with configurable page size and page navigation
- **Live search** with 300ms debounce across all columns
- **CSV export** with UTF-8 BOM (Arabic-compatible)
- **Clipboard copy** for quick data transfer
- **Loading skeleton** with animated shimmer placeholders
- **Empty state** with clear messaging
- **Responsive** — works on mobile and desktop

| Views using DataTable |
|----------------------|
| Vehicles, Drivers, Devices, Leads, Contacts, Trips |
| Contracts, Geofences, Maintenance, Invoices, Quotations |
| Tickets, Users, Technicians, Installations, Subscriptions |
| Reports, AuditLogs, SuperAdmin, Analytics |

### Date Range Filter
- Reusable `DateRangeFilter` component with preset ranges (Today, 7D, 30D, 90D, This Month, Custom)
- Integrated into **Trips**, **Invoices**, and **Maintenance** views

### Hooks Library
| Hook | Purpose |
|------|---------|
| `useApi<T>` | Generic data fetching with loading/error state, auth-aware, `enabled` flag support |
| `usePagination` | Page/pageSize state, navigation helpers, canNext/canPrev guards |
| `useDebounce` | Value debounce + function debounce utilities |
| `useSearch` | URL-based search with 300ms debounce, integrated with useApi |

### Error Handling v2
- **ErrorBoundary** — Class-based React error boundary wrapping all views, catches render crashes gracefully with retry button
- **Global error.tsx** — App-level error page with branded fallback
- **Global loading.tsx** — Skeleton loading spinner for route transitions
- **Notification bell upgrade** — Dropdown panel with notification list, mark-as-read, and empty state

### Export System
- **ExportButton** — Dropdown component with CSV download + clipboard copy
- Sonner toast notifications on export success

---

## Current Status

| Phase | Module | Status |
|-------|--------|--------|
| Phase 1 | Foundation (Auth, DB, Dashboard, Seed Data) | Done |
| Phase 2 | CRM & Sales (Pipeline, Leads, Quotations, Contacts) | Done |
| Phase 3 | Operations (Drivers, Devices, Installations, Technicians) | Done |
| Phase 4 | FleetOS (Live GPS Map, Vehicle Tracking) | Done |
| Phase 5 | Maintenance, Billing, Support, Settings | Done |
| Phase 6 | AI Intelligence & Platform Polish | Done |
| Phase 7 | Advanced Analytics & Predictive Intelligence | Done |
| Phase 8 | Mobile-First PWA & Real-Time WebSocket | Done |
| Phase 9 | Multi-Org Super Admin & White-Label | Done |
| **Phase 10** | **v2 Full Overhaul (UI, Architecture, DataTable, Hooks)** | **Done** |
| Phase 11 | API Gateway, Webhooks & Integrations | Upcoming |

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, Framer Motion |
| **UI Library** | shadcn/ui (Radix UI), Lucide Icons, Sonner (toasts) |
| **Backend** | Next.js API Routes (App Router) |
| **Database** | PostgreSQL (Supabase) / SQLite (development) |
| **ORM** | Prisma 6 |
| **Auth** | Session-based with Bearer token (bcryptjs) |
| **Maps** | Leaflet + React-Leaflet + OpenStreetMap |
| **Charts** | Recharts (dashboard KPIs, analytics) |
| **State** | React hooks (custom hook library) |
| **Security** | Distributed rate limiter (L1 in-memory + L2 PostgreSQL), RBAC (8 roles, 22 permissions) |
| **AI** | Pattern-matching fleet assistant (Powered by Mianx.ai) |

### Multi-Tenant Design

- **Organization-based isolation**: Every entity has `organizationId` with `onDelete: Cascade`
- **Role-based access**: 8 roles — `super_admin`, `platform_admin`, `operations_manager`, `sales_manager`, `fleet_manager`, `dispatcher`, `viewer`, `org_owner`
- **22 fine-grained permissions** with 448 RBAC test cases
- **Session auth**: DB-backed sessions with Bearer token verification
- **API-level tenant filtering**: All endpoints filter by user's organization
- **Rate limiting**: L1 in-memory (fast path) + L2 PostgreSQL (`RateLimitCounter` model) for distributed protection

---

## Project Structure

```
rtr360/
├── prisma/
│   ├── schema.prisma              # 28+ models, complete relational schema
│   └── migrations/                # Database migrations
├── src/
│   ├── app/
│   │   ├── api/                   # 57 API routes
│   │   │   ├── auth/              # login, logout, me
│   │   │   ├── vehicles/          # fleet management
│   │   │   ├── drivers/           # driver management
│   │   │   ├── devices/           # GPS device inventory
│   │   │   ├── installations/     # device installation workflow
│   │   │   ├── technicians/       # field technician management
│   │   │   ├── leads/             # CRM lead tracking
│   │   │   ├── contacts/          # contact directory
│   │   │   ├── quotations/        # quotation management with UAE VAT
│   │   │   ├── pipeline/          # sales pipeline analytics
│   │   │   ├── maintenance/       # work orders & maintenance
│   │   │   ├── tickets/           # support ticketing
│   │   │   ├── subscriptions/     # billing subscriptions
│   │   │   ├── invoices/          # invoicing + PDF generation
│   │   │   ├── contracts/         # contract management
│   │   │   ├── trips/             # trip tracking & analytics
│   │   │   ├── geofences/         # geofence management
│   │   │   ├── alert-rules/       # alert rule configuration
│   │   │   ├── reports/           # analytics & reporting
│   │   │   ├── users/             # user management
│   │   │   ├── settings/          # platform settings
│   │   │   ├── audit-logs/        # audit trail
│   │   │   ├── notifications/     # notification system
│   │   │   ├── dashboard/         # dashboard KPIs & alerts
│   │   │   ├── analytics/         # fleet health, driver trends, revenue
│   │   │   ├── admin/             # super admin, org management
│   │   │   ├── realtime/          # SSE streams (vehicles, events)
│   │   │   └── ai/                # AI fleet assistant
│   │   ├── globals.css            # RTR v2 brand CSS variables
│   │   ├── layout.tsx             # root layout with Toaster
│   │   ├── page.tsx               # Single-page app (SPA) entry
│   │   ├── loading.tsx            # v2 global loading skeleton
│   │   └── error.tsx              # v2 global error boundary page
│   ├── components/
│   │   ├── ui/                    # 40+ shadcn/ui components
│   │   ├── views/                 # 25 view components
│   │   ├── AdminDashboard.tsx     # Main shell with ErrorBoundary
│   │   ├── DataTable.tsx          # v2 generic data table (500+ lines)
│   │   ├── ExportButton.tsx       # v2 CSV + clipboard export
│   │   ├── DateRangeFilter.tsx    # v2 date range picker with presets
│   │   ├── ErrorBoundary.tsx      # v2 React error boundary
│   │   ├── PWAInstallPrompt.tsx   # PWA install prompt (7-day dismiss)
│   │   ├── SidebarNav.tsx         # Sidebar navigation
│   │   └── LoginScreen.tsx        # Login screen
│   ├── hooks/                     # v2 custom hooks library
│   │   ├── index.ts               # barrel re-exports
│   │   ├── useApi.ts              # generic fetch hook
│   │   ├── usePagination.ts       # pagination state
│   │   ├── useDebounce.ts         # debounce utilities
│   │   ├── useSearch.ts           # debounced search
│   │   └── use-mobile.ts          # mobile detection
│   └── lib/
│       ├── auth.ts                # password hashing, session management
│       ├── db.ts                  # Prisma client singleton
│       ├── types.ts               # TypeScript interfaces
│       ├── constants.ts           # UAE-specific constants
│       ├── api.ts                 # authFetch, formatAED, formatDate
│       ├── export.ts              # CSV export utility
│       ├── utils.ts               # cn() helper
│       └── seed.ts                # demo data (7 orgs, 4 users, 5 vehicles, etc.)
├── tests/                         # 448+ RBAC test cases, integration tests
├── package.json
├── next.config.ts                 # standalone output
└── tsconfig.json
```

---

## Database Schema (28+ Models)

### Core
| Model | Description |
|-------|-------------|
| `Organization` | Multi-tenant org (UAE emirates, AED, Dubai TZ) |
| `Branch` | Organization branches |
| `User` | Auth users with 8 RBAC roles |
| `Session` | DB-backed auth sessions |
| `AuditLog` | Full audit trail |
| `Setting` | Platform key-value settings |
| `Notification` | In-app notification system |
| `RateLimitCounter` | Distributed rate limiter (L2 PostgreSQL) |

### CRM & Sales
| Model | Description |
|-------|-------------|
| `Lead` | Sales leads with UTM tracking, priority, assignment |
| `Contact` | Contact directory |
| `Opportunity` | Sales opportunities with pipeline stages |
| `Activity` | Call/email/meeting/visit activity log |
| `Quotation` | Line-item quotations with 5% UAE VAT |
| `Contract` | Service contracts |

### Fleet Management
| Model | Description |
|-------|-------------|
| `Vehicle` | Fleet vehicles (UAE plate format, mileage, warranty) |
| `Driver` | Drivers (UAE license types, nationality, emergency) |
| `Device` | GPS devices (IMEI, SIM, firmware, battery) |
| `SIM` | SIM cards (provider, data plan) |
| `Technician` | Field technicians (specialty, rating) |
| `Installation` | Device installation workflow (4-step state machine) |
| `Trip` | Trip tracking (distance, speed, idle, harsh events) |
| `Geofence` | Geofence zones (circle/polygon) |
| `AlertRule` | Alert rule configuration |
| `Alert` | Generated alerts (open/resolved) |

### Operations & Billing
| Model | Description |
|-------|-------------|
| `MaintenanceRecord` | Work orders (scheduled, cost, vehicle-linked) |
| `Ticket` | Support tickets (priority, status, assignment) |
| `Plan` | Subscription pricing plans |
| `Subscription` | Org subscriptions (vehicle count, billing cycle) |
| `Invoice` | Invoicing (AED, VAT, PDF generation) |
| `Document` | File/document management |
| `AIConversation` | AI assistant conversation history |

---

## Features (26+ Modules)

### Dashboard v2
- 8 KPI cards with sparkline mini-charts and trend indicators
- Predictive insights panel with AI-driven recommendations
- Fleet status donut chart (active / idle / maintenance / inactive)
- Operations panel with recent alerts and hot leads
- Quick navigation grid and quick action shortcuts
- Time-aware greeting with organization name

### Live Tracking (FleetOS)
- Interactive Leaflet map centered on UAE
- Real-time vehicle position simulation (3-second SSE updates)
- Custom vehicle markers (blue=moving, purple=idle)
- Click-to-popup with plate, speed, driver, IMEI
- Vehicle sidebar with live status indicators
- Status filters: All, Moving, Idle, Active

### Fleet Management (DataTable powered)
- **Vehicles**: Full CRUD, UAE plate format, make/model/year, driver/device assignment, sortable/searchable table
- **Drivers**: UAE license types, nationality, emergency contacts, driving score, sortable/searchable table
- **Devices**: GPS/OBD/Wired/Personal/Asset Tracker inventory, IMEI tracking, SIM linkage, warehouse management
- **Installations**: 4-step workflow (Scheduled > In Progress > Testing > Completed), technician assignment
- **Technicians**: Field team management, installation stats, emirate coverage, specialty tracking

### CRM & Sales
- **Sales Pipeline**: Kanban board (7 stages: New > Contacted > Qualified > Proposal > Negotiation > Won > Lost)
- **Leads**: Full lead management with UTM tracking, priority scoring, assignment, DataTable with search/sort/export
- **Contacts**: Contact directory with DataTable, position, company, phone/email
- **Quotations**: Line-item quotations, auto UAE VAT (5%), status workflow, DataTable

### Operations (DataTable + DateRange)
- **Maintenance**: Work orders with date range filter, cost tracking, status workflow, DataTable
- **Trips**: Trip history with date range filter, distance/duration/speed analytics, DataTable
- **Geofences**: Create/manage geofence zones (circle/polygon) on UAE map, DataTable
- **Alert Rules**: Configure alert types, conditions, notification channels, DataTable

### Billing & Subscriptions
- **Plans**: Subscription plan management (monthly/annual pricing, vehicle limits, features)
- **Subscriptions**: Organization subscription tracking, DataTable
- **Invoices**: Invoice generation with AED currency, 5% VAT, date range filter, DataTable, PDF download
- **Contracts**: Service contract management with start/end dates, DataTable

### Support
- **Tickets**: Support ticket system with priority, status workflow, vehicle plate linking, DataTable
- **Notifications**: Bell icon with dropdown panel, unread count, mark-as-read, empty state

### AI Assistant (Powered by Mianx.ai)
- Fleet assistant chat panel with slide-out animation
- 6 quick action buttons (Fleet Overview, Open Alerts, Driver Ranking, etc.)
- 12+ intent categories with real DB data responses
- Conversation history with load/delete

### Admin & Settings
- **User Management**: User CRUD with role assignment, DataTable
- **Settings**: Platform configuration (company info, branding, defaults)
- **Audit Logs**: Full audit trail with DataTable, user, action, entity, IP tracking
- **Reports & Analytics**: Fleet analytics with charts, DataTable
- **Super Admin**: Platform dashboard, organization management, onboarding wizard, white-label branding, usage analytics, DataTable

### Advanced Analytics
- **Fleet Health**: Vehicle health scoring (0-100, grades A-D), risk classification
- **Driver Trends**: Behavior analytics, risk trends, violation leaderboard
- **Maintenance AI**: Frequency + mileage prediction, urgency classification
- **Revenue Forecast**: 12-month historical, linear regression, confidence bands

### PWA & Real-Time
- **PWA**: Installable, offline-capable, service worker with API caching, 7-day dismissal
- **SSE Real-Time**: Vehicle positions (3s), fleet events (8-15s)
- **Mobile Bottom Nav**: 5 quick-access items, notification badge
- **Connection Status**: Offline/reconnecting indicator
- **Event Toasts**: Speed violations, geofence exits, harsh braking

### Exports
- CSV export with UTF-8 BOM (Arabic support) on 20 DataTable views via ExportButton
- Clipboard copy for quick data transfer
- PDF invoice generation with RTR 360 branding

---

## Design System

- **Primary Color**: Emerald-600 (`#059669`)
- **Sidebar**: Slate-900 dark theme
- **Background**: Light slate (#F8FAFC)
- **Font**: Inter (Google Fonts)
| **Icons**: Lucide React
- **Animations**: Framer Motion (page transitions, list animations), CSS count-up, pulse dots, card hover
- **Components**: shadcn/ui (40+ components) + v2 DataTable, ExportButton, DateRangeFilter, ErrorBoundary
- **Responsive**: Mobile-first with collapsible sidebar
- **Toasts**: Sonner for notifications

### v2 CSS Variables
```
--rtr-card-shadow: 0 1px 3px rgba(0,0,0,0.08)
--rtr-card-shadow-hover: 0 4px 12px rgba(0,0,0,0.12)
--rtr-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1)
```

---

## API Routes (57 Endpoints)

### Auth (3)
- `POST /api/auth/login` | `POST /api/auth/logout` | `GET /api/auth/me`

### Dashboard (2)
- `GET /api/dashboard/stats` | `GET /api/dashboard/alerts`

### Analytics (4)
- `GET /api/analytics/fleet-health` | `GET /api/analytics/driver-trends`
- `GET /api/analytics/maintenance-prediction` | `GET /api/analytics/revenue-forecast`

### CRM (8)
- `GET/POST /api/leads` | `GET/PATCH /api/leads/[id]`
- `GET/POST /api/contacts` | `GET/PATCH /api/contacts/[id]`
- `GET/POST /api/quotations` | `GET/PATCH /api/quotations/[id]`
- `GET/POST /api/activities` | `GET /api/pipeline`

### Fleet (12)
- `GET/POST /api/vehicles` | `GET/PATCH/DELETE /api/vehicles/[id]`
- `GET/POST /api/drivers` | `GET/PATCH/DELETE /api/drivers/[id]`
- `GET/POST /api/devices` | `GET/PATCH/DELETE /api/devices/[id]`
- `GET/POST /api/technicians` | `GET/PATCH/DELETE /api/technicians/[id]`
- `GET/POST /api/installations` | `GET/PATCH /api/installations/[id]`

### Operations (11)
- `GET/POST /api/maintenance` | `GET/PATCH/DELETE /api/maintenance/[id]`
- `GET/POST /api/tickets` | `GET/PATCH/DELETE /api/tickets/[id]`
- `GET/POST /api/trips` | `GET/PATCH /api/trips/[id]`
- `GET/POST /api/geofences` | `GET/PATCH/DELETE /api/geofences/[id]`
- `GET/POST /api/alert-rules` | `GET/PATCH/DELETE /api/alert-rules/[id]`

### Billing (7)
- `GET/POST /api/subscriptions` | `GET/PATCH /api/subscriptions/[id]`
- `GET/POST /api/invoices` | `GET/PATCH /api/invoices/[id]`
- `GET /api/invoices/[id]/pdf`
- `GET/POST /api/contracts` | `GET/PATCH /api/contracts/[id]`

### Admin & Platform (10)
- `GET/POST /api/users` | `GET/PATCH /api/users/[id]`
- `GET|PUT /api/settings`
- `GET /api/audit-logs` | `GET /api/notifications` | `GET /api/reports`
- `GET /api/admin/platform-stats`
- `GET|POST /api/admin/organizations`
- `GET|PATCH|DELETE /api/admin/organizations/[id]`
- `GET|PUT /api/admin/organizations/[id]/branding`
- `GET /api/admin/organizations/[id]/usage`

### Real-Time (2)
- `GET /api/realtime/vehicles` | `GET /api/realtime/events`

### AI (3)
- `POST /api/ai/chat` | `GET /api/ai/chat` | `GET/DELETE /api/ai/conversations/[id]`

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm / yarn / pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/creatorshubconfidential/rtr360.git
cd rtr360

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# Run database migrations
npx prisma db push
npx prisma generate

# Seed demo data
npx prisma db seed

# Start development server
npm run dev
```

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@rtr.ae | REDACTED_DEMO_PASSWORD |
| Ops Manager | ahmed.ops@rtr.ae | REDACTED_DEMO_PASSWORD |
| Sales Manager | fatima.sales@rtr.ae | REDACTED_DEMO_PASSWORD |
| Customer Admin | khalid@alfahim.ae | REDACTED_DEMO_PASSWORD |

---

## Development

```bash
npm run dev          # Development server
npm run build        # Production build
npm start            # Start production server
npx prisma studio    # Database GUI
npx vitest run       # Run 448+ tests
```

---

## Security

- **Distributed rate limiting**: L1 in-memory (fast) + L2 PostgreSQL (distributed)
- **RBAC**: 8 roles, 22 permissions, 448 test cases
- **Auth**: Session-based with Bearer token, bcryptjs password hashing
- **Tenant isolation**: All API endpoints filter by `organizationId`
- **Production guard**: `/api/setup/seed-demo` blocked in production middleware
- **SQL injection protection**: Prisma parameterized queries

---

## UAE Market Specifics

- **Currency**: AED (United Arab Emirates Dirham)
- **Timezone**: Asia/Dubai (UTC+4)
- **VAT**: 5% (Federal Tax Authority)
- **Emirates**: Dubai, Abu Dhabi, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, Fujairah
- **Plate Format**: DXB-A-12345 (Emirate Code-Letter-Number)
- **License Types**: Light Vehicle, Heavy Vehicle, Heavy Bus, Light Bus, Motorcycle, Temporary
- **Languages**: English (primary), Arabic (future)

---

## License

**Confidential** — Proprietary software of RTR. All rights reserved.

---

<div align="center">
  <p>Built with dedication for RTR | <strong>Powered by Mianx.ai</strong></p>
</div>