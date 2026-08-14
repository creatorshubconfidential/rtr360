'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Wrench, Plus, Search, ChevronLeft, ChevronRight, Calendar,
  DollarSign, AlertCircle, CheckCircle2, Clock, XCircle, Truck,
  Download,
} from 'lucide-react';
import { exportCSV, MAINTENANCE_COLUMNS } from '@/lib/export';
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
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

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

const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'Upcoming',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TYPE_LABELS: Record<string, string> = {
  oil_change: 'Oil Change',
  tire_rotation: 'Tire Rotation',
  brake_service: 'Brake Service',
  engine_service: 'Engine Service',
  battery_replacement: 'Battery Replacement',
  ac_service: 'AC Service',
  general_service: 'General Service',
  inspection: 'Inspection',
  repair: 'Repair',
};

const MAINTENANCE_TYPES = [
  'oil_change', 'tire_rotation', 'brake_service', 'engine_service',
  'battery_replacement', 'ac_service', 'general_service', 'inspection', 'repair',
];

const STATUS_OPTIONS = ['upcoming', 'scheduled', 'in_progress', 'completed', 'cancelled'];

const statusIcon = (status: string) => {
  switch (status) {
    case 'upcoming': return <Calendar className="w-3.5 h-3.5" />;
    case 'scheduled': return <Clock className="w-3.5 h-3.5" />;
    case 'in_progress': return <AlertCircle className="w-3.5 h-3.5" />;
    case 'completed': return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'cancelled': return <XCircle className="w-3.5 h-3.5" />;
    default: return null;
  }
};

interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  vehicle?: { plateNumber?: string } | null;
  plateNumber?: string;
  type: string;
  description: string | null;
  status: string;
  scheduledDate: string;
  completedDate: string | null;
  cost: number;
  createdAt: string;
  updatedAt: string;
}

export default function MaintenanceView() {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [form, setForm] = useState({
    vehicleId: '',
    type: '',
    description: '',
    scheduledDate: '',
    cost: '',
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await authFetch(`/api/maintenance?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setRecords(data.maintenanceRecords || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleCreate = async () => {
    if (!form.vehicleId.trim()) {
      toast.error('Vehicle ID is required');
      return;
    }
    if (!form.type) {
      toast.error('Please select a maintenance type');
      return;
    }
    if (!form.scheduledDate) {
      toast.error('Scheduled date is required');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        vehicleId: form.vehicleId,
        type: form.type,
        scheduledDate: form.scheduledDate,
      };
      if (form.description.trim()) body.description = form.description;
      if (form.cost) body.cost = parseFloat(form.cost);

      const res = await authFetch('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Maintenance record created successfully');
        setCreateOpen(false);
        setForm({ vehicleId: '', type: '', description: '', scheduledDate: '', cost: '' });
        fetchRecords();
      } else {
        toast.error(data.error || 'Failed to create maintenance record');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/maintenance/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(`Status updated to ${STATUS_LABELS[status] || status}`);
        fetchRecords();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to update status');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const getPlateNumber = (record: MaintenanceRecord) => {
    if (record.plateNumber) return record.plateNumber;
    if (record.vehicle?.plateNumber) return record.vehicle.plateNumber;
    return record.vehicleId;
  };

  const formatAED = (amount: number) => {
    return `AED ${amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-AE', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  // Summary counts
  const upcomingCount = records.filter((r) => r.status === 'upcoming').length;
  const inProgressCount = records.filter((r) => r.status === 'in_progress').length;
  const completedCount = records.filter((r) => r.status === 'completed').length;
  const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-0">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Records</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-emerald-600">{total}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-0">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">Upcoming</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-blue-600">{upcomingCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-0">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">In Progress</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-orange-600">{inProgressCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-0">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Cost</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-slate-700">{formatAED(totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Maintenance</h2>
            <p className="text-sm text-slate-500">Vehicle service &amp; maintenance records</p>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-sm px-2.5">
            {total}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <Plus className="w-4 h-4" /> New Record
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Maintenance Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Vehicle ID *</Label>
                <Input
                  placeholder="Enter vehicle ID or plate number"
                  value={form.vehicleId}
                  onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Maintenance Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe the maintenance work..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Scheduled Date *</Label>
                  <Input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cost (AED)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCreate}
                disabled={submitting}
              >
                {submitting ? 'Creating...' : 'Create Record'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => exportCSV({ data: maintenanceRecords, filename: 'maintenance', columns: MAINTENANCE_COLUMNS })}
            disabled={maintenanceRecords.length === 0}
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by vehicle plate..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {MAINTENANCE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <Card className="rounded-xl border-slate-200/60">
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Wrench className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No maintenance records found</p>
            <p className="text-xs mt-1">Create your first maintenance record</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
            {records.map((record) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="rounded-xl border-slate-200/60 shadow-sm hover:border-emerald-200 transition-colors">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Truck className="w-4.5 h-4.5 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{getPlateNumber(record)}</p>
                          <p className="text-xs text-slate-500">{TYPE_LABELS[record.type] || record.type}</p>
                        </div>
                      </div>
                      <Badge
                        className={`text-[11px] gap-1 ${STATUS_COLORS[record.status] || 'bg-slate-100 text-slate-600'} border-0`}
                      >
                        {statusIcon(record.status)} {STATUS_LABELS[record.status] || record.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {formatDate(record.scheduledDate)}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <DollarSign className="w-3.5 h-3.5" /> {formatAED(record.cost || 0)}
                      </span>
                    </div>
                    <Select
                      value={record.status}
                      onValueChange={(v) => updateStatus(record.id, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Vehicle</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Scheduled Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Cost</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Truck className="w-4 h-4 text-slate-500" />
                        </div>
                        <span className="font-semibold text-sm text-slate-800">{getPlateNumber(record)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {TYPE_LABELS[record.type] || record.type}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-[11px] gap-1 ${STATUS_COLORS[record.status] || 'bg-slate-100 text-slate-600'} border-0`}
                      >
                        {statusIcon(record.status)} {STATUS_LABELS[record.status] || record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDate(record.scheduledDate)}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-700">
                      {formatAED(record.cost || 0)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={record.status}
                        onValueChange={(v) => updateStatus(record.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3">
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
    </div>
  );
}
