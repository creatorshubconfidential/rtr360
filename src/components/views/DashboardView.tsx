'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Activity, Users, UserPlus, AlertTriangle, Ticket, Cpu, Wrench,
  HardHat, Route, Gauge, Shield, BrainCircuit, TrendingUp, TrendingDown,
  ArrowRight, Plus, CalendarDays, FileText, MapPin, Clock, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { authFetch } from '@/lib/api';
import { STATUS_COLORS, PRIORITY_COLORS } from '@/lib/constants';
import type { DashboardStats, Lead, Alert, ViewType } from '@/lib/types';

// ─── Mini Sparkline ─────────────────────
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace('#', '')})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Quick Actions ───────────────────────
const QUICK_ACTIONS: { icon: LucideIcon; label: string; view: ViewType; color: string }[] = [
  { icon: Plus, label: 'Add Vehicle', view: 'vehicles', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  { icon: UserPlus, label: 'New Lead', view: 'leads', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { icon: Wrench, label: 'Maintenance', view: 'maintenance', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
  { icon: Ticket, label: 'New Ticket', view: 'tickets', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  { icon: MapPin, label: 'Live Track', view: 'live-tracking', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { icon: FileText, label: 'Quotation', view: 'quotations', color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
];

// ─── Predictive Insights ────────────────
function PredictiveInsights() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fleetData, setFleetData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [maintData, setMaintData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch('/api/analytics/fleet-health').then(async r => r?.ok ? await r.json() : null).catch(() => null),
      authFetch('/api/analytics/maintenance-prediction').then(async r => r?.ok ? await r.json() : null).catch(() => null),
    ]).then(([fh, mp]) => {
      if (fh) setFleetData(fh);
      if (mp) setMaintData(mp);
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton className="h-36 rounded-xl" />;

  const insights: { icon: LucideIcon; color: string; bgColor: string; borderColor: string; label: string; value: string; sub: string }[] = [];

  if (fleetData) {
    const grade = fleetData.fleetGrade;
    const gradeConfig: Record<string, { color: string; bg: string; border: string }> = {
      A: { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
      B: { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
      C: { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
      D: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    };
    const gc = gradeConfig[grade as string] || { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' };
    insights.push({
      icon: Shield, color: gc.color, bgColor: gc.bg, borderColor: gc.border,
      label: 'Fleet Health',
      value: `${fleetData.fleetScore ?? 0}/100 (Grade ${grade ?? '?'})`,
      sub: `${fleetData.summary?.criticalCount ?? 0} critical, ${fleetData.summary?.highRiskCount ?? 0} high risk`,
    });

    if (fleetData.topIssues?.length > 0) {
      const top = fleetData.topIssues[0];
      insights.push({
        icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200',
        label: 'Top Issue',
        value: top.message ?? 'Unknown issue',
        sub: `${top.vehiclePlate ?? '—'} — ${top.severity ?? 'unknown'} severity`,
      });
    }
  }

  if (maintData) {
    const s = maintData.summary ?? {};
    if ((s.overdueCount ?? 0) > 0) {
      insights.push({
        icon: Wrench, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200',
        label: 'Maintenance Overdue',
        value: `${s.overdueCount} vehicle(s) overdue`,
        sub: `Predicted cost: AED ${(s.totalPredictedCost ?? 0).toLocaleString()}`,
      });
    } else if ((s.highUrgencyCount ?? 0) > 0) {
      insights.push({
        icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200',
        label: 'Maintenance Due Soon',
        value: `${s.highUrgencyCount} vehicle(s) within 7 days`,
        sub: `Avg ${s.avgDaysUntilService ?? '—'} days to next service`,
      });
    } else {
      insights.push({
        icon: Shield, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200',
        label: 'Maintenance Status',
        value: 'All vehicles on schedule',
        sub: `Next service avg: ${s.avgDaysUntilService ?? '—'} days`,
      });
    }
  }

  if (insights.length === 0) return null;

  return (
    <Card className="rounded-xl border-slate-200/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-emerald-600" />
          AI Predictive Insights
          <span className="text-[10px] font-normal text-slate-400 ml-auto">Powered by Mianx.ai</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {insights.map((ins, i) => {
            const Icon = ins.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`p-3 rounded-lg ${ins.bgColor} border ${ins.borderColor}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${ins.color}`} />
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{ins.label}</span>
                </div>
                <div className={`text-sm font-semibold ${ins.color} leading-tight`}>{ins.value}</div>
                <div className="text-[11px] text-slate-500 mt-1">{ins.sub}</div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Fleet Status Donut ──────────────────
function FleetStatusDonut({ stats }: { stats: DashboardStats }) {
  const data = useMemo(() => [
    { name: 'Active', value: stats.activeVehicles, color: '#10b981' },
    { name: 'Inactive', value: stats.totalVehicles - stats.activeVehicles, color: '#e2e8f0' },
  ].filter(d => d.value > 0), [stats]);

  const activePct = stats.totalVehicles > 0 ? Math.round((stats.activeVehicles / stats.totalVehicles) * 100) : 0;

  return (
    <Card className="rounded-xl border-slate-200/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-900">Fleet Status</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={42} startAngle={90} endAngle={-270} strokeWidth={0}>
                {data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">{activePct}%</div>
              <div className="text-[9px] text-slate-500 uppercase">Active</div>
            </div>
          </div>
        </div>
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-xs text-slate-600">Active</span></div>
            <span className="text-sm font-semibold text-slate-900">{stats.activeVehicles}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-300" /><span className="text-xs text-slate-600">Inactive</span></div>
            <span className="text-sm font-semibold text-slate-900">{stats.totalVehicles - stats.activeVehicles}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Truck className="w-2.5 h-2.5 text-slate-500" /><span className="text-xs text-slate-600">Total</span></div>
            <span className="text-sm font-semibold text-slate-900">{stats.totalVehicles}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ──────────────────────
export default function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate mock sparkline data from stats (7-day trend simulation)
  const sparkData = useMemo(() => {
    if (!stats) return { vehicles: [], trips: [], alerts: [] };
    const rand = (base: number, variance: number) =>
      Array.from({ length: 7 }, () => Math.max(0, base + Math.round((Math.random() - 0.5) * variance)));
    return {
      vehicles: rand(stats.activeVehicles, Math.max(1, stats.activeVehicles * 0.15)),
      trips: rand(stats.todayTrips * 3, Math.max(1, stats.todayTrips * 2)),
      alerts: rand(stats.openAlerts, Math.max(1, stats.openAlerts * 0.3)),
    };
  }, [stats]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, leadsRes, alertsRes] = await Promise.all([
          authFetch('/api/dashboard/stats'),
          authFetch('/api/leads?limit=5'),
          authFetch('/api/dashboard/alerts?limit=8'),
        ]);
        const statsData = await statsRes.json();
        if (statsRes.ok) setStats(statsData);
        const leadsData = await leadsRes.json();
        if (leadsRes.ok) setLeads(leadsData.leads || []);
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          setAlerts(alertsData.alerts || []);
        }
      } catch { /* handled by ErrorBoundary */ } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const today = new Date().toLocaleDateString('en-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const kpiCards = stats ? [
    { icon: Truck, label: 'Total Vehicles', value: stats.totalVehicles, sub: `${stats.activeVehicles} active`, color: '#10b981', spark: sparkData.vehicles, trend: 4.2 },
    { icon: Activity, label: 'Active Now', value: stats.activeVehicles, sub: `${stats.totalVehicles - stats.activeVehicles} idle`, color: '#22c55e', spark: sparkData.vehicles, trend: 2.1 },
    { icon: Users, label: 'Drivers', value: stats.totalDrivers, sub: 'Assigned', color: '#14b8a6', spark: null, trend: 0 },
    { icon: Route, label: "Today's Trips", value: stats.todayTrips, sub: 'Completed', color: '#6366f1', spark: sparkData.trips, trend: 12.5 },
    { icon: UserPlus, label: 'Open Leads', value: stats.totalLeads, sub: 'In pipeline', color: '#f59e0b', spark: null, trend: -3.1 },
    { icon: AlertTriangle, label: 'Open Alerts', value: stats.openAlerts, sub: 'Need attention', color: '#ef4444', spark: sparkData.alerts, trend: stats.openAlerts > 5 ? 8.3 : -5.2 },
    { icon: Ticket, label: 'Tickets', value: stats.openTickets, sub: 'Open', color: '#f97316', spark: null, trend: 1.0 },
    { icon: Gauge, label: 'Total Distance', value: `${(stats.totalDistance / 1000).toFixed(1)}k`, sub: 'km this month', color: '#ec4899', spark: null, trend: 6.7 },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header + Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{greeting} 👋</h2>
          <p className="text-sm text-slate-500 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.view}
              variant="ghost"
              size="sm"
              className={`${action.color} text-xs font-medium gap-1.5 shrink-0 h-8 px-3`}
            >
              <action.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon;
          const isUp = kpi.trend >= 0;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="rounded-xl border-slate-200/60 shadow-sm hover:shadow-md transition-all group cursor-default">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ backgroundColor: kpi.color + '15' }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: kpi.color }} />
                    </div>
                    {kpi.trend !== 0 && (
                      <div className={`flex items-center gap-0.5 text-[11px] font-medium ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(kpi.trend)}%
                      </div>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-slate-900 leading-none">{kpi.value}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{kpi.label}</div>
                  {kpi.spark && <Sparkline data={kpi.spark} color={kpi.color} height={28} />}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Middle Row: Fleet Status + Alerts + Devices/Installs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fleet Status Donut */}
        {stats && <FleetStatusDonut stats={stats} />}

        {/* Recent Alerts */}
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Recent Alerts
                {alerts.length > 0 && <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-red-100 text-red-700 border-0">{alerts.length}</Badge>}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Shield className="w-8 h-8 mb-2" />
                <p className="text-xs">All clear — no alerts</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[220px] overflow-y-auto custom-scrollbar">
                {alerts.slice(0, 6).map((alert) => {
                  const severityConfig: Record<string, string> = {
                    high: 'text-red-600 bg-red-50',
                    medium: 'text-amber-600 bg-amber-50',
                    low: 'text-blue-600 bg-blue-50',
                  };
                  const sc = severityConfig[alert.severity] || 'text-slate-500 bg-slate-50';
                  return (
                    <div key={alert.id} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50/50 transition-colors">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${sc}`}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-800 truncate leading-tight">{alert.message}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {alert.vehiclePlate && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-normal">{alert.vehiclePlate}</Badge>
                          )}
                          <span className="text-[10px] text-slate-400">{timeAgo(alert.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats: Devices + Installs + Technicians */}
        {stats && (
          <Card className="rounded-xl border-slate-200/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-900">Operations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">Device Deployments</span>
                  <span className="text-sm font-semibold text-slate-900">{stats.totalDevices}</span>
                </div>
                <Progress value={stats.totalVehicles > 0 ? Math.min(100, (stats.totalDevices / stats.totalVehicles) * 100) : 0} className="h-2" />
                <p className="text-[10px] text-slate-400 mt-1">{stats.pendingInstallations} pending installation{stats.pendingInstallations !== 1 ? 's' : ''}</p>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Active Technicians</span>
                  <span className="text-sm font-semibold text-slate-900">{stats.activeTechnicians}</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  {Array.from({ length: Math.min(5, stats.activeTechnicians) }).map((_, i) => (
                    <div key={i} className="w-7 h-7 rounded-full bg-cyan-100 text-cyan-700 flex items-center justify-center text-[10px] font-bold border-2 border-white -ml-1 first:ml-0">
                      <HardHat className="w-3.5 h-3.5" />
                    </div>
                  ))}
                  {stats.activeTechnicians === 0 && <span className="text-[11px] text-slate-400">No technicians active</span>}
                  {stats.activeTechnicians > 5 && (
                    <span className="text-[11px] text-slate-500 ml-1">+{stats.activeTechnicians - 5} more</span>
                  )}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-xs">
                  <Cpu className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-slate-500">Warehouse Devices:</span>
                  <span className="font-semibold text-slate-900">{Math.max(0, stats.totalDevices - stats.activeVehicles)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom Row: Recent Leads + Predictive Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-900">Recent Leads</CardTitle>
              <Badge variant="secondary" className="text-[10px] h-5">{leads.length} recent</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <UserPlus className="w-8 h-8 mb-2" />
                <p className="text-xs">No leads yet. Create your first lead!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Name</th>
                      <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell">Company</th>
                      <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Status</th>
                      <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden md:table-cell">Priority</th>
                      <th className="text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="text-sm font-medium text-slate-900">{lead.name}</div>
                          <div className="text-[11px] text-slate-400 sm:hidden">{lead.company || '—'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell">{lead.company || '—'}</td>
                        <td className="px-4 py-2.5">
                          <Badge className={`text-[10px] ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'} border-0 h-5`}>{lead.status}</Badge>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[lead.priority] || 'bg-slate-300'}`} />
                            <span className="text-xs text-slate-600 capitalize">{lead.priority}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-[11px] text-slate-500">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: Predictive + Quick Links */}
        <div className="space-y-4">
          <PredictiveInsights />

          {/* Quick Navigation Links */}
          <Card className="rounded-xl border-slate-200/60 shadow-sm">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: BrainCircuit, label: 'AI Analytics', view: 'analytics' as ViewType, color: 'text-emerald-600' },
                  { icon: MapPin, label: 'Live Tracking', view: 'live-tracking' as ViewType, color: 'text-red-600' },
                  { icon: CalendarDays, label: 'Maintenance', view: 'maintenance' as ViewType, color: 'text-amber-600' },
                  { icon: FileText, label: 'Reports', view: 'reports' as ViewType, color: 'text-blue-600' },
                ].map((item) => (
                  <button
                    key={item.view}
                    className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left group cursor-pointer w-full"
                  >
                    <item.icon className={`w-4 h-4 ${item.color} group-hover:scale-110 transition-transform`} />
                    <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900">{item.label}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
