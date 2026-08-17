'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Plus, Search, Pencil, Trash2, Truck, Users, Cpu, Gauge,
  ChevronLeft, ChevronRight
} from 'lucide-react';

import { authFetch } from '@/lib/api';
import { STATUS_COLORS, VEHICLE_TYPES, EMIRATES } from '@/lib/constants';
import type { Vehicle } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';

export default function VehiclesView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);
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

  const [editForm, setEditForm] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    vehicleType: '',
    vin: '',
    color: '',
    status: 'active',
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

  const handleEdit = (v: Vehicle) => {
    setEditingVehicle(v);
    setEditForm({
      plateNumber: v.plateNumber || '',
      make: v.make || '',
      model: v.model || '',
      year: v.year ? String(v.year) : '',
      vehicleType: v.vehicleType || '',
      vin: v.vin || '',
      color: v.color || '',
      status: v.status || 'active',
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingVehicle || !editForm.plateNumber.trim()) {
      toast.error('Plate number is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/vehicles/${editingVehicle.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...editForm,
          year: editForm.year ? parseInt(editForm.year) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update vehicle');
        return;
      }
      toast.success('Vehicle updated successfully');
      setEditOpen(false);
      setEditingVehicle(null);
      fetchVehicles();
    } catch {
      toast.error('Failed to update vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (v: Vehicle) => {
    setDeletingVehicle(v);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingVehicle) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/vehicles/${deletingVehicle.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to delete vehicle');
        return;
      }
      toast.success('Vehicle deleted successfully');
      setDeleteOpen(false);
      setDeletingVehicle(null);
      fetchVehicles();
    } catch {
      toast.error('Failed to delete vehicle');
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
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => handleEdit(v)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(v)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500 text-right">Actions</TableHead>
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600" onClick={() => handleEdit(v)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600" onClick={() => handleDelete(v)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
          {/* Edit Dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Vehicle</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Plate Number *</Label>
                  <Input value={editForm.plateNumber} onChange={(e) => setEditForm({ ...editForm, plateNumber: e.target.value })} placeholder="e.g. DXB A 12345" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Make</Label>
                    <Input value={editForm.make} onChange={(e) => setEditForm({ ...editForm, make: e.target.value })} placeholder="e.g. Toyota" />
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} placeholder="e.g. Hilux" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Input type="number" value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} placeholder="2024" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={editForm.vehicleType} onValueChange={(v) => setEditForm({ ...editForm, vehicleType: v })}>
                      <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <Input value={editForm.color} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} placeholder="White" />
                  </div>
                  <div className="space-y-2">
                    <Label>VIN</Label>
                    <Input value={editForm.vin} onChange={(e) => setEditForm({ ...editForm, vin: e.target.value })} placeholder="Vehicle Identification Number" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleEditSubmit} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete Vehicle</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-slate-600">
                Are you sure you want to delete <span className="font-semibold">{deletingVehicle?.plateNumber}</span>? This action cannot be undone. All linked trips and maintenance records will remain.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDeleteConfirm} disabled={submitting}>
                  {submitting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
