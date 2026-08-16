'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { authFetch } from '@/lib/api';
import {
  TrendingUp,
  DollarSign,
  Truck,
  Users,
  Wrench,
  Ticket,
  Target,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';

// ────────────────────────────────────────
// Helpers
// ────────────────────────────────────────

const aedFmt = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
});

const formatAED = (value: number) => aedFmt.format(value);


// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

interface ReportSummary {
  totalRevenue: number;
  pendingRevenue: number;
  overdueRevenue: number;
  totalVehicles: number;
  activeVehicles: number;
  totalMaintenance: number;
  totalMaintenanceCost: number;
  totalLeads: number;
  conversionRate: number;
  totalTrips: number;
  totalDistance: number;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
  invoices: number;
}

interface MonthlyMaintenance {
  month: string;
  cost: number;
  count: number;
}

interface ByTypeItem {
  type: string;
  count: number;
}

interface LeadFunnelItem {
  status: string;
  count: number;
}

interface Driver {
  name: string;
  score: number;
  totalTrips: number;
  totalDistance: number;
  totalViolations: number;
}

interface TicketStatusItem {
  status: string;
  count: number;
}

interface TicketPriorityItem {
  priority: string;
  count: number;
}

interface DeviceStatusItem {
  status: string;
  count: number;
}

interface InstallationStatusItem {
  status: string;
  count: number;
}

interface ReportsData {
  period: string;
  summary: ReportSummary;
  monthlyRevenue: MonthlyRevenue[];
  monthlyMaintenance: MonthlyMaintenance[];
  vehiclesByType: ByTypeItem[];
  maintenanceByType: ByTypeItem[];
  leadFunnel: LeadFunnelItem[];
  drivers: Driver[];
  ticketByStatus: TicketStatusItem[];
  ticketByPriority: TicketPriorityItem[];
  devicesByStatus: DeviceStatusItem[];
  installationsByStatus: InstallationStatusItem[];
}

// ────────────────────────────────────────
// Constants
// ────────────────────────────────────────

const VEHICLE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const LEAD_FUNNEL_COLORS: Record<string, string> = {
  New: '#3b82f6',
  Contacted: '#8b5cf6',
  Qualified: '#f59e0b',
  Proposal: '#06b6d4',
  'Won': '#10b981',
  'Lost': '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#10b981',
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  open: '#f59e0b',
  'in_progress': '#3b82f6',
  resolved: '#10b981',
  closed: '#6b7280',
};

const DEVICE_STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  inactive: '#6b7280',
  offline: '#ef4444',
  maintenance: '#f59e0b',
};

const INSTALLATION_STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
};

// ────────────────────────────────────────
// Custom Tooltip
// ────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
  formatter?: (value: number) => string;
}

function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-slate-600" style={{ color: entry.color || '#334155' }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

// ────────────────────────────────────────
// Component
// ────────────────────────────────────────

export default function ReportsView() {
  const [period, setPeriod] = useState<string>('1month');
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch(`/api/reports?period=${period}`);
      setData(result);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load reports data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ──── Loading Skeleton ────

  if (loading || !data) {
    return (
      <div className="space-y-6">
        {/* Period selector skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        {/* KPI row */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        {/* Chart rows */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { summary } = data;
  const fleetUtilization = summary.totalVehicles > 0
    ? ((summary.activeVehicles / summary.totalVehicles) * 100).toFixed(1)
    : '0.0';

  // ──── Render ────

  return (
    <div className="space-y-6">
      {/* ──── Header + Period Selector ──── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Reports & Analytics</h2>
            <p className="text-sm text-slate-500">Fleet performance overview</p>
          </div>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1month">Last 1 Month</SelectItem>
            <SelectItem value="3months">Last 3 Months</SelectItem>
            <SelectItem value="6months">Last 6 Months</SelectItem>
            <SelectItem value="12months">Last 12 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ──── KPI Summary Cards ──── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatAED(summary.totalRevenue)}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
              <TrendingUp className="w-3 h-3" />
              <span>{summary.totalTrips.toLocaleString()} trips</span>
            </div>
          </CardContent>
        </Card>

        {/* Pending Revenue */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Pending Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatAED(summary.pendingRevenue)}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
              <span>Overdue: {formatAED(summary.overdueRevenue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Utilization */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Fleet Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {fleetUtilization}%
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
              <span>
                {summary.activeVehicles} / {summary.totalVehicles} vehicles active
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Lead Conversion */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Lead Conversion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {summary.conversionRate}%
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
              <span>{summary.totalLeads} total leads</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ──── Second Row: Revenue & Maintenance Charts ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Revenue Bar Chart */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Monthly Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyRevenue} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => formatAED(v)} />} />
                  <Bar dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Maintenance Cost Area Chart */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-500" />
              Monthly Maintenance Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlyMaintenance} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => formatAED(v)} />} />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="#f59e0b"
                    fill="#fef3c7"
                    strokeWidth={2}
                    name="Cost"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ──── Third Row: Lead Funnel, Vehicles by Type, Support Tickets ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Lead Funnel */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-500" />
              Lead Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.leadFunnel}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="status"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip />
                  <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
                    {data.leadFunnel.map((entry, index) => (
                      <Cell
                        key={`funnel-${index}`}
                        fill={LEAD_FUNNEL_COLORS[entry.status] || '#6b7280'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Vehicles by Type Pie Chart */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              Vehicles by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.vehiclesByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="type"
                    label={({ type, percent }) =>
                      `${type} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {data.vehiclesByType.map((_entry, index) => (
                      <Cell
                        key={`vehicle-${index}`}
                        fill={VEHICLE_COLORS[index % VEHICLE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Support Tickets by Priority Pie Chart */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-amber-500" />
              Support Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.ticketByPriority}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="priority"
                    label={({ priority, percent }) =>
                      `${priority} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {data.ticketByPriority.map((entry, index) => (
                      <Cell
                        key={`ticket-priority-${index}`}
                        fill={PRIORITY_COLORS[entry.priority] || '#6b7280'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ──── Fourth Row: Driver Performance Table ──── */}
      <Card className="bg-white rounded-xl border border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            Driver Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Driver</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Score</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-600">Trips</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-600">Distance (km)</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-600">Violations</th>
                </tr>
              </thead>
              <tbody>
                {data.drivers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      No driver data available
                    </td>
                  </tr>
                ) : (
                  data.drivers.map((driver, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-slate-800">{driver.name}</td>
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            driver.score > 80
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : driver.score > 60
                                ? 'bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-red-100 text-red-700 border-red-200'
                          }
                          variant="outline"
                        >
                          {driver.score}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {driver.totalTrips.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {driver.totalDistance.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={
                            driver.totalViolations === 0
                              ? 'text-emerald-600'
                              : driver.totalViolations <= 2
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }
                        >
                          {driver.totalViolations}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ──── Bottom Row: Device Status & Installation Status ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Device Status */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              Device Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.devicesByStatus.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No device data</p>
              ) : (
                data.devicesByStatus.map((item, idx) => {
                  const total = data.devicesByStatus.reduce((s, d) => s + d.count, 0);
                  const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0';
                  const color = DEVICE_STATUS_COLORS[item.status] || '#6b7280';
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-28 capitalize truncate">{item.status}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: color,
                            minWidth: item.count > 0 ? '2rem' : '0',
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-700 w-20 text-right">
                        {item.count} ({pct}%)
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Installation Status */}
        <Card className="bg-white rounded-xl border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-emerald-600" />
              Installation Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.installationsByStatus.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No installation data</p>
              ) : (
                data.installationsByStatus.map((item, idx) => {
                  const total = data.installationsByStatus.reduce((s, d) => s + d.count, 0);
                  const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0';
                  const color = INSTALLATION_STATUS_COLORS[item.status] || '#6b7280';
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-28 capitalize truncate">{item.status}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: color,
                            minWidth: item.count > 0 ? '2rem' : '0',
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-700 w-20 text-right">
                        {item.count} ({pct}%)
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
