// ────────────────────────────────────────
// RTR 360 — Shared Constants
// Powered by Mianx.ai
// ────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  qualified: 'bg-purple-100 text-purple-700',
  demo: 'bg-cyan-100 text-cyan-700',
  proposal: 'bg-orange-100 text-orange-700',
  quotation: 'bg-orange-100 text-orange-700',
  negotiation: 'bg-amber-100 text-amber-700',
  won: 'bg-emerald-100 text-emerald-700',
  lost: 'bg-red-100 text-red-700',
  closed: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  maintenance: 'bg-amber-100 text-amber-700',
  decommissioned: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
  open: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-cyan-100 text-cyan-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-300',
  medium: 'bg-amber-400',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

export const EMIRATES = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'UAQ',
  'RAK',
  'Fujairah',
];

export const VEHICLE_TYPES = [
  'Sedan',
  'SUV',
  'Truck',
  'Van',
  'Bus',
  'Heavy Equipment',
];

export const LEAD_SOURCES = [
  'Website',
  'WhatsApp',
  'Referral',
  'Google Ads',
  'Meta',
  'Walk-in',
];

export const VALID_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'closed'];

export const PIPELINE_STAGES = [
  { id: 'new', label: 'New', color: 'border-t-blue-500' },
  { id: 'contacted', label: 'Contacted', color: 'border-t-yellow-500' },
  { id: 'qualified', label: 'Qualified', color: 'border-t-purple-500' },
  { id: 'proposal', label: 'Proposal', color: 'border-t-orange-500' },
  { id: 'negotiation', label: 'Negotiation', color: 'border-t-amber-500' },
  { id: 'won', label: 'Won', color: 'border-t-emerald-500' },
  { id: 'lost', label: 'Lost', color: 'border-t-red-500' },
];

export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'task', 'whatsapp', 'visit'];

export const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞',
  email: '✉️',
  meeting: '🤝',
  note: '📝',
  task: '✅',
  whatsapp: '💬',
  visit: '🏢',
};

// Standard quotation line items for fleet GPS
export const DEFAULT_QUOTATION_ITEMS = [
  { description: 'GPS Tracking Device', quantity: 1, unitPrice: 150 },
  { description: 'SIM Card (Annual)', quantity: 1, unitPrice: 120 },
  { description: 'Professional Installation', quantity: 1, unitPrice: 100 },
  { description: 'Monthly Monitoring Fee', quantity: 12, unitPrice: 50 },
];

export const QUOTATION_TERMS = 'This quotation is valid for 30 days from the date of issue. Payment terms: 50% advance, 50% upon installation completion. All prices are in AED and inclusive of applicable taxes as per UAE regulations. Warranty: 12 months on hardware from the date of installation.';
