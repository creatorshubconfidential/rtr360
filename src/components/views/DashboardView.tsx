'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Truck, Activity, Users, UserPlus, AlertTriangle, Ticket, Cpu, Wrench, HardHat, Route, Gauge, Shield, BrainCircuit } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { authFetch } from '@/lib/api';
import { STATUS_COLORS, PRIORITY_COLORS } from '@/lib/constants';
import type { DashboardStats, Lead, Alert } from '@/lib/types';

function DashboardPredictiveInsights() {
  const [fleetData, setFleetData] = useState<any>(null);
  const [maintData, setMaintData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch('/api/analytics/fleet-health').catch(() => null),
      authFetch('/api/analytics/maintenance-prediction').catch(() => null),
    ]).then(([fh, mp]) => {
      if (fh) setFleetData(fh);
      if (mp) setMaintData(mp);
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton className="h-40 rounded-xl" />;

  const insights: { icon: LucideIcon; color: string; bgColor: string; label: string; value: string; sub: string }[] = [];

  if (fleetData) {
    const grade = fleetData.fleetGrade;
    const gradeColorMap: Record<string, string> = {
      A: 'text-emerald-600',
      B: 'text-blue-600',
      C: 'text-amber-600',
      D: 'text-red-600',
    };
    const gradeColor = gradeColorMap[grade as string] || 'text-slate-600';
    insights.push({
      icon: Shield,
      color: gradeColor,
      bgColor: grade === 'A' ? 'bg-emerald-50' : grade === 'B' ? 'bg-blue-50' : grade === 'C' ? 'bg-amber-50' : 'bg-red-50',
      label: 'Fleet Health Score',
      value: `${fleetData.fleetScore}/100 (Grade ${grade})`,
      sub: `${fleetData.summary.criticalCount} critical, ${fleetData.summary.highRiskCount} high risk vehicles`,
    });

    if (fleetData.topIssues.length > 0) {
      insights.push({
        icon: AlertTriangle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        label: 'Top Issue',
        value: fleetData.topIssues[0].message,
        sub: `${fleetData.topIssues[0].vehiclePlate} — ${fleetData.topIssues[0].severity} severity`,
      });
    }
  }

  if (maintData) {
    if (maintData.summary.overdueCount > 0) {
      insights.push({
        icon: Wrench,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        label: 'Maintenance Overdue',
        value: `${maintData.summary.overdueCount} vehicle(s) overdue`,
        sub: `Predicted cost: AED ${maintData.summary.totalPredictedCost.toLocaleString()}`,
      });
    } else if (maintData.summary.highUrgencyCount > 0) {
      insights.push({
        icon: Wrench,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        label: 'Maintenance Due Soon',
        value: `${maintData.summary.highUrgencyCount} vehicle(s) within 7 days`,
        sub: `Avg ${maintData.summary.avgDaysUntilService} days to next service`,
      });
    } else {
      insights.push({
        icon: Shield,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        label: 'Maintenance Status',
        value: 'All vehicles on schedule',
        sub: `Next service avg: ${maintData.summary.avgDaysUntilService} days`,
      });
    }
  }

  if (insights.length === 0) return null;

  return (
    <Card className="rounded-xl border-slate-200/60 shadow-sm bg-gradient-to-r from-slate-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-emerald-600" />
          Predictive Insights
          <span className="text-[10px] font-normal text-slate-400 ml-1">Powered by Mianx.ai</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insights.map((ins, i) => {
            const Icon = ins.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`p-3 rounded-lg ${ins.bgColor} border border-white/50`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`w-4 h-4 ${ins.color}`} />
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{ins.label}</span>
                </div>
                <div className={`text-sm font-semibold ${ins.color}`}>{ins.value}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{ins.sub}</div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardView() {
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
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const kpiCards = stats
    ? [
        { icon: Truck, label: 'Total Vehicles', value: stats.totalVehicles, color: 'bg-emerald-100 text-emerald-600' },
        { icon: Activity, label: 'Active Vehicles', value: stats.activeVehicles, color: 'bg-green-100 text-green-600' },
        { icon: Users, label: 'Total Drivers', value: stats.totalDrivers, color: 'bg-teal-100 text-teal-600' },
        { icon: UserPlus, label: 'Open Leads', value: stats.totalLeads, color: 'bg-amber-100 text-amber-600' },
        { icon: AlertTriangle, label: 'Open Alerts', value: stats.openAlerts, color: 'bg-red-100 text-red-600' },
        { icon: Ticket, label: 'Open Tickets', value: stats.openTickets, color: 'bg-orange-100 text-orange-600' },
        { icon: Cpu, label: 'Total Devices', value: stats.totalDevices, color: 'bg-blue-100 text-blue-600' },
        { icon: Wrench, label: 'Pending Installs', value: stats.pendingInstallations, color: 'bg-purple-100 text-purple-600' },
        { icon: HardHat, label: 'Technicians', value: stats.activeTechnicians, color: 'bg-cyan-100 text-cyan-600' },
        { icon: Route, label: "Today's Trips", value: stats.todayTrips, color: 'bg-indigo-100 text-indigo-600' },
        { icon: Gauge, label: 'Total Distance (km)', value: stats.totalDistance.toLocaleString(), color: 'bg-pink-100 text-pink-600' },
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      <DashboardPredictiveInsights />
    </div>
  );
}