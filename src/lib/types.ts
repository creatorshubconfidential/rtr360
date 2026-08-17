// ────────────────────────────────────────
// RTR 360 — Shared Types
// Powered by Mianx.ai
// ────────────────────────────────────────

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
}

export interface DashboardStats {
  totalVehicles: number;
  activeVehicles: number;
  totalDrivers: number;
  totalLeads: number;
  openAlerts: number;
  openTickets: number;
  todayTrips: number;
  totalDistance: number;
  totalDevices: number;
  pendingInstallations: number;
  activeTechnicians: number;
}

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  emirate: string | null;
  vehicleCount: number | null;
  vehicleType: string | null;
  source: string | null;
  status: string;
  priority: string;
  notes: string | null;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo?: { id: string; name: string; email?: string } | null;
  quotations?: Quotation[];
  _count?: { activities: number };
}

export interface LeadDetail extends Lead {
  activities?: Activity[];
  organization?: { id: string; name: string };
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicleType: string | null;
  vin: string | null;
  color: string | null;
  status: string;
  mileage: number | null;
  driver: { id: string; name: string; phone: string | null } | null;
  device: { id: string; imei: string; status: string } | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  organizationId: string;
  createdAt: string;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  leadId: string | null;
  organizationId: string;
  items: QuotationItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  status: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: { id: string; name: string; company: string | null } | null;
  organization?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    emirate: string | null;
  } | null;
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  sortOrder: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

/** Input type for creating/editing quotation items (before server assigns id/quotationId) */
export interface QuotationItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Activity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
  leadId: string | null;
  opportunityId: string | null;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

export interface Alert {
  id: string;
  type: string;
  severity: string;
  vehiclePlate: string | null;
  message: string;
  createdAt: string;
}

export interface PipelineSummary {
  total: number;
  byStage: Record<string, number>;
  totalValue: number;
  wonThisMonth: number;
}

export type ViewType =
  | 'dashboard'
  | 'analytics'
  | 'live-tracking'
  | 'vehicles'
  | 'drivers'
  | 'devices'
  | 'installations'
  | 'maintenance'
  | 'technicians'
  | 'pipeline'
  | 'leads'
  | 'contacts'
  | 'quotations'
  | 'contracts'
  | 'subscriptions'
  | 'invoices'
  | 'tickets'
  | 'reports'
  | 'alert-rules'
  | 'geofences'
  | 'trips'
  | 'users'
  | 'contracts'
  | 'notifications'
  | 'settings'
  | 'audit-logs'
  | 'ai-assistant'
  | 'super-admin';
