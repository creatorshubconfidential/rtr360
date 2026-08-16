'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Route, Plus, Search, ChevronLeft, ChevronRight, Trash2,
  Edit, Truck, Gauge, Clock, MapPin, Zap, Timer, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface Vehicle {
  id: string;
  plateNumber: string;
  make?: string | null;
  model?: string | null;
}

interface Trip {
  id: string;
  vehicleId: string;
  driverName: string;
  startTime: string;
  endTime: string | null;
  distance: number;
  duration: number;
  maxSpeed: number;
  avgSpeed: number;
  idleTime: number;
  overspeedCount: number;
  harshBrakes: number;
  harshAccel: number;
  status: string;
  vehicle: Vehicle;
}

const initialForm = {
  vehicleId: '',
  driverName: '',
  startTime: '',
  endTime: '',
  distance: '',
  duration: '',
  maxSpeed: '',
  avgSpeed: '',
  idleTime: '',
  overspeedCount: '0',
  harshBrakes: '0',
  harshAccel: '0',
  status: 'completed',
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  return `${Math.floor(seconds / 60)}m`;
}

function formatDateTime(v: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TripsView() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await authFetch(`/api/trips?${params}`);
      const data = await res.json();
      if (res.ok) {
        setTrips(data.trips || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await authFetch('/api/vehicles?limit=200');
      const data = await res.json();
      if (res.ok) setVehicles(data.vehicles || []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const completedCount = trips.filter((t) => t.status === 'completed').length;
  const inProgressCount = trips.filter((t) => t.status === 'in_progress').length;
  const totalDistance = trips.reduce((s, t) => s + (t.distance || 0), 0);
  const avgSpeedOverall = trips.length > 0
    ? Math.round(trips.reduce((s, t) => s + (t.avgSpeed || 0), 0) / trips.length)
    : 0;

  const openCreate = () => {
    setEditingTrip(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const openEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setForm({
      vehicleId: trip.vehicleId,
      driverName: trip.driverName,
      startTime: trip.startTime ? trip.startTime.slice(0, 16) : '',
      endTime: trip.endTime ? trip.endTime.slice(0, 16) : '',
      distance: String(trip.distance || ''),
      duration: String(trip.duration || ''),
      maxSpeed: String(trip.maxSpeed || ''),
      avgSpeed: String(trip.avgSpeed || ''),
      idleTime: String(trip.idleTime || ''),
      overspeedCount: String(trip.overspeedCount || 0),
      harshBrakes: String(trip.harshBrakes || 0),
      harshAccel: String(trip.harshAccel || 0),
      status: trip.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.vehicleId) {
      toast.error('Please select a vehicle');
      return;
    }
    if (!form.startTime) {
      toast.error('Start time is required');
      return;
    }
    setSubmitting(true);
    try {
      const url = editingTrip ? `/api/trips/${editingTrip.id}` : '/api/trips';
      const method = editingTrip ? 'PATCH' : 'POST';
      const body: any = {
        vehicleId: form.vehicleId,
        driverName: form.driverName,
        startTime: form.startTime,
        endTime: form.endTime || null,
        distance: parseFloat(form.distance) || 0,
        duration: parseInt(form.duration, 10) || 0,
        maxSpeed: parseFloat(form.maxSpeed) || 0,
        avgSpeed: parseFloat(form.avgSpeed) || 0,
        idleTime: parseInt(form.idleTime, 10) || 0,
        overspeedCount: parseInt(form.overspeedCount, 10) || 0,
        harshBrakes: parseInt(form.harshBrakes, 10) || 0,
        harshAccel: parseInt(form.harshAccel, 10) || 0,
        status: form.status,
      };
      const res = await authFetch(url, { method, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(editingTrip ? 'Trip updated' : 'Trip created');
        setDialogOpen(false);
        fetchTrips();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Operation failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/api/trips/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Trip deleted');
        setDeleteTarget(null);
        fetchTrips();
      } else {
        toast.error('Failed to delete trip');
      }
    } catch {
      toast.error('Network error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Route className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Trips</p>
              <p className="text-xl font-bold text-slate-900">{trips.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Completed</p>
              <p className="text-xl font-bold text-emerald-600">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Timer className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">In Progress</p>
              <p className="text-xl font-bold text-blue-600">{inProgressCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Dist.</p>
              <p className="text-xl font-bold text-amber-700">{totalDistance.toFixed(0)} <span className="text-xs font-normal">km</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Gauge className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Avg Speed</p>
              <p className="text-xl font-bold text-purple-700">{avgSpeedOverall} <span className="text-xs font-normal">km/h</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by driver or plate..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />New Trip
          </Button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <Card className="rounded-xl border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Vehicle</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Driver</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Start Time</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">End Time</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Distance</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Duration</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Max Spd</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Avg Spd</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Idle</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Overspd</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Harsh</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 13 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : trips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12">
                      <Route className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No trips found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  trips.map((trip, idx) => (
                    <motion.tr
                      key={trip.id}
                      className="border-b last:border-0 hover:bg-slate-50/50 transition-colors"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Truck className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-bold text-sm text-slate-900">
                            {trip.vehicle?.plateNumber || '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700">{trip.driverName || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600">{formatDateTime(trip.startTime)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600">{formatDateTime(trip.endTime)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-slate-700">{trip.distance?.toFixed(1) || '0'} km</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{formatDuration(trip.duration)}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${trip.maxSpeed > 120 ? 'text-red-600' : 'text-slate-700'}`}>
                          {trip.maxSpeed || 0} km/h
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{trip.avgSpeed || 0} km/h</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{formatDuration(trip.idleTime)}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${(trip.overspeedCount || 0) > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                          {trip.overspeedCount || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {(trip.harshBrakes || 0) + (trip.harshAccel || 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[trip.status] || ''}`}>
                          {STATUS_LABELS[trip.status] || trip.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(trip)}>
                            <Edit className="w-3 h-3 text-slate-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setDeleteTarget(trip)}>
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Mobile + Tablet Cards */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-xl border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
              </CardContent>
            </Card>
          ))
        ) : trips.length === 0 ? (
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-8 text-center">
              <Route className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No trips found</p>
            </CardContent>
          </Card>
        ) : (
          trips.map((trip, idx) => (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <Card className="rounded-xl border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Truck className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900">
                          {trip.vehicle?.plateNumber || '—'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {[trip.vehicle?.make, trip.vehicle?.model].filter(Boolean).join(' ')}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[trip.status] || ''}`}>
                      {STATUS_LABELS[trip.status] || trip.status}
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    <span className="text-slate-400">Driver: </span>{trip.driverName || '—'}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase">Distance</p>
                      <p className="text-sm font-bold text-slate-900">{trip.distance?.toFixed(1) || 0} km</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase">Duration</p>
                      <p className="text-sm font-bold text-slate-900">{formatDuration(trip.duration)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase">Max Speed</p>
                      <p className={`text-sm font-bold ${trip.maxSpeed > 120 ? 'text-red-600' : 'text-slate-900'}`}>
                        {trip.maxSpeed || 0} km/h
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase">Avg Speed</p>
                      <p className="text-sm font-medium text-slate-700">{trip.avgSpeed || 0} km/h</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase">Overspeeds</p>
                      <p className={`text-sm font-medium ${(trip.overspeedCount || 0) > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {trip.overspeedCount || 0}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase">Harsh</p>
                      <p className="text-sm font-medium text-slate-700">
                        {(trip.harshBrakes || 0) + (trip.harshAccel || 0)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {formatDateTime(trip.startTime)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(trip)}>
                        <Edit className="w-3 h-3 mr-1" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => setDeleteTarget(trip)}>
                        <Trash2 className="w-3 h-3 mr-1" />Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Route className="w-4 h-4 text-emerald-600" />
              </div>
              {editingTrip ? 'Edit Trip' : 'New Trip Entry'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Vehicle *</Label>
              <Select value={form.vehicleId} onValueChange={(v) => setForm({ ...form, vehicleId: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plateNumber} {[v.make, v.model].filter(Boolean).join(' ') && ` - ${[v.make, v.model].filter(Boolean).join(' ')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Driver Name</Label>
              <Input
                placeholder="Driver name"
                value={form.driverName}
                onChange={(e) => setForm({ ...form, driverName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Start Time *</Label>
                <Input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">End Time</Label>
                <Input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Distance (km)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.distance}
                  onChange={(e) => setForm({ ...form, distance: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Duration (sec)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Max Speed (km/h)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.maxSpeed}
                  onChange={(e) => setForm({ ...form, maxSpeed: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Avg Speed (km/h)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.avgSpeed}
                  onChange={(e) => setForm({ ...form, avgSpeed: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Idle Time (sec)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.idleTime}
                  onChange={(e) => setForm({ ...form, idleTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Overspeeds</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.overspeedCount}
                  onChange={(e) => setForm({ ...form, overspeedCount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Harsh Brakes</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.harshBrakes}
                  onChange={(e) => setForm({ ...form, harshBrakes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Harsh Accel</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.harshAccel}
                  onChange={(e) => setForm({ ...form, harshAccel: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : editingTrip ? 'Update Trip' : 'Create Trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the trip for{' '}
              <strong>{deleteTarget?.vehicle?.plateNumber}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
