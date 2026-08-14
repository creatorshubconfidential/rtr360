# RTR 360 — Fleet Technology & Management Platform

> **Powered by Mianx.ai** | Multi-tenant SaaS for UAE Fleet & GPS Tracking Companies

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma" alt="Prisma 6" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/License-Confidential-red" alt="Confidential" />
</div>

---

## 🏢 About RTR 360

RTR 360 is a comprehensive **Fleet Technology & Management SaaS Platform** built for RTR — a UAE-based GPS and fleet tracking company. The platform transforms RTR's service-based business into a complete SaaS product covering every aspect of fleet management, GPS tracking, CRM, billing, and AI-powered analytics.

The platform serves the **UAE market** with support for AED currency, Dubai timezone (Asia/Dubai), all 7 emirates, and UAE vehicle plate formats (e.g., DXB-A-12345).

---

## 📊 Current Status

| Phase | Module | Status |
|-------|--------|--------|
| Phase 1 | Foundation (Auth, DB, Dashboard, Seed Data) | ✅ Complete |
| Phase 2 | CRM & Sales (Pipeline, Leads, Quotations, Contacts) | ✅ Complete |
| Phase 3 | Operations (Drivers, Devices, Installations, Technicians) | ✅ Complete |
| Phase 4 | FleetOS (Live GPS Map, Vehicle Tracking) | ✅ Complete |
| Phase 5 | Maintenance, Billing, Support, Settings | ✅ Complete |
| Phase 6 | AI Intelligence & Platform Polish | ✅ Complete |
| Phase 7 | Advanced Analytics & Predictive Intelligence | ✅ Complete |
| Phase 8 | Mobile-First PWA & Real-Time WebSocket | 🔲 Upcoming |
| Phase 9 | Multi-Org Super Admin & White-Label | 🔲 Upcoming |
| Phase 10 | API Gateway, Webhooks & Integrations | 🔲 Upcoming |

---

## 🏗️ Architecture

### MIANX.AI 14-Agent Architecture

Built using the MIANX.AI multi-agent system with **KEEP / IMPROVE / INTEGRATE / REPLACE / BUILD** philosophy:

- **KEEP** — Existing business logic preserved and enhanced
- **IMPROVE** — UX/UI polished with professional design system
- **INTEGRATE** — All modules connected through shared types, auth, tenant isolation
- **REPLACE** — Manual processes replaced with automated workflows
- **BUILD** — New capabilities (AI, real-time tracking, predictive analytics)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, Framer Motion |
| **UI Library** | shadcn/ui (Radix UI), Lucide Icons |
| **Backend** | Next.js API Routes (App Router) |
| **Database** | PostgreSQL (production) / SQLite (development) |
| **ORM** | Prisma 6 |
| **Auth** | Session-based with Bearer token (bcryptjs) |
| **Maps** | Leaflet + React-Leaflet + OpenStreetMap |
| **State** | React hooks + Zustand (available) |
| **Forms** | React Hook Form + Zod (available) |
| **Charts** | Recharts (available) |
| **AI** | Pattern-matching fleet assistant (Powered by Mianx.ai) |

### Multi-Tenant Design

- **Organization-based isolation**: Every entity has `organizationId` with `onDelete: Cascade`
- **Role-based access**: `super_admin`, `platform_admin`, `operations_manager`, `sales_manager`, `fleet_manager`, `dispatcher`, `viewer`, `org_owner`
- **Session auth**: DB-backed sessions with Bearer token verification
- **API-level tenant filtering**: All endpoints filter by user's organization

---

## 📁 Project Structure

```
rtr360/
├── prisma/
│   └── schema.prisma          # 28 models, complete relational schema
├── src/
│   ├── app/
│   │   ├── api/               # 46 API routes
│   │   │   ├── auth/          # login, logout, me
│   │   │   ├── vehicles/      # fleet management
│   │   │   ├── drivers/       # driver management
│   │   │   ├── devices/       # GPS device inventory
│   │   │   ├── installations/ # device installation workflow
│   │   │   ├── technicians/   # field technician management
│   │   │   ├── leads/         # CRM lead tracking
│   │   │   ├── contacts/      # contact directory
│   │   │   ├── quotations/    # quotation management with UAE VAT
│   │   │   ├── pipeline/      # sales pipeline analytics
│   │   │   ├── maintenance/   # work orders & maintenance
│   │   │   ├── tickets/       # support ticketing
│   │   │   ├── subscriptions/ # billing subscriptions
│   │   │   ├── invoices/      # invoicing + PDF generation
│   │   │   ├── contracts/     # contract management
│   │   │   ├── trips/         # trip tracking & analytics
│   │   │   ├── geofences/     # geofence management
│   │   │   ├── alert-rules/   # alert rule configuration
│   │   │   ├── reports/       # analytics & reporting
│   │   │   ├── users/         # user management
│   │   │   ├── settings/      # platform settings
│   │   │   ├── audit-logs/    # audit trail
│   │   │   ├── notifications/ # notification system
│   │   │   └── ai/            # AI fleet assistant
│   │   ├── globals.css        # RTR brand CSS variables
│   │   ├── layout.tsx         # root layout with Toaster
│   │   └── page.tsx           # Single-page app (SPA) entry
│   ├── components/
│   │   ├── ui/                # 40+ shadcn/ui components
│   │   ├── views/             # 21 view components
│   │   │   ├── PipelineView.tsx
│   │   │   ├── QuotationsView.tsx
│   │   │   ├── ContactsView.tsx
│   │   │   ├── LiveTrackingView.tsx
│   │   │   ├── DriversView.tsx
│   │   │   ├── DevicesView.tsx
│   │   │   ├── InstallationsView.tsx
│   │   │   ├── TechniciansView.tsx
│   │   │   ├── MaintenanceView.tsx
│   │   │   ├── SubscriptionsView.tsx
│   │   │   ├── InvoicesView.tsx
│   │   │   ├── TicketsView.tsx
│   │   │   ├── ReportsView.tsx
│   │   │   ├── TripsView.tsx
│   │   │   ├── ContractsView.tsx
│   │   │   ├── GeofencesView.tsx
│   │   │   ├── AlertRulesView.tsx
│   │   │   ├── NotificationsView.tsx
│   │   │   ├── UsersView.tsx
│   │   │   ├── SettingsView.tsx
│   │   │   └── AuditLogsView.tsx
│   │   └── AIChatPanel.tsx    # AI assistant overlay
│   ├── lib/
│   │   ├── auth.ts            # password hashing, session management
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── types.ts           # TypeScript interfaces
│   │   ├── constants.ts       # UAE-specific constants
│   │   ├── api.ts             # authFetch, formatAED, formatDate
│   │   ├── export.ts          # CSV export utility
│   │   ├── utils.ts           # cn() helper
│   │   └── seed.ts            # demo data (3 orgs, 4 users, 5 vehicles, etc.)
│   └── types/
│       └── leaflet.d.ts       # Leaflet type declarations
├── package.json
├── next.config.ts             # standalone output, ignore TS errors
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🗄️ Database Schema (28 Models)

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

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or Bun
- npm/yarn/pnpm

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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Prisma database connection string | `file:./db/custom.db` |

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@rtr.ae | REDACTED_DEMO_PASSWORD |
| Sales Manager | omar@alfahim.ae | REDACTED_DEMO_PASSWORD |
| Fleet Manager | ahmed@alfahim.ae | REDACTED_DEMO_PASSWORD |
| Dispatcher | sara@alfahim.ae | REDACTED_DEMO_PASSWORD |

---

## 📱 Features (22 Modules)

### 📊 Dashboard
- Real-time KPI cards (vehicles, drivers, leads, alerts, trips)
- Organization overview with quick action shortcuts

### 🗺️ Live Tracking (FleetOS)
- Interactive Leaflet map centered on UAE
- Real-time vehicle position simulation (3-second updates)
- Custom vehicle markers (blue=moving, purple=idle)
- Click-to-popup with plate, speed, driver, IMEI
- Vehicle sidebar with live status indicators
- Status filters: All, Moving, Idle, Active

### 🚛 Fleet Management
- **Vehicles**: Full CRUD, UAE plate format, make/model/year, driver/device assignment, status management
- **Drivers**: UAE license types (Light/Heavy/Temporary), nationality, emergency contacts, driving score
- **Devices**: GPS/OBD/Wired/Personal/Asset Tracker inventory, IMEI tracking, SIM linkage, purchase costs, warehouse management
- **Installations**: 4-step workflow (Scheduled → In Progress → Testing → Completed), auto device-vehicle linking, technician assignment, installation checklist
- **Technicians**: Field team management, installation stats, emirate coverage, specialty tracking

### 📈 CRM & Sales
- **Sales Pipeline**: Kanban board (7 stages: New → Contacted → Qualified → Proposal → Negotiation → Won → Lost)
- **Leads**: Full lead management with UTM tracking, priority scoring, assignment
- **Contacts**: Contact directory with position, company, phone/email
- **Quotations**: Line-item quotations, auto UAE VAT (5%), quotation number generation, status workflow (Draft → Sent → Accepted → Rejected)

### 🔧 Operations
- **Maintenance & Work Orders**: Scheduled/preventive/reactive maintenance, vehicle-linked, cost tracking, status workflow
- **Trips**: Trip history with distance, duration, speed analytics, harsh driving events
- **Geofences**: Create/manage geofence zones (circle/polygon) on UAE map
- **Alert Rules**: Configure alert types, conditions, notification channels

### 💰 Billing & Subscriptions
- **Plans**: Subscription plan management (monthly/annual pricing, vehicle limits, features)
- **Subscriptions**: Organization subscription tracking, vehicle count, billing cycle
- **Invoices**: Invoice generation with AED currency, 5% VAT, PDF download with UAE bank details
- **Contracts**: Service contract management with start/end dates, terms

### 🎫 Support
- **Tickets**: Support ticket system with priority (low/medium/high/urgent), status workflow, vehicle plate linking
- **Notifications**: Real-time notification bell with unread count, click-to-navigate

### 🤖 AI Assistant (Powered by Mianx.ai)
- Fleet assistant chat panel with slide-out animation
- 6 quick action buttons (Fleet Overview, Open Alerts, Driver Ranking, etc.)
- 12+ intent categories with real DB data responses
- Conversation history with load/delete
- Markdown-like content rendering

### 🛡️ Admin & Settings
- **User Management**: User CRUD with role assignment, status management
- **Settings**: Platform configuration (company info, branding, defaults)
- **Audit Logs**: Full audit trail with user, action, entity, IP tracking
- **Reports & Analytics**: Fleet analytics with charts, KPI summaries

### 📤 Exports
- CSV export with UTF-8 BOM (Arabic support) on 8 table views
- PDF invoice generation with RTR 360 branding

---

## 🎨 Design System

- **Primary Color**: Emerald-600 (`#059669`)
- **Sidebar**: Slate-900 dark theme
- **Background**: Light slate (#F8FAFC)
- **Font**: Inter (Google Fonts)
- **Icons**: Lucide React
- **Animations**: Framer Motion (page transitions, list animations)
- **Components**: shadcn/ui (40+ components)
- **Responsive**: Mobile-first with collapsible sidebar

---

## 📋 API Routes (46 Endpoints)

### Auth (3)
- `POST /api/auth/login` — Login with email/password
- `POST /api/auth/logout` — Invalidate session
- `GET /api/auth/me` — Get current user

### CRM (8)
- `GET/POST /api/leads` — List/Create leads
- `GET/PATCH /api/leads/[id]` — Detail/Update lead
- `GET/POST /api/contacts` — List/Create contacts
- `GET/POST /api/quotations` — List/Create quotations
- `GET/PATCH /api/quotations/[id]` — Detail/Update quotation
- `GET/POST /api/activities` — List/Create activities
- `GET /api/pipeline` — Sales pipeline summary

### Fleet (12)
- `GET/POST /api/vehicles` — List/Create vehicles
- `GET/POST /api/drivers` — List/Create drivers
- `GET/PATCH/DELETE /api/drivers/[id]` — Update/Delete driver
- `GET/POST /api/devices` — List/Create devices
- `GET/PATCH/DELETE /api/devices/[id]` — Update/Delete device
- `GET/POST /api/technicians` — List/Create technicians
- `GET/PATCH/DELETE /api/technicians/[id]` — Update/Delete technician
- `GET/POST /api/installations` — List/Schedule installations
- `GET/PATCH /api/installations/[id]` — Update installation status

### Operations (8)
- `GET/POST /api/maintenance` — List/Create work orders
- `GET/PATCH/DELETE /api/maintenance/[id]` — Update/Delete work order
- `GET/POST /api/tickets` — List/Create tickets
- `GET/PATCH/DELETE /api/tickets/[id]` — Update/Delete ticket
- `GET/POST /api/trips` — List/Create trips
- `GET/PATCH /api/trips/[id]` — Update trip
- `GET/POST /api/geofences` — List/Create geofences
- `GET/PATCH/DELETE /api/geofences/[id]` — Update/Delete geofence
- `GET/POST /api/alert-rules` — List/Create alert rules
- `GET/PATCH/DELETE /api/alert-rules/[id]` — Update/Delete alert rule

### Billing (6)
- `GET/POST /api/subscriptions` — List/Create subscriptions
- `GET/PATCH /api/subscriptions/[id]` — Detail/Update subscription
- `GET/POST /api/invoices` — List/Create invoices
- `GET/PATCH /api/invoices/[id]` — Detail/Update invoice
- `GET /api/invoices/[id]/pdf` — Download PDF invoice
- `GET/POST /api/contracts` — List/Create contracts
- `GET/PATCH /api/contracts/[id]` — Detail/Update contract

### Admin (9)
- `GET /api/dashboard/stats` — Dashboard KPIs
- `GET /api/analytics/fleet-health` — Fleet health scoring (0-100, grades A-D)
- `GET /api/analytics/driver-trends` — Driver behavior analytics
- `GET /api/analytics/maintenance-prediction` — Predictive maintenance
- `GET /api/analytics/revenue-forecast` — Revenue forecasting
- `GET/POST /api/users` — List/Create users
- `GET/PATCH /api/users/[id]` — Update user
- `GET/PUT /api/settings` — Get/Update settings
- `GET /api/audit-logs` — Audit trail
- `GET /api/notifications` — Notification list
- `GET /api/reports` — Analytics data

### AI (3)
- `POST /api/ai/chat` — Send message to AI assistant
- `GET /api/ai/chat` — List conversations
- `GET/DELETE /api/ai/conversations/[id]` — Load/Delete conversation

---

## 🧪 Development

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Database studio (GUI)
npx prisma studio

# Reset database (dev only)
npx prisma db push --force-reset
npx prisma db seed
```

---

## 📍 UAE Market Specifics

- **Currency**: AED (United Arab Emirates Dirham)
- **Timezone**: Asia/Dubai (UTC+4)
- **VAT**: 5% (Federal Tax Authority)
- **Emirates**: Dubai, Abu Dhabi, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, Fujairah
- **Plate Format**: DXB-A-12345 (Emirate Code-Letter-Number)
- **License Types**: Light Vehicle, Heavy Vehicle, Heavy Bus, Light Bus, Motorcycle, Temporary
- **Languages**: English (primary), Arabic (future)

---

## 📜 License

**Confidential** — Proprietary software of RTR. All rights reserved.

---

<div align="center">
  <p>Built with ❤️ for RTR | <strong>Powered by Mianx.ai</strong></p>
</div>
