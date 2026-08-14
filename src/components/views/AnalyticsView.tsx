'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend, RadialBarChart, RadialBar,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  Heart, TrendingUp, TrendingDown, AlertTriangle, Shield, Truck, Users, Wrench,
  DollarSign, Activity, BarChart3, ChevronDown, ChevronUp, ExternalLink, Zap,
  ArrowRight, Target, Clock, Gauge, Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('rtr_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const aedFmt = new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' });
const fmt = (v: number) => aedFmt.format(v);
const fmtNum = (v: number) => new Intl.NumberFormat('en-AE').format(v);

// ─── Colors ─────────────────────────────
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
const RISK_COLORS: Record<string, string> = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#10b981' };
const GRADE_COLORS: Record<string, string> = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
const URGENCY_COLORS: Record<string, string> = { overdue: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#10b981' };

// ─── Fleet Health Score Gauge ────────────
function ScoreGauge({ score, label, size = 120 }: { score: number; label: string; size?: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#3b82f6' : score >= 40 ? '#f59e0b' : '#ef4444';
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  const data = [{ name: label, value: score, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <RadialBarChart width={size} height={size} cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} data={data}>
        <RadialBar background={{ fill: '#e2e8f0' }} dataKey="value" cornerRadius={10} />
      </RadialBarChart>
      <div className="-mt-[72px] text-center mb-2">
        <div className="text-3xl font-bold" style={{ color }}>{score}</div>
        <div className="text-xs font-medium text-slate-500">Grade {grade}</div>
      </div>
      <div className="text-xs text-slate-500 -mt-1">{label}</div>
    </div>
  );
}

export default function AnalyticsView() {
  const [activeTab, setActiveTab] = useState('fleet-health');

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Advanced Analytics</h2>
          <p className="text-sm text-slate-500">Predictive intelligence powered by Mianx.ai</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full">
          <TabsTrigger value="fleet-health" className="text-xs sm:text-sm"><Heart className="w-4 h-4 mr-1 hidden sm:inline" />Fleet Health</TabsTrigger>
          <TabsTrigger value="driver-trends" className="text-xs sm:text-sm"><Users className="w-4 h-4 mr-1 hidden sm:inline" />Drivers</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs sm:text-sm"><Wrench className="w-4 h-4 mr-1 hidden sm:inline" />Maintenance AI</TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs sm:text-sm"><DollarSign className="w-4 h-4 mr-1 hidden sm:inline" />Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet-health"><FleetHealthTab /></TabsContent>
        <TabsContent value="driver-trends"><DriverTrendsTab /></TabsContent>
        <TabsContent value="maintenance"><MaintenancePredictionTab /></TabsContent>
        <TabsContent value="revenue"><RevenueForecastTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 1: Fleet Health
// ═══════════════════════════════════════════
function FleetHealthTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/analytics/fleet-health');
      setData(res);
    } catch { toast.error('Failed to load fleet health'); } finally { setLoading(false); }
  };

  if (loading) return <AnalyticsSkeleton />;
  if (!data) return <p className="text-slate-500">No data available.</p>;

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card><CardContent className="p-4 text-center"><ScoreGauge score={data.fleetScore} label="Fleet Score" /></CardContent></Card>
        </motion.div>
        {[
          { label: 'Total Vehicles', value: data.summary.totalVehicles, icon: Truck, color: 'text-slate-700' },
          { label: 'Critical Risk', value: data.summary.criticalCount, icon: AlertTriangle, color: 'text-red-600' },
          { label: 'High Risk', value: data.summary.highRiskCount, icon: AlertTriangle, color: 'text-amber-600' },
          { label: 'Healthy', value: data.summary.lowRiskCount, icon: Shield, color: 'text-emerald-600' },
        ].map(k => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card><CardContent className="p-4 flex flex-col items-center justify-center h-full">
              <k.icon className={`w-6 h-6 ${k.color} mb-2`} />
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-slate-500">{k.label}</div>
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Vehicle Grade Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.gradeDistribution} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={90} label={({ grade, count }) => `${grade}: ${count}`}>
                  {data.gradeDistribution.map((d: any) => <Cell key={d.grade} fill={GRADE_COLORS[d.grade] || '#94a3b8'} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Type Averages */}
        <Card>
          <CardHeader><CardTitle className="text-base">Health Score by Vehicle Type</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.typeAverages} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="type" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => [`${v}/100`, 'Avg Score']} />
                <Bar dataKey="avgScore" radius={[0, 4, 4, 0]}>
                  {data.typeAverages.map((d: any, i: number) => {
                    const color = d.avgScore >= 80 ? '#10b981' : d.avgScore >= 60 ? '#3b82f6' : d.avgScore >= 40 ? '#f59e0b' : '#ef4444';
                    return <Cell key={i} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Vehicle Health Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Vehicle Health Details</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plate</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Maint. Due</TableHead>
                  <TableHead>Trips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.vehicles.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.plateNumber}</TableCell>
                    <TableCell className="text-slate-600">{v.make} {v.model}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={v.score} className="w-16 h-2" style={{ '--progress-color': GRADE_COLORS[v.grade] } as any} />
                        <span className="text-sm font-medium">{v.score}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge className={`${GRADE_COLORS[v.grade]} bg-opacity-10`} style={{ backgroundColor: GRADE_COLORS[v.grade] + '20', color: GRADE_COLORS[v.grade] }}>{v.grade}</Badge></TableCell>
                    <TableCell><Badge className={`${RISK_COLORS[v.riskLevel]} bg-opacity-10`} style={{ backgroundColor: RISK_COLORS[v.riskLevel] + '20', color: RISK_COLORS[v.riskLevel] }}>{v.riskLevel}</Badge></TableCell>
                    <TableCell className="text-slate-600">{v.driver?.name || '—'}</TableCell>
                    <TableCell>{v.upcomingMaintenance > 0 ? <Badge variant="outline" className="text-amber-600">{v.upcomingMaintenance}</Badge> : '—'}</TableCell>
                    <TableCell className="text-slate-600">{v.totalTrips}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top Issues */}
      {data.topIssues.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />Top Issues</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topIssues.slice(0, 10).map((issue: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <Badge style={{ backgroundColor: RISK_COLORS[issue.severity] + '20', color: RISK_COLORS[issue.severity] }} className="shrink-0 mt-0.5">{issue.severity}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{issue.vehiclePlate}</div>
                    <div className="text-xs text-slate-500">{issue.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 2: Driver Trends
// ═══════════════════════════════════════════
function DriverTrendsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/analytics/driver-trends');
      setData(res);
    } catch { toast.error('Failed to load driver trends'); } finally { setLoading(false); }
  };

  if (loading) return <AnalyticsSkeleton />;
  if (!data) return <p className="text-slate-500">No data available.</p>;

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card><CardContent className="p-4 text-center"><ScoreGauge score={data.avgFleetScore} label="Avg Driver Score" size={100} /></CardContent></Card>
        </motion.div>
        {data.riskDistribution.map((r: any) => (
          <motion.div key={r.risk} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card><CardContent className="p-4 flex flex-col items-center justify-center h-full">
              <div className="text-2xl font-bold" style={{ color: RISK_COLORS[r.risk] }}>{r.count}</div>
              <div className="text-xs text-slate-500 capitalize">{r.risk} Risk</div>
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Driver Score Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Drivers" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Pie */}
        <Card>
          <CardHeader><CardTitle className="text-base">Risk Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.riskDistribution} dataKey="count" nameKey="risk" cx="50%" cy="50%" outerRadius={90} label={({ risk, count }) => `${risk}: ${count}`}>
                  {data.riskDistribution.map((d: any) => <Cell key={d.risk} fill={RISK_COLORS[d.risk]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Driver Leaderboard */}
      <Card>
        <CardHeader><CardTitle className="text-base">Driver Performance Leaderboard</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Trips</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Harsh Brake</TableHead>
                  <TableHead>Overspeed</TableHead>
                  <TableHead>Idle %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.drivers.map((d: any, i: number) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-slate-500">{d.nationality || ''} {d.emirate ? `• ${d.emirate}` : ''}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={d.score} className="w-12 h-2" />
                        <span className="text-sm font-medium">{d.score}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {d.trend === 'improving' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                      {d.trend === 'declining' && <TrendingDown className="w-4 h-4 text-red-500" />}
                      {d.trend === 'stable' && <Activity className="w-4 h-4 text-blue-500" />}
                    </TableCell>
                    <TableCell><Badge style={{ backgroundColor: RISK_COLORS[d.riskLevel] + '20', color: RISK_COLORS[d.riskLevel] }}>{d.riskLevel}</Badge></TableCell>
                    <TableCell>{d.totalTrips}</TableCell>
                    <TableCell>{d.totalDistance ? `${fmtNum(Math.round(d.totalDistance))} km` : '—'}</TableCell>
                    <TableCell>{d.avgHarshBrakes}</TableCell>
                    <TableCell>{d.avgOverspeed}</TableCell>
                    <TableCell>{d.idleRatio}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Violation Leaderboard */}
      {data.violationLeaderboard.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />Violation Leaderboard</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.violationLeaderboard} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="harshBrakes" stackId="a" fill="#ef4444" name="Harsh Brakes" />
                <Bar dataKey="harshAccel" stackId="a" fill="#f59e0b" name="Harsh Accel" />
                <Bar dataKey="overspeed" stackId="a" fill="#3b82f6" name="Overspeed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 3: Maintenance Prediction
// ═══════════════════════════════════════════
function MaintenancePredictionTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/analytics/maintenance-prediction');
      setData(res);
    } catch { toast.error('Failed to load predictions'); } finally { setLoading(false); }
  };

  if (loading) return <AnalyticsSkeleton />;
  if (!data) return <p className="text-slate-500">No data available.</p>;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Vehicles', value: data.summary.totalVehicles, icon: Truck, color: 'text-slate-700', sub: '' },
          { label: 'Overdue', value: data.summary.overdueCount, icon: AlertTriangle, color: 'text-red-600', sub: 'Immediate action needed' },
          { label: 'High Urgency', value: data.summary.highUrgencyCount, icon: Clock, color: 'text-amber-600', sub: 'Within 7 days' },
          { label: 'Avg Days to Service', value: data.summary.avgDaysUntilService, icon: Calendar, color: 'text-blue-600', sub: 'Predicted' },
          { label: 'Predicted Cost', value: fmt(data.summary.totalPredictedCost), icon: DollarSign, color: 'text-emerald-600', sub: 'Next cycle' },
        ].map(k => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><k.icon className={`w-4 h-4 ${k.color}`} /><span className="text-xs text-slate-500">{k.label}</span></div>
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              {k.sub && <div className="text-[10px] text-slate-400 mt-0.5">{k.sub}</div>}
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Maintenance Cost Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.costTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: number) => [fmt(v), 'Cost']} />
                <Area type="monotone" dataKey="cost" stroke="#10b981" fill="#10b98120" strokeWidth={2} name="Cost (AED)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Type Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Maintenance by Type</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.typeDistribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90} label={({ type, count }) => `${type}: ${count}`}>
                  {data.typeDistribution.map((d: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Predictions Table */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />AI Maintenance Predictions</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plate</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Days Until</TableHead>
                  <TableHead>Predicted Date</TableHead>
                  <TableHead>Predicted Cost</TableHead>
                  <TableHead>Mileage</TableHead>
                  <TableHead>Avg Freq.</TableHead>
                  <TableHead>Past Maint.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.predictions.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.plateNumber}</TableCell>
                    <TableCell className="text-slate-600">{p.make} {p.model}</TableCell>
                    <TableCell><Badge style={{ backgroundColor: URGENCY_COLORS[p.urgency] + '20', color: URGENCY_COLORS[p.urgency] }}>{p.urgency}</Badge></TableCell>
                    <TableCell>
                      <span className={p.daysUntilNextMaintenance <= 7 ? 'text-red-600 font-bold' : p.daysUntilNextMaintenance <= 30 ? 'text-amber-600 font-medium' : ''}>
                        {p.daysUntilNextMaintenance <= 0 ? 'Overdue' : `${p.daysUntilNextMaintenance} days`}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">{new Date(p.predictedNextDate).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}</TableCell>
                    <TableCell className="text-slate-600">{fmt(p.predictedCost)}</TableCell>
                    <TableCell className="text-slate-600">{p.mileage ? `${fmtNum(p.mileage)} km` : '—'}</TableCell>
                    <TableCell className="text-slate-600">{p.avgFrequencyDays}d</TableCell>
                    <TableCell className="text-slate-600">{p.maintenanceCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 4: Revenue Forecast
// ═══════════════════════════════════════════
function RevenueForecastTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/analytics/revenue-forecast');
      setData(res);
    } catch { toast.error('Failed to load revenue data'); } finally { setLoading(false); }
  };

  if (loading) return <AnalyticsSkeleton />;
  if (!data) return <p className="text-slate-500">No data available.</p>;

  // Combine historical + forecast for chart
  const combinedChart = [
    ...data.historicalRevenue.map((m: any) => ({ month: m.month, actual: m.revenue, forecast: null, upper: null, lower: null })),
    ...data.forecast.map((f: any, i: number) => ({ month: f.month, actual: null, forecast: f.predicted, upper: f.upper, lower: f.lower })),
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Monthly Recurring', value: fmt(data.summary.monthlyRecurring), icon: Activity, color: 'text-emerald-600', sub: `${data.summary.activeSubscriptions} subscriptions` },
          { label: 'Annual Recurring', value: fmt(data.summary.annualRecurring), icon: DollarSign, color: 'text-blue-600', sub: `${data.summary.totalSubscribedVehicles} vehicles` },
          { label: 'MoM Growth', value: `${data.summary.momGrowth > 0 ? '+' : ''}${data.summary.momGrowth}%`, icon: data.summary.momGrowth >= 0 ? TrendingUp : TrendingDown, color: data.summary.momGrowth >= 0 ? 'text-emerald-600' : 'text-red-600', sub: 'Month over Month' },
          { label: 'QoQ Growth', value: `${data.summary.qoqGrowth > 0 ? '+' : ''}${data.summary.qoqGrowth}%`, icon: BarChart3, color: data.summary.qoqGrowth >= 0 ? 'text-emerald-600' : 'text-red-600', sub: 'Quarter over Quarter' },
          { label: 'Pipeline Potential', value: fmt(data.summary.pipelineMonthlyPotential), icon: Target, color: 'text-purple-600', sub: `${data.summary.totalPipelineVehicles} vehicles` },
        ].map(k => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><k.icon className={`w-4 h-4 ${k.color}`} /><span className="text-xs text-slate-500">{k.label}</span></div>
              <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
              {k.sub && <div className="text-[10px] text-slate-400 mt-0.5">{k.sub}</div>}
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      {/* Revenue Chart (Historical + Forecast) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Revenue: Historical & 6-Month Forecast</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={combinedChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [fmt(v)]} />
              <Legend />
              <Area type="monotone" dataKey="actual" stroke="#10b981" fill="#10b98130" strokeWidth={2} name="Actual Revenue" connectNulls={false} />
              <Area type="monotone" dataKey="upper" stroke="transparent" fill="#3b82f610" name="Upper Bound" connectNulls={false} />
              <Area type="monotone" dataKey="lower" stroke="transparent" fill="#ffffff" name="Lower Bound" connectNulls={false} />
              <Line type="monotone" dataKey="forecast" stroke="#3b82f6" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 3 }} name="Forecast" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 justify-center">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Actual</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" style={{ borderTop: '2px dashed #3b82f6' }} /> Forecast</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500/10 inline-block rounded" /> Confidence Band</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Active Subscriptions</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Vehicles</TableHead>
                    <TableHead>Monthly</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.subscriptions.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.organization}</TableCell>
                      <TableCell><Badge variant="outline">{s.plan}</Badge></TableCell>
                      <TableCell>{s.vehicleCount}</TableCell>
                      <TableCell className="text-emerald-600 font-medium">{fmt(s.monthlyAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Breakdown + Churn Risk */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Invoice Breakdown</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.invoiceBreakdown} dataKey="total" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, total }) => `${status}: ${fmt(total)}`}>
                    {data.invoiceBreakdown.map((d: any, i: number) => {
                      const colors: Record<string, string> = { paid: '#10b981', pending: '#f59e0b', overdue: '#ef4444', draft: '#94a3b8' };
                      return <Cell key={i} fill={colors[d.status] || '#94a3b8'} />;
                    })}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {data.churnRisks.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />Churn Risk (Overdue)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.churnRisks.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-100">
                    <div>
                      <div className="text-sm font-medium text-red-800">{c.organization}</div>
                      <div className="text-xs text-red-600">{c.invoiceNumber} • Due: {new Date(c.dueDate).toLocaleDateString('en-AE')}</div>
                    </div>
                    <div className="text-sm font-bold text-red-700">{fmt(c.amount)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton Loader ─────────────────────
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
      <Card><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
    </div>
  );
}
