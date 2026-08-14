'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  MapPin,
  Truck,
  Users,
  UserPlus,
  AlertTriangle,
  Ticket,
  Route,
  Gauge,
  Wrench,
  Cpu,
  CreditCard,
  FileText,
  Settings,
  LogOut,
  Bell,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  Activity,
  Shield,
  Building2,
  Phone,
  Mail,
  Globe,
  Menu,
  Kanban,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

// Phase 2 CRM Views
import PipelineView from '@/components/views/PipelineView';
import QuotationsView from '@/components/views/QuotationsView';
import ContactsView from '@/components/views/ContactsView';

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
}

interface DashboardStats {
  totalVehicles: number;
  activeVehicles: number;
  totalDrivers: number;
  totalLeads: number;
  openAlerts: number;
  openTickets: number;
  todayTrips: number;
  totalDistance: number;
}

interface Lead {
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
  createdAt: string;
}

interface Vehicle {
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

interface Alert {
  id: string;
  type: string;
  severity: string;
  vehiclePlate: string | null;
  message: string;
  createdAt: string;
}

type ViewType =
  | 'dashboard'
  | 'live-tracking'
  | 'vehicles'
  | 'drivers'
  | 'devices'
  | 'installations'
  | 'maintenance'
  | 'pipeline'
  | 'leads'
  | 'contacts'
  | 'quotations'
  | 'subscriptions'
  | 'invoices'
  | 'tickets'
  | 'settings'
  | 'audit-logs';

// ────────────────────────────────────────
// Constants
// ────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
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
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-300',
  medium: 'bg-amber-400',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

const EMIRATES = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'UAQ',
  'RAK',
  'Fujairah',
];

const VEHICLE_TYPES = [
  'Sedan',
  'SUV',
  'Truck',
  'Van',
  'Bus',
  'Heavy Equipment',
];

const LEAD_SOURCES = [
  'Website',
  'WhatsApp',
  'Referral',
  'Google Ads',
  'Meta',
  'Walk-in',
];

const NAV_SECTIONS = [
  {
    label: 'MAIN',
    items: [
      { id: 'dashboard' as ViewType, icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'live-tracking' as ViewType, icon: MapPin, label: 'Live Tracking', badge: 'Coming Soon' },
    ],
  },
  {
    label: 'FLEET',
    items: [
      { id: 'vehicles' as ViewType, icon: Truck, label: 'Vehicles' },
      { id: 'drivers' as ViewType, icon: Users, label: 'Drivers' },
      { id: 'devices' as ViewType, icon: Cpu, label: 'Devices' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { id: 'installations' as ViewType, icon: Wrench, label: 'Installations' },
      { id: 'maintenance' as ViewType, icon: Settings, label: 'Maintenance' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { id: 'pipeline' as ViewType, icon: Kanban, label: 'Pipeline' },
      { id: 'leads' as ViewType, icon: UserPlus, label: 'Leads' },
      { id: 'contacts' as ViewType, icon: Users, label: 'Contacts' },
      { id: 'quotations' as ViewType, icon: FileText, label: 'Quotations' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { id: 'subscriptions' as ViewType, icon: CreditCard, label: 'Subscriptions' },
      { id: 'invoices' as ViewType, icon: FileText, label: 'Invoices' },
    ],
  },
  {
    label: 'SUPPORT',
    items: [
      { id: 'tickets' as ViewType, icon: Ticket, label: 'Tickets' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'settings' as ViewType, icon: Settings, label: 'Settings' },
      { id: 'audit-logs' as ViewType, icon: Shield, label: 'Audit Logs' },
    ],
  },
];

const VALID_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'closed'];

// ────────────────────────────────────────
// Helper: Auth fetch
// ────────────────────────────────────────

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

// ────────────────────────────────────────
// LoginScreen
// ────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (user: UserSession, token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed');
        return;
      }
      localStorage.setItem('rtr_token', data.token);
      localStorage.setItem('rtr_user', JSON.stringify(data.user));
      onLogin(data.user, data.token);
      toast.success('Welcome back!');
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Decorative Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-emerald-500 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-emerald-600 blur-3xl" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">RTR 360</span>
          </div>
        </div>
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Fleet Technology<br />& Management<br />
            <span className="text-emerald-400">Platform</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md">
            Comprehensive fleet tracking, driver management, and operational analytics for the UAE market.
          </p>
          <div className="flex gap-8 pt-4">
            <div>
              <div className="text-3xl font-bold text-emerald-400">500+</div>
              <div className="text-slate-400 text-sm">Fleets Managed</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-400">10K+</div>
              <div className="text-slate-400 text-sm">Vehicles Tracked</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-400">7</div>
              <div className="text-slate-400 text-sm">Emirates Covered</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 text-slate-500 text-sm">
          © 2025 RTR 360. All rights reserved.
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[var(--rtr-bg)]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-8"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-slate-900">RTR 360</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-slate-900">Sign In</h2>
            <p className="text-slate-500 mt-2">Enter your credentials to access the dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@rtr.ae"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="text-center text-xs text-slate-400 pt-4">
            Powered by <span className="font-semibold text-slate-500">Mianx.ai</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Sidebar Content (shared between desktop & mobile)
// ────────────────────────────────────────

function SidebarNav({
  currentView,
  onNavigate,
  onClose,
}: {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white">RTR 360</span>
      </div>

      <Separator className="bg-slate-700/50" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-4 px-3 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose?.();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-400'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border-l-2 border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-700 text-slate-400 border-0">
                        {item.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-700/50">
        <p className="text-[11px] text-slate-500">
          Powered by <span className="font-medium text-slate-400">Mianx.ai</span>
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// DashboardView
// ────────────────────────────────────────

function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, leadsRes, alertsRes] = await Promise.all([
          authFetch('/api/dashboard/stats'),
          authFetch('/api/leads?limit=5'),
          authFetch('/api/dashboard/alerts?limit=5'),
        ]);
        const statsData = await statsRes.json();
        if (statsRes.ok) setStats(statsData);

        const leadsData = await leadsRes.json();
        if (leadsRes.ok) setLeads(leadsData.leads || []);

        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          setAlerts(alertsData.alerts || []);
        }
      } catch {
        // Silently fail for alerts — the endpoint may not exist
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const kpiCards = stats
    ? [
        { icon: Truck, label: 'Total Vehicles', value: stats.totalVehicles, change: '+12%', color: 'bg-emerald-100 text-emerald-600' },
        { icon: Activity, label: 'Active Vehicles', value: stats.activeVehicles, change: '+8%', color: 'bg-green-100 text-green-600' },
        { icon: Users, label: 'Total Drivers', value: stats.totalDrivers, change: '+5%', color: 'bg-teal-100 text-teal-600' },
        { icon: UserPlus, label: 'Open Leads', value: stats.totalLeads, change: '+23%', color: 'bg-amber-100 text-amber-600' },
        { icon: AlertTriangle, label: 'Open Alerts', value: stats.openAlerts, change: '-5%', color: 'bg-red-100 text-red-600' },
        { icon: Ticket, label: 'Open Tickets', value: stats.openTickets, change: '+2%', color: 'bg-orange-100 text-orange-600' },
        { icon: Route, label: "Today's Trips", value: stats.todayTrips, change: '+15%', color: 'bg-purple-100 text-purple-600' },
        { icon: Gauge, label: 'Total Distance (km)', value: stats.totalDistance.toLocaleString(), change: '+9%', color: 'bg-cyan-100 text-cyan-600' },
      ]
    : [];

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="rounded-xl border-slate-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                      {kpi.change}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Leads & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">Recent Leads</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <UserPlus className="w-8 h-8 mb-2" />
                <p className="text-sm">No leads yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Company</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Priority</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium text-sm">{lead.name}</TableCell>
                        <TableCell className="text-sm text-slate-600">{lead.company || '—'}</TableCell>
                        <TableCell>
                          <Badge className={`text-[11px] ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                            {lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[lead.priority] || 'bg-slate-300'}`} />
                            <span className="text-xs text-slate-600 capitalize">{lead.priority}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <AlertTriangle className="w-8 h-8 mb-2" />
                <p className="text-sm">No recent alerts</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto custom-scrollbar">
                {alerts.map((alert) => {
                  const severityColor =
                    alert.severity === 'high'
                      ? 'text-red-500 bg-red-50'
                      : alert.severity === 'medium'
                        ? 'text-amber-500 bg-amber-50'
                        : 'text-slate-500 bg-slate-50';
                  return (
                    <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${severityColor}`}>
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 truncate">{alert.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {alert.vehiclePlate && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {alert.vehiclePlate}
                            </Badge>
                          )}
                          <span className="text-[11px] text-slate-400">{timeAgo(alert.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// LeadsView
// ────────────────────────────────────────

function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pipeline counts
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({});

  // Create form
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    emirate: '',
    vehicleCount: '',
    vehicleType: '',
    requirement: '',
    source: '',
    priority: 'medium',
  });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);

      const res = await authFetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLeads(data.leads || []);
        setTotalPages(data.pagination?.totalPages || 1);

        // Calculate pipeline counts
        const counts: Record<string, number> = {};
        (data.leads || []).forEach((l: Lead) => {
          counts[l.status] = (counts[l.status] || 0) + 1;
        });
        setPipelineCounts(counts);
      }
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Lead name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          vehicleCount: form.vehicleCount ? parseInt(form.vehicleCount) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create lead');
        return;
      }
      toast.success('Lead created successfully');
      setCreateOpen(false);
      setForm({ name: '', email: '', phone: '', company: '', emirate: '', vehicleCount: '', vehicleType: '', requirement: '', source: '', priority: 'medium' });
      fetchLeads();
    } catch {
      toast.error('Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (leadId: string, newStatus: string) => {
    try {
      const res = await authFetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to update status');
        return;
      }
      toast.success(`Lead moved to ${newStatus}`);
      fetchLeads();
    } catch {
      toast.error('Failed to update lead status');
    }
  };

  const pipelineStatuses = ['new', 'contacted', 'qualified', 'demo', 'quotation', 'won', 'lost'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Leads</h2>
          <p className="text-sm text-slate-500">Manage your sales pipeline</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Plus className="w-4 h-4" /> New Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
            <DialogHeader>
              <DialogTitle>Create New Lead</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 xx xxx xxxx" />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Emirate</Label>
                  <Select value={form.emirate} onValueChange={(v) => setForm({ ...form, emirate: v })}>
                    <SelectTrigger><SelectValue placeholder="Select emirate" /></SelectTrigger>
                    <SelectContent>{EMIRATES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Count</Label>
                  <Input type="number" value={form.vehicleCount} onChange={(e) => setForm({ ...form, vehicleCount: e.target.value })} placeholder="e.g. 10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vehicle Type</Label>
                  <Select value={form.vehicleType} onValueChange={(v) => setForm({ ...form, vehicleType: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Requirement</Label>
                <Textarea value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} placeholder="Describe the requirement..." rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Lead'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Summary */}
      <div className="flex flex-wrap gap-2">
        {pipelineStatuses.map((s) => (
          <Badge key={s} variant="outline" className={`text-xs px-2.5 py-1 ${STATUS_COLORS[s] || ''} border-0`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}: {pipelineCounts[s] || 0}
          </Badge>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {VALID_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <UserPlus className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No leads found</p>
            <p className="text-xs mt-1">Create a new lead or adjust your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Company</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden md:table-cell">Phone</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden lg:table-cell">Emirate</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden sm:table-cell">Source</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Priority</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-sm">{lead.name}</TableCell>
                      <TableCell className="text-sm text-slate-600">{lead.company || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600 hidden md:table-cell">{lead.phone || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600 hidden lg:table-cell">{lead.emirate || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {lead.source ? (
                          <Badge variant="secondary" className="text-[11px] bg-slate-100 text-slate-600 border-0">{lead.source}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[11px] ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[lead.priority] || 'bg-slate-300'}`} />
                          <span className="text-xs text-slate-600 capitalize">{lead.priority}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 hidden lg:table-cell">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Select onValueChange={(v) => handleStatusUpdate(lead.id, v)}>
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue placeholder="Move to..." />
                          </SelectTrigger>
                          <SelectContent>
                            {VALID_LEAD_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ────────────────────────────────────────
// VehiclesView
// ────────────────────────────────────────

function VehiclesView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    vehicleType: '',
    vin: '',
    color: '',
  });

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await authFetch(`/api/vehicles?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setVehicles(data.vehicles || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch {
      toast.error('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleCreate = async () => {
    if (!form.plateNumber.trim()) {
      toast.error('Plate number is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          year: form.year ? parseInt(form.year) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to add vehicle');
        return;
      }
      toast.success('Vehicle added successfully');
      setCreateOpen(false);
      setForm({ plateNumber: '', make: '', model: '', year: '', vehicleType: '', vin: '', color: '' });
      fetchVehicles();
    } catch {
      toast.error('Failed to add vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  const VEHICLE_STATUSES = ['active', 'inactive', 'maintenance', 'decommissioned'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Vehicles</h2>
            <p className="text-sm text-slate-500">Manage your fleet</p>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-sm px-2.5">
            {total}
          </Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Add Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Vehicle</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Plate Number *</Label>
                <Input value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} placeholder="e.g. DXB A 12345" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Make</Label>
                  <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="e.g. Toyota" />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="e.g. Hilux" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="2024" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.vehicleType} onValueChange={(v) => setForm({ ...form, vehicleType: v })}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="White" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>VIN</Label>
                <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} placeholder="Vehicle Identification Number" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Vehicle'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by plate, make, or model..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Vehicle Cards (Mobile) / Table (Desktop) */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <Card className="rounded-xl border-slate-200/60">
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Truck className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No vehicles found</p>
            <p className="text-xs mt-1">Add a vehicle or adjust your filters</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
            {vehicles.map((v) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="rounded-xl border-slate-200/60 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="text-lg font-bold text-slate-900">{v.plateNumber}</div>
                      <Badge className={`text-[11px] ${STATUS_COLORS[v.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                        {v.status}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {[v.make, v.model, v.year].filter(Boolean).join(' ') || 'No details'}
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                      {v.driver && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>{v.driver.name}</span>
                        </div>
                      )}
                      {v.device && (
                        <div className="flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>IMEI: {v.device.imei}</span>
                        </div>
                      )}
                      {v.mileage != null && (
                        <div className="flex items-center gap-1.5">
                          <Gauge className="w-3.5 h-3.5" />
                          <span>{v.mileage.toLocaleString()} km</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Desktop Table */}
          <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Plate Number</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Make / Model / Year</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Driver</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Device IMEI</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Mileage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-bold text-sm">{v.plateNumber}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {[v.make, v.model, v.year].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[11px] ${STATUS_COLORS[v.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{v.driver?.name || '—'}</TableCell>
                    <TableCell className="text-sm text-slate-600 font-mono text-xs">{v.device?.imei || '—'}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {v.mileage != null ? `${v.mileage.toLocaleString()} km` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// Placeholder View for unimplemented pages
// ────────────────────────────────────────

function PlaceholderView({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-slate-400"
    >
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-300" />
      </div>
      <h3 className="text-lg font-semibold text-slate-600">{title}</h3>
      <p className="text-sm mt-1">This module is under development</p>
    </motion.div>
  );
}

// ────────────────────────────────────────
// AdminDashboard
// ────────────────────────────────────────

function AdminDashboard({ user, onLogout }: { user: UserSession; onLogout: () => void }) {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const viewTitle: Record<ViewType, string> = {
    dashboard: 'Dashboard',
    'live-tracking': 'Live Tracking',
    vehicles: 'Vehicles',
    drivers: 'Drivers',
    devices: 'Devices',
    installations: 'Installations',
    maintenance: 'Maintenance',
    pipeline: 'Sales Pipeline',
    leads: 'Leads',
    contacts: 'Contacts',
    quotations: 'Quotations',
    subscriptions: 'Subscriptions',
    invoices: 'Invoices',
    tickets: 'Tickets',
    settings: 'Settings',
    'audit-logs': 'Audit Logs',
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'pipeline':
        return <PipelineView />;
      case 'leads':
        return <LeadsView />;
      case 'contacts':
        return <ContactsView />;
      case 'quotations':
        return <QuotationsView />;
      case 'vehicles':
        return <VehiclesView />;
      case 'live-tracking':
        return <PlaceholderView title="Live Tracking" icon={MapPin} />;
      case 'drivers':
        return <PlaceholderView title="Drivers" icon={Users} />;
      case 'devices':
        return <PlaceholderView title="Devices" icon={Cpu} />;
      case 'installations':
        return <PlaceholderView title="Installations" icon={Wrench} />;
      case 'maintenance':
        return <PlaceholderView title="Maintenance" icon={Settings} />;
      case 'subscriptions':
        return <PlaceholderView title="Subscriptions" icon={CreditCard} />;
      case 'invoices':
        return <PlaceholderView title="Invoices" icon={FileText} />;
      case 'tickets':
        return <PlaceholderView title="Tickets" icon={Ticket} />;
      case 'settings':
        return <PlaceholderView title="Settings" icon={Settings} />;
      case 'audit-logs':
        return <PlaceholderView title="Audit Logs" icon={Shield} />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--rtr-bg)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-slate-900 text-white shrink-0">
        <SidebarNav currentView={currentView} onNavigate={setCurrentView} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-slate-900 text-white border-slate-700">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SidebarNav currentView={currentView} onNavigate={setCurrentView} onClose={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">{viewTitle[currentView]}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Notifications">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                3
              </span>
            </button>

            {/* User Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                      {user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
                    {user.name}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-red-600 focus:text-red-600">
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Main Page Component
// ────────────────────────────────────────

export default function Home() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('rtr_token');
        if (!token) {
          return;
        }
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Invalid token');
        const data = await res.json();
        setUser(data.user);
      } catch {
        localStorage.removeItem('rtr_token');
        localStorage.removeItem('rtr_user');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogin = (loggedInUser: UserSession, _token: string) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    const token = localStorage.getItem('rtr_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('rtr_token');
    localStorage.removeItem('rtr_user');
    setUser(null);
    toast.info('You have been logged out');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--rtr-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <AdminDashboard user={user} onLogout={handleLogout} />;
}
