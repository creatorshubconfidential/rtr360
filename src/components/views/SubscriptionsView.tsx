'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  CreditCard, Plus, Search, ChevronLeft, ChevronRight,
  CheckCircle2, PauseCircle, XCircle, Clock, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';


import { authFetch } from '@/lib/api';
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-600',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  active: CheckCircle2,
  paused: PauseCircle,
  cancelled: XCircle,
  expired: Clock,
};

interface Plan {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceAnnual: number | null;
  vehicleLimit: number;
  features: string | null;
  active: boolean;
}

interface Subscription {
  id: string;
  status: string;
  vehicleCount: number;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  plan: Plan | null;
  organization: { id: string; name: string } | null;
}

export default function SubscriptionsView() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    planId: '',
    startsAt: new Date().toISOString().split('T')[0],
  });

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await authFetch(`/api/subscriptions?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setSubscriptions(data.subscriptions || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch { toast.error('Failed to load subscriptions'); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  const fetchPlans = async () => {
    try {
      const res = await authFetch('/api/subscriptions');
    } catch { /* plans fetched from subscription data */ }
  };

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  const handleCreate = async () => {
    if (!form.planId) { toast.error('Please select a plan'); return; }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ planId: form.planId, startsAt: form.startsAt }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create subscription'); return; }
      toast.success('Subscription created successfully');
      setCreateOpen(false);
      setForm({ planId: '', startsAt: new Date().toISOString().split('T')[0] });
      fetchSubscriptions();
    } catch { toast.error('Failed to create subscription'); }
    finally { setSubmitting(false); }
  };

  const handleStatusUpdate = async (subId: string, newStatus: string) => {
    try {
      const res = await authFetch(`/api/subscriptions/${subId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to update'); return; }
      toast.success('Subscription updated');
      fetchSubscriptions();
    } catch { toast.error('Failed to update subscription'); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' });

  const activeCount = subscriptions.filter(s => s.status === 'active').length;
  const monthlyRevenue = subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.plan?.priceMonthly || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Subscriptions</h2>
            <p className="text-sm text-slate-500">Manage billing plans & subscriptions</p>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-sm px-2.5">{total}</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"><Plus className="w-4 h-4" /> New Subscription</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Subscription</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Input placeholder="Enter Plan ID" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: CreditCard, label: 'Total Subscriptions', value: total, color: 'bg-emerald-100 text-emerald-600' },
          { icon: Zap, label: 'Active', value: activeCount, color: 'bg-green-100 text-green-600' },
          { icon: CreditCard, label: 'Monthly Revenue', value: `AED ${monthlyRevenue.toLocaleString()}`, color: 'bg-blue-100 text-blue-600' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="rounded-xl border-slate-200/60 shadow-sm">
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}><s.icon className="w-5 h-5" /></div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900">{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['active', 'paused', 'cancelled', 'expired'].map(s => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <Card className="rounded-xl border-slate-200/60 shadow-sm"><div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card>
      ) : subscriptions.length === 0 ? (
        <Card className="rounded-xl border-slate-200/60">
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <CreditCard className="w-10 h-10 mb-3" /><p className="text-sm font-medium">No subscriptions found</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subscriptions.map((sub) => {
              const StatusIcon = STATUS_ICONS[sub.status] || Clock;
              return (
                <motion.div key={sub.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="rounded-xl border-slate-200/60 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${STATUS_COLORS[sub.status] || 'bg-slate-100 text-slate-600'}`}>
                            <StatusIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{sub.plan?.name || 'No Plan'}</div>
                            <div className="text-xs text-slate-500">{sub.organization?.name || ''}</div>
                          </div>
                        </div>
                        <Badge className={`text-[11px] ${STATUS_COLORS[sub.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                          {sub.status}
                        </Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-lg font-bold text-slate-900">{sub.vehicleCount}</div>
                          <div className="text-[11px] text-slate-500">Vehicles</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-900">AED {(sub.plan?.priceMonthly || 0).toLocaleString()}</div>
                          <div className="text-[11px] text-slate-500">/month</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-700">{formatDate(sub.startsAt)}</div>
                          <div className="text-[11px] text-slate-500">Start Date</div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                          {sub.endsAt ? `Expires: ${formatDate(sub.endsAt)}` : 'No expiry'}
                        </div>
                        <Select onValueChange={(v) => handleStatusUpdate(sub.id, v)}>
                          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Update..." /></SelectTrigger>
                          <SelectContent>
                            {['active', 'paused', 'cancelled', 'expired'].map(s => (
                              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
