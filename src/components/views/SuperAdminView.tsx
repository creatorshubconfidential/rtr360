'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Users,
  Truck,
  Cpu,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Trash2,
  Palette,
  BarChart3,
  Shield,
  Globe,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Activity,
  FileText,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Crown,
  Database,
  UserCog,
  X,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

interface OrgSummary {
  id: string;
  name: string;
  tradeName: string | null;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  emirate: string | null;
  city: string | null;
  status: string;
  currency: string;
  planName: string | null;
  vehicleLimit: number;
  userLimit: number;
  whiteLabelEnabled: boolean;
  brandedAppName: string | null;
  primaryColor: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  createdAt: string;
  _count: {
    users: number;
    vehicles: number;
    devices: number;
    drivers: number;
    branches: number;
    invoices: number;
    tickets: number;
    leads: number;
    subscriptions: number;
    technicians: number;
  };
}

interface PlatformSummary {
  totalOrgs: number;
  activeOrgs: number;
  inactiveOrgs: number;
  totalUsers: number;
  totalVehicles: number;
  totalDevices: number;
  totalDrivers: number;
  totalTrips: number;
  totalLeads: number;
  openTickets: number;
  activeSubscriptions: number;
  totalInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
  totalRevenue: number;
  outstandingRevenue: number;
  whiteLabelOrgs: number;
}

interface OrgDetail extends OrgSummary {
  invoiceStats: { totalAmount: number; totalInvoices: number; paidAmount: number; overdueAmount: number };
  subscription: any;
  vehicleUtilization: number;
  userUtilization: number;
  branches: { id: string; name: string; emirate: string | null; address: string | null; phone: string | null }[];
  users: { id: string; name: string; email: string; role: string; status: string; lastLoginAt: string | null; createdAt: string }[];
}

// ────────────────────────────────────────
// Helper
// ────────────────────────────────────────


function formatAED(amount: number) {
  return `AED ${(amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ────────────────────────────────────────
// Main Component
// ────────────────────────────────────────

export default function SuperAdminView() {
  const [activeTab, setActiveTab] = useState<'overview' | 'organizations' | 'onboard'>('overview');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Crown className="w-6 h-6 text-emerald-600" />
            Super Admin
          </h2>
          <p className="text-sm text-slate-500">Platform management & organization control</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="organizations" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Organizations</TabsTrigger>
          <TabsTrigger value="onboard" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Onboard New</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <PlatformOverview />
        </TabsContent>
        <TabsContent value="organizations" className="mt-5">
          <OrganizationsTable />
        </TabsContent>
        <TabsContent value="onboard" className="mt-5">
          <OnboardOrg />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────────────────────────────
// Platform Overview Tab
// ────────────────────────────────────────

function PlatformOverview() {
  const [stats, setStats] = useState<PlatformSummary | null>(null);
  const [orgList, setOrgList] = useState<OrgSummary[]>([]);
  const [monthlyGrowth, setMonthlyGrowth] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/admin/platform-stats')
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setStats(data.summary);
        if (data.organizations) setOrgList(data.organizations);
        if (data.monthlyGrowth) setMonthlyGrowth(data.monthlyGrowth);
      })
      .catch(() => toast.error('Failed to load platform stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!stats) return <div className="text-center py-12 text-slate-500">Failed to load stats</div>;

  const kpis = [
    { icon: Building2, label: 'Total Orgs', value: stats.totalOrgs, sub: `${stats.activeOrgs} active`, color: 'bg-emerald-100 text-emerald-600' },
    { icon: Users, label: 'Total Users', value: stats.totalUsers, sub: 'Across all orgs', color: 'bg-blue-100 text-blue-600' },
    { icon: Truck, label: 'Total Vehicles', value: stats.totalVehicles, sub: 'GPS tracked', color: 'bg-violet-100 text-violet-600' },
    { icon: Cpu, label: 'Total Devices', value: stats.totalDevices, sub: 'GPS units', color: 'bg-cyan-100 text-cyan-600' },
    { icon: CreditCard, label: 'Total Revenue', value: formatAED(stats.totalRevenue), sub: 'All invoices', color: 'bg-amber-100 text-amber-600' },
    { icon: FileText, label: 'Total Invoices', value: stats.totalInvoices, sub: `${stats.paidInvoices} paid`, color: 'bg-pink-100 text-pink-600' },
    { icon: AlertTriangle, label: 'Overdue', value: stats.overdueInvoices, sub: formatAED(stats.outstandingRevenue), color: 'bg-red-100 text-red-600' },
    { icon: Palette, label: 'White-Label', value: stats.whiteLabelOrgs, sub: 'Custom branded', color: 'bg-purple-100 text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="rounded-xl border-slate-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{kpi.sub}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Org Growth Chart (text-based) */}
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Organization Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyGrowth.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No growth data yet</div>
            ) : (
              <div className="space-y-3">
                {monthlyGrowth.map((m: any, i: number) => {
                  const maxCum = Math.max(...monthlyGrowth.map((x: any) => x.cumulative), 1);
                  const barWidth = Math.round((m.cumulative / maxCum) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-14 shrink-0">{m.month}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden relative">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-md"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-700">
                          {m.cumulative} ({m.count > 0 ? `+${m.count}` : '0'})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Organizations */}
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Top Organizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orgList.slice(0, 6).map((org, i) => (
                <div key={org.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{org.tradeName || org.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {org._count.vehicles} vehicles · {org._count.users} users · {org.emirate || 'UAE'}
                    </div>
                  </div>
                  <Badge className={`text-[10px] border-0 ${org.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {org.status}
                  </Badge>
                </div>
              ))}
              {orgList.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">No organizations yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Organizations Table Tab
// ────────────────────────────────────────

function OrganizationsTable() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Detail dialog
  const [detailOrg, setDetailOrg] = useState<OrgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Edit dialog
  const [editOrg, setEditOrg] = useState<OrgSummary | null>(null);
  const [editForm, setEditForm] = useState({ planName: '', vehicleLimit: '', userLimit: '', status: '' });
  const [saving, setSaving] = useState(false);

  // Branding dialog
  const [brandOrg, setBrandOrg] = useState<any>(null);
  const [brandForm, setBrandForm] = useState({
    primaryColor: '', accentColor: '', brandedAppName: '', brandedFooter: '',
    whiteLabelEnabled: false, hideMianxBranding: false,
  });
  const [savingBrand, setSavingBrand] = useState(false);

  // Usage dialog
  const [usageOrg, setUsageOrg] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await authFetch(`/api/admin/organizations?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setOrgs(data.organizations || []);
        setTotal(data.total);
        if (data.counts) {
          const c: Record<string, number> = {};
          Object.entries(data.counts.status || {}).forEach(([k, v]: any) => c[k] = v);
          setCounts(c);
        }
      }
    } catch {
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const openDetail = async (org: OrgSummary) => {
    setDetailOrg(null);
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/admin/organizations/${org.id}`);
      const data = await res.json();
      if (res.ok) setDetailOrg(data.data);
      else toast.error(data.error || 'Failed to load details');
    } catch {
      toast.error('Failed to load organization details');
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = (org: OrgSummary) => {
    setEditOrg(org);
    setEditForm({
      planName: org.planName || '',
      vehicleLimit: String(org.vehicleLimit),
      userLimit: String(org.userLimit),
      status: org.status,
    });
  };

  const handleSaveEdit = async () => {
    if (!editOrg) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/organizations/${editOrg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          planName: editForm.planName || null,
          vehicleLimit: parseInt(editForm.vehicleLimit) || 0,
          userLimit: parseInt(editForm.userLimit) || 0,
          status: editForm.status,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Organization updated');
        setEditOrg(null);
        fetchOrgs();
      } else toast.error(data.error || 'Update failed');
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const openBranding = async (org: OrgSummary) => {
    setBrandOrg(org);
    setBrandForm({
      primaryColor: org.primaryColor || '#059669',
      accentColor: org.accentColor || '',
      brandedAppName: org.brandedAppName || '',
      brandedFooter: org.brandedFooter || '',
      whiteLabelEnabled: org.whiteLabelEnabled,
      hideMianxBranding: false,
    });
    try {
      const res = await authFetch(`/api/admin/organizations/${org.id}/branding`);
      const data = await res.json();
      if (res.ok && data.data) {
        setBrandForm({
          primaryColor: data.data.primaryColor || '#059669',
          accentColor: data.data.accentColor || '',
          brandedAppName: data.data.brandedAppName || '',
          brandedFooter: data.data.brandedFooter || '',
          whiteLabelEnabled: data.data.whiteLabelEnabled || false,
          hideMianxBranding: data.data.hideMianxBranding || false,
        });
      }
    } catch { /* use defaults */ }
  };

  const handleSaveBranding = async () => {
    if (!brandOrg) return;
    setSavingBrand(true);
    try {
      const res = await authFetch(`/api/admin/organizations/${brandOrg.id}/branding`, {
        method: 'PUT',
        body: JSON.stringify(brandForm),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Branding updated');
        setBrandOrg(null);
        fetchOrgs();
      } else toast.error(data.error || 'Update failed');
    } catch {
      toast.error('Failed to update branding');
    } finally {
      setSavingBrand(false);
    }
  };

  const openUsage = async (org: OrgSummary) => {
    setUsageOrg(org);
    setUsageData(null);
    setUsageLoading(true);
    try {
      const res = await authFetch(`/api/admin/organizations/${org.id}/usage?period=30d`);
      const data = await res.json();
      if (res.ok) setUsageData(data.data);
      else toast.error(data.error || 'Failed to load usage');
    } catch {
      toast.error('Failed to load usage');
    } finally {
      setUsageLoading(false);
    }
  };

  const handleDeactivate = async (org: OrgSummary) => {
    if (!confirm(`Deactivate "${org.name}"? All users will be deactivated too.`)) return;
    try {
      const res = await authFetch(`/api/admin/organizations/${org.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchOrgs();
      } else toast.error(data.error || 'Failed to deactivate');
    } catch {
      toast.error('Failed to deactivate');
    }
  };

  const totalPages = Math.ceil(total / 12);

  return (
    <div className="space-y-5">
      {/* Status Summary Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs px-2.5 py-1 bg-slate-100 text-slate-700 border-0 cursor-pointer" onClick={() => { setStatusFilter('all'); setPage(1); }}>
          All: {total}
        </Badge>
        <Badge variant="outline" className={`text-xs px-2.5 py-1 border-0 ${statusFilter === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-50 text-slate-500'} cursor-pointer`} onClick={() => { setStatusFilter('active'); setPage(1); }}>
          Active: {counts.active || 0}
        </Badge>
        <Badge variant="outline" className={`text-xs px-2.5 py-1 border-0 ${statusFilter === 'inactive' ? 'bg-red-100 text-red-700' : 'bg-slate-50 text-slate-500'} cursor-pointer`} onClick={() => { setStatusFilter('inactive'); setPage(1); }}>
          Inactive: {counts.inactive || 0}
        </Badge>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : orgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Building2 className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No organizations found</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-slate-100">
              {orgs.map((org) => (
                <OrgCard key={org.id} org={org} onDetail={openDetail} onEdit={openEdit} onBrand={openBranding} onUsage={openUsage} onDeactivate={handleDeactivate} />
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Organization</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Plan</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Emirate</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Vehicles</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Users</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">White-Label</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Created</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-800">{org.tradeName || org.name}</div>
                            {org.email && <div className="text-[11px] text-slate-400">{org.email}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px] bg-violet-100 text-violet-700 border-0">
                          {org.planName || 'Free'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{org.emirate || '—'}</TableCell>
                      <TableCell className="text-sm">
                        <span className={org._count.vehicles > org.vehicleLimit ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                          {org._count.vehicles}
                        </span>
                        <span className="text-slate-400">/{org.vehicleLimit}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className={org._count.users > org.userLimit ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                          {org._count.users}
                        </span>
                        <span className="text-slate-400">/{org.userLimit}</span>
                      </TableCell>
                      <TableCell>
                        {org.whiteLabelEnabled ? (
                          <Badge className="text-[10px] bg-purple-100 text-purple-700 border-0 gap-1"><Palette className="w-3 h-3" /> On</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Off</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[11px] border-0 ${org.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {org.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openDetail(org)} className="p-1.5 rounded hover:bg-slate-100 transition-colors cursor-pointer" title="View Details"><Eye className="w-3.5 h-3.5 text-slate-500" /></button>
                          <button onClick={() => openEdit(org)} className="p-1.5 rounded hover:bg-slate-100 transition-colors cursor-pointer" title="Edit"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                          <button onClick={() => openBranding(org)} className="p-1.5 rounded hover:bg-slate-100 transition-colors cursor-pointer" title="Branding"><Palette className="w-3.5 h-3.5 text-slate-500" /></button>
                          <button onClick={() => openUsage(org)} className="p-1.5 rounded hover:bg-slate-100 transition-colors cursor-pointer" title="Usage"><Activity className="w-3.5 h-3.5 text-slate-500" /></button>
                          {org.status === 'active' && (
                            <button onClick={() => handleDeactivate(org)} className="p-1.5 rounded hover:bg-red-50 transition-colors cursor-pointer" title="Deactivate"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-sm text-slate-500">Page {page} of {totalPages || 1}</p>
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
      </Card>

      {/* Org Detail Dialog */}
      <Dialog open={!!detailOrg} onOpenChange={(open) => !open && setDetailOrg(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detailLoading ? (
            <div className="py-12 space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
          ) : detailOrg ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                  {detailOrg.tradeName || detailOrg.name}
                  <Badge className={`ml-2 text-[10px] border-0 ${detailOrg.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {detailOrg.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              {/* Org Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <InfoItem icon={Mail} label="Email" value={detailOrg.email} />
                <InfoItem icon={Phone} label="Phone" value={detailOrg.phone} />
                <InfoItem icon={MapPin} label="Emirate" value={detailOrg.emirate} />
                <InfoItem icon={Globe} label="Website" value={detailOrg.website} />
                <InfoItem icon={CreditCard} label="Plan" value={detailOrg.planName || 'Free'} />
                <InfoItem icon={Calendar} label="Created" value={new Date(detailOrg.createdAt).toLocaleDateString()} />
              </div>

              {/* Utilization Bars */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <UtilizationBar label="Vehicles" used={detailOrg._count.vehicles} limit={detailOrg.vehicleLimit} color="bg-emerald-500" />
                <UtilizationBar label="Users" used={detailOrg.users.length} limit={detailOrg.userLimit} color="bg-blue-500" />
              </div>

              {/* Entity Counts */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                <MiniStat icon={Truck} label="Vehicles" value={detailOrg._count.vehicles} />
                <MiniStat icon={Users} label="Drivers" value={detailOrg._count.drivers} />
                <MiniStat icon={Cpu} label="Devices" value={detailOrg._count.devices} />
                <MiniStat icon={Wrench} label="Maint." value={detailOrg._count.maintenanceRecords} />
                <MiniStat icon={UserPlus} label="Leads" value={detailOrg._count.leads} />
                <MiniStat icon={FileText} label="Invoices" value={detailOrg._count.invoices} />
                <MiniStat icon={AlertTriangle} label="Tickets" value={detailOrg._count.tickets} />
                <MiniStat icon={CreditCard} label="Subs" value={detailOrg._count.subscriptions} />
              </div>

              {/* Revenue Summary */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Total Billed</div>
                  <div className="text-lg font-bold text-emerald-700 mt-1">{formatAED(detailOrg.invoiceStats.totalAmount)}</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Paid</div>
                  <div className="text-lg font-bold text-blue-700 mt-1">{formatAED(detailOrg.invoiceStats.paidAmount)}</div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Overdue</div>
                  <div className="text-lg font-bold text-red-700 mt-1">{formatAED(detailOrg.invoiceStats.overdueAmount)}</div>
                </div>
              </div>

              {/* Users List */}
              {detailOrg.users.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Users ({detailOrg.users.length})</h4>
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {detailOrg.users.map((u) => (
                      <div key={u.id} className="flex items-center gap-3 py-2">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="bg-slate-200 text-slate-600 text-[10px] font-semibold">
                            {u.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">{u.name}</div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                        </div>
                        <Badge className={`text-[10px] border-0 ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{u.status}</Badge>
                        <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-0">{u.role}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Branches */}
              {detailOrg.branches.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Branches ({detailOrg.branches.length})</h4>
                  <div className="space-y-2">
                    {detailOrg.branches.map((b) => (
                      <div key={b.id} className="text-xs text-slate-600 flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{b.name}</span>
                        {b.emirate && <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-0">{b.emirate}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit Org Dialog */}
      <Dialog open={!!editOrg} onOpenChange={(open) => !open && setEditOrg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Organization</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={editForm.planName} onValueChange={(v) => setEditForm({ ...editForm, planName: v })}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Free">Free</SelectItem>
                  <SelectItem value="Starter">Starter</SelectItem>
                  <SelectItem value="Premium">Premium</SelectItem>
                  <SelectItem value="Enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle Limit</Label>
                <Input type="number" value={editForm.vehicleLimit} onChange={(e) => setEditForm({ ...editForm, vehicleLimit: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>User Limit</Label>
                <Input type="number" value={editForm.userLimit} onChange={(e) => setEditForm({ ...editForm, userLimit: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrg(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* White-Label Branding Dialog */}
      <Dialog open={!!brandOrg} onOpenChange={(open) => !open && setBrandOrg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-purple-600" />
              White-Label Branding — {brandOrg?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Preview */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Preview</div>
              <div
                className="rounded-lg px-4 py-3 text-white font-bold text-sm"
                style={{ backgroundColor: brandForm.primaryColor || '#059669' }}
              >
                {brandForm.brandedAppName || brandOrg?.name || 'RTR 360'}
              </div>
              {brandForm.brandedFooter && (
                <div className="text-[11px] text-slate-400 mt-2 text-center">{brandForm.brandedFooter}</div>
              )}
            </div>

            {/* Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div>
                <div className="text-sm font-medium text-slate-700">White-Label Enabled</div>
                <div className="text-[11px] text-slate-400">Apply custom branding for this organization</div>
              </div>
              <button
                onClick={() => setBrandForm({ ...brandForm, whiteLabelEnabled: !brandForm.whiteLabelEnabled })}
                className={`w-10 h-6 rounded-full transition-colors cursor-pointer relative ${brandForm.whiteLabelEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${brandForm.whiteLabelEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={brandForm.primaryColor || '#059669'}
                    onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
                    className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                  />
                  <Input value={brandForm.primaryColor} onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })} className="flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Accent Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={brandForm.accentColor || '#059669'}
                    onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })}
                    className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                  />
                  <Input value={brandForm.accentColor} onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })} className="flex-1" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Branded App Name</Label>
              <Input value={brandForm.brandedAppName} onChange={(e) => setBrandForm({ ...brandForm, brandedAppName: e.target.value })} placeholder="e.g. FleetPro by XYZ" />
            </div>
            <div className="space-y-2">
              <Label>Branded Footer Text</Label>
              <Input value={brandForm.brandedFooter} onChange={(e) => setBrandForm({ ...brandForm, brandedFooter: e.target.value })} placeholder="e.g. © 2025 XYZ Logistics. All rights reserved." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBrandOrg(null)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleSaveBranding} disabled={savingBrand}>
              {savingBrand ? 'Saving...' : 'Save Branding'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage Analytics Dialog */}
      <Dialog open={!!usageOrg} onOpenChange={(open) => !open && setUsageOrg(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              Usage Analytics — {usageOrg?.name}
            </DialogTitle>
          </DialogHeader>
          {usageLoading ? (
            <div className="py-8 space-y-3"><Skeleton className="h-8" /><Skeleton className="h-40" /></div>
          ) : usageData ? (
            <div className="space-y-4 py-2">
              {/* Utilization */}
              <div className="grid grid-cols-2 gap-4">
                <UtilizationBar label="Vehicles" used={usageData.vehicles.total} limit={usageData.vehicles.limit} color="bg-emerald-500" />
                <UtilizationBar label="Users" used={usageData.users.total} limit={usageData.users.limit} color="bg-blue-500" />
              </div>

              {/* Usage Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <MiniStat icon={Truck} label="Active Vehicles" value={usageData.vehicles.active} />
                <MiniStat icon={RouteIcon} label="Trips (30d)" value={usageData.trips.total} />
                <MiniStat icon={Gauge} label="Total Distance" value={`${(usageData.trips.totalDistance / 1000).toFixed(0)} km`} />
                <MiniStat icon={Users} label="Active Drivers" value={usageData.drivers.total} />
                <MiniStat icon={Cpu} label="Devices" value={`${usageData.devices.installed}/${usageData.devices.total}`} />
                <MiniStat icon={UserPlus} label="Leads (30d)" value={usageData.leads.total} />
                <MiniStat icon={Trophy} label="Win Rate" value={`${usageData.leads.winRate}%`} />
                <MiniStat icon={CreditCard} label="Revenue (30d)" value={formatAED(usageData.invoices.paidAmount)} />
                <MiniStat icon={AlertTriangle} label="Alerts (30d)" value={usageData.alerts.total} />
              </div>

              {/* Feature Usage */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Feature Usage</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(usageData.featureUsage).map(([key, val]: any) => (
                    <Badge key={key} className={`text-[11px] border-0 ${val ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {val ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Recent Logins */}
              {usageData.recentLogins.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Recent Logins</h4>
                  <div className="divide-y divide-slate-100">
                    {usageData.recentLogins.map((u: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-slate-200 text-slate-600 text-[9px] font-semibold">
                              {u.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="text-xs font-medium text-slate-700">{u.name}</span>
                            <span className="text-[11px] text-slate-400 ml-2">{u.email}</span>
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily Activity */}
              {usageData.dailyActivity.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Daily Activity (30d)</h4>
                  <div className="h-32 flex items-end gap-0.5">
                    {usageData.dailyActivity.slice(-14).map((d: any, i: number) => {
                      const maxTrips = Math.max(...usageData.dailyActivity.map((x: any) => x.trips || x.alerts), 1);
                      const height = Math.max(4, Math.round(((d.trips || 0) / maxTrips) * 100));
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div className="w-full bg-emerald-400 rounded-t" style={{ height: `${height}%` }} title={`${d.date}: ${d.trips} trips, ${d.alerts} alerts`} />
                          <div className="text-[8px] text-slate-400 mt-1">{d.date.slice(8)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────────────────────
// Org Card (Mobile)
// ────────────────────────────────────────

function OrgCard({ org, onDetail, onEdit, onBrand, onUsage, onDeactivate }: {
  org: OrgSummary;
  onDetail: (o: OrgSummary) => void;
  onEdit: (o: OrgSummary) => void;
  onBrand: (o: OrgSummary) => void;
  onUsage: (o: OrgSummary) => void;
  onDeactivate: (o: OrgSummary) => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-800">{org.tradeName || org.name}</div>
            <div className="text-[11px] text-slate-400">{org.emirate || 'UAE'} · {org.planName || 'Free'}</div>
          </div>
        </div>
        <Badge className={`text-[10px] border-0 ${org.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {org.status}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3 text-center">
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-sm font-bold text-slate-700">{org._count.vehicles}</div>
          <div className="text-[10px] text-slate-400">Vehicles</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-sm font-bold text-slate-700">{org._count.users}</div>
          <div className="text-[10px] text-slate-400">Users</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-sm font-bold text-slate-700">{org._count.devices}</div>
          <div className="text-[10px] text-slate-400">Devices</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-3">
        <button onClick={() => onDetail(org)} className="flex-1 text-center py-1.5 text-[11px] text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">Details</button>
        <button onClick={() => onEdit(org)} className="flex-1 text-center py-1.5 text-[11px] text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">Edit</button>
        <button onClick={() => onBrand(org)} className="flex-1 text-center py-1.5 text-[11px] text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer">Branding</button>
        <button onClick={() => onUsage(org)} className="flex-1 text-center py-1.5 text-[11px] text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">Usage</button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Onboard New Org Tab
// ────────────────────────────────────────

function OnboardOrg() {
  const [form, setForm] = useState({
    name: '', tradeName: '', legalName: '', email: '', phone: '', emirate: '', city: '', address: '', industry: '', website: '',
    planName: 'Starter', vehicleLimit: '10', userLimit: '5',
    adminName: '', adminEmail: '', adminPassword: '',
    primaryColor: '#059669', brandedAppName: '', whiteLabelEnabled: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Organization name is required'); return; }
    if (!form.adminName.trim()) { toast.error('Admin name is required'); return; }
    if (!form.adminEmail.trim()) { toast.error('Admin email is required'); return; }
    if (!form.adminPassword || form.adminPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          vehicleLimit: parseInt(form.vehicleLimit) || 10,
          userLimit: parseInt(form.userLimit) || 5,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        // Reset form
        setForm({ name: '', tradeName: '', legalName: '', email: '', phone: '', emirate: '', city: '', address: '', industry: '', website: '', planName: 'Starter', vehicleLimit: '10', userLimit: '5', adminName: '', adminEmail: '', adminPassword: '', primaryColor: '#059669', brandedAppName: '', whiteLabelEnabled: false });
        setStep(1);
      } else {
        toast.error(data.error || 'Failed to create organization');
      }
    } catch {
      toast.error('Failed to create organization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Card className="rounded-xl border-slate-200/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
            Onboard New Organization
          </CardTitle>
          <p className="text-sm text-slate-500">Create a new organization with an admin user account</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step Indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <button key={s} onClick={() => setStep(s)} className="cursor-pointer flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s}</div>
                <span className={`text-xs ${step === s ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                  {s === 1 ? 'Organization' : s === 2 ? 'Admin User' : 'Plan & Branding'}
                </span>
              </button>
            ))}
          </div>

          <Separator />

          {/* Step 1: Organization Info */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Organization Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Al Fahim Logistics LLC" />
                </div>
                <div className="space-y-2">
                  <Label>Trade Name</Label>
                  <Input value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} placeholder="e.g. Al Fahim" />
                </div>
                <div className="space-y-2">
                  <Label>Legal Name</Label>
                  <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="e.g. Al Fahim Logistics LLC" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@company.ae" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 4 xxx xxxx" />
                </div>
                <div className="space-y-2">
                  <Label>Emirate</Label>
                  <Select value={form.emirate} onValueChange={(v) => setForm({ ...form, emirate: v })}>
                    <SelectTrigger><SelectValue placeholder="Select emirate" /></SelectTrigger>
                    <SelectContent>
                      {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'UAQ', 'RAK', 'Fujairah'].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Logistics, Construction" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStep(2)}>Next →</Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Admin User */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                The admin user will be the organization owner with full access to all modules.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Admin Name *</Label>
                  <Input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} placeholder="Full name" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Admin Email *</Label>
                  <Input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@company.ae" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Password * (min 6 chars)</Label>
                  <Input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder="Min 6 characters" />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStep(3)}>Next →</Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Plan & Branding */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select value={form.planName} onValueChange={(v) => setForm({ ...form, planName: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Free">Free</SelectItem>
                      <SelectItem value="Starter">Starter (AED 499/mo)</SelectItem>
                      <SelectItem value="Premium">Premium (AED 1,299/mo)</SelectItem>
                      <SelectItem value="Enterprise">Enterprise (Custom)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Limit</Label>
                  <Input type="number" value={form.vehicleLimit} onChange={(e) => setForm({ ...form, vehicleLimit: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>User Limit</Label>
                  <Input type="number" value={form.userLimit} onChange={(e) => setForm({ ...form, userLimit: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                      className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                    />
                    <Input value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Branded App Name</Label>
                  <Input value={form.brandedAppName} onChange={(e) => setForm({ ...form, brandedAppName: e.target.value })} placeholder="e.g. FleetPro XYZ" />
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Summary</div>
                <div className="space-y-1 text-sm text-slate-700">
                  <div><strong>Organization:</strong> {form.name || '—'}</div>
                  <div><strong>Admin:</strong> {form.adminName || '—'} ({form.adminEmail || '—'})</div>
                  <div><strong>Plan:</strong> {form.planName} · {form.vehicleLimit} vehicles · {form.userLimit} users</div>
                  {form.emirate && <div><strong>Emirate:</strong> {form.emirate}</div>}
                </div>
                <div className="mt-3 rounded-lg px-4 py-2 text-white font-bold text-sm" style={{ backgroundColor: form.primaryColor }}>
                  {form.brandedAppName || form.name || 'RTR 360'}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>
                  {submitting ? (
                    <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</span>
                  ) : 'Create Organization'}
                </Button>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────
// Shared Small Components
// ────────────────────────────────────────

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-800 truncate">{value || '—'}</span>
    </div>
  );
}

function UtilizationBar({ label, used, limit, color }: { label: string; used: number; limit: number; color: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isOver = used > limit && limit > 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className={`text-xs font-bold ${isOver ? 'text-red-600' : 'text-slate-700'}`}>{used}/{limit} ({pct}%)</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 0.8 }}
          className={`h-full rounded-full ${isOver ? 'bg-red-500' : color}`}
        />
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-slate-400" />
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
    </div>
  );
}

// Extra icon imports needed
import { Route as RouteIcon, Trophy, Gauge } from 'lucide-react';

import { authFetch } from '@/lib/api';