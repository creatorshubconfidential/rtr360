'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Wrench, Plus, Search, ChevronLeft, ChevronRight, MoreVertical,
  Calendar, Clock, MapPin, CheckCircle2, PlayCircle, AlertTriangle, XCircle, Eye, RotateCcw
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'UAQ', 'RAK', 'Fujairah'];

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  testing: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
};

const STATUS_STEPS = ['scheduled', 'in_progress', 'testing', 'completed'];

interface VehicleOption { id: string; plateNumber: string; make: string | null; model: string | null; vehicleType: string | null; }
interface DeviceOption { id: string; imei: string; model: string | null; deviceType: string | null; status: string; }
interface TechnicianOption { id: string; name: string; phone: string; status: string; }

interface Installation {
  id: string;
  installationNumber: string;
  status: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  completedAt: string | null;
  emirate: string | null;
  location: string | null;
  testResult: string | null;
  gpsSignal: boolean | null;
  powerWiring: boolean | null;
  antennaMounted: boolean | null;
  notes: string | null;
  technician: { id: string; name: string; phone: string } | null;
  vehicle: VehicleOption | null;
  device: DeviceOption | null;
  createdAt: string;
}


export default function InstallationsView() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [detailInst, setDetailInst] = useState<Installation | null>(null);

  // Lookup data
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);

  const [form, setForm] = useState({ vehicleId: '', deviceId: '', technicianId: '', scheduledDate: '', scheduledTime: '', emirate: '', location: '', notes: '' });

  const fetchInstallations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await authFetch(`/api/installations?${params}`);
      const data = await res.json();
      if (res.ok) { setInstallations(data.installations); setTotalPages(data.pagination.totalPages); setCounts(data.counts || {}); }
    } catch {} finally { setLoading(false); }
  }, [page, search, statusFilter]);

  const fetchLookups = useCallback(async () => {
    try {
      const [vRes, dRes, tRes] = await Promise.all([
        authFetch('/api/vehicles?limit=100'),
        authFetch('/api/devices?status=warehouse&limit=100'),
        authFetch('/api/technicians?status=active&limit=50'),
      ]);
      const vData = await vRes.json();
      const dData = await dRes.json();
      const tData = await tRes.json();
      if (vRes.ok) setVehicles(vData.vehicles);
      if (dRes.ok) setDevices(dData.devices);
      if (tRes.ok) setTechnicians(tData.technicians);
    } catch {}
  }, []);

  useEffect(() => { fetchInstallations(); }, [fetchInstallations]);
  useEffect(() => { if (createOpen) fetchLookups(); }, [createOpen, fetchLookups]);

  const handleCreate = async () => {
    if (!form.vehicleId || !form.deviceId) { toast.error('Vehicle and Device are required'); return; }
    try {
      const res = await authFetch('/api/installations', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Installation ${data.installation.installationNumber} scheduled`);
        setCreateOpen(false);
        setForm({ vehicleId: '', deviceId: '', technicianId: '', scheduledDate: '', scheduledTime: '', emirate: '', location: '', notes: '' });
        fetchInstallations();
      } else { toast.error(data.error || 'Failed'); }
    } catch { toast.error('Network error'); }
  };

  const advanceStatus = async (id: string, newStatus: string) => {
    try {
      const res = await authFetch(`/api/installations/${id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      if (res.ok) { toast.success(`Installation moved to ${newStatus.replace('_', ' ')}`); fetchInstallations(); if (detailInst?.id === id) setDetailInst(null); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error('Network error'); }
  };

  return (
    <div className="space-y-4">
      {/* Pipeline Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_STEPS.map((s) => (
          <Card key={s} className={`${STATUS_COLORS[s]} border-0 cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={() => { setStatusFilter(statusFilter === s ? '' : s); setPage(1); }}>
            <CardContent className="p-3">
              <p className="text-[10px] font-medium uppercase opacity-70">{s.replace('_', ' ')}</p>
              <p className="text-xl font-bold mt-1">{counts[s] || 0}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-red-50 border-0"><CardContent className="p-3"><p className="text-[10px] font-medium text-red-400 uppercase">Failed</p><p className="text-xl font-bold text-red-700">{counts.failed || 0}</p></CardContent></Card>
      </div>

      {/* Search + Create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search installation number, location..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[150px] h-10"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="testing">Testing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-10"><Plus className="w-4 h-4 mr-1.5" /> Schedule Installation</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Schedule New Installation</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2"><Label>Vehicle *</Label>
                <Select value={form.vehicleId} onValueChange={(v) => setForm({...form, vehicleId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plateNumber} — {[v.make, v.model].filter(Boolean).join(' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Device (from warehouse) *</Label>
                <Select value={form.deviceId} onValueChange={(v) => setForm({...form, deviceId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                  <SelectContent>{devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.imei} — {d.model || d.deviceType || 'Device'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Technician</Label>
                <Select value={form.technicianId} onValueChange={(v) => setForm({...form, technicianId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.phone})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Emirate</Label>
                <Select value={form.emirate} onValueChange={(v) => setForm({...form, emirate: v})}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{EMIRATES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Scheduled Date</Label><Input type="date" value={form.scheduledDate} onChange={(e) => setForm({...form, scheduledDate: e.target.value})} /></div>
              <div><Label>Scheduled Time</Label><Input type="time" value={form.scheduledTime} onChange={(e) => setForm({...form, scheduledTime: e.target.value})} /></div>
              <div className="col-span-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} placeholder="e.g. Al Quoz Industrial Area" /></div>
              <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate}>Schedule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading installations...</div>
        ) : installations.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No installations found</p>
            <p className="text-sm text-slate-400 mt-1">Schedule your first installation</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Installation #</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Vehicle</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Device</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Technician</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Schedule</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Location</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installations.map((inst) => (
                <TableRow key={inst.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setDetailInst(inst)}>
                  <TableCell><span className="font-mono text-sm font-semibold">{inst.installationNumber}</span></TableCell>
                  <TableCell className="font-medium text-sm">{inst.vehicle?.plateNumber || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{inst.device?.imei || '—'}</TableCell>
                  <TableCell className="text-sm">{inst.technician?.name || <span className="text-slate-400">Unassigned</span>}</TableCell>
                  <TableCell>
                    <div className="text-sm">{inst.scheduledDate ? new Date(inst.scheduledDate).toLocaleDateString('en-AE') : '—'}</div>
                    {inst.scheduledTime && <div className="text-xs text-slate-400">{inst.scheduledTime}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{inst.location || inst.emirate || '—'}</TableCell>
                  <TableCell><Badge className={`text-[11px] ${STATUS_COLORS[inst.status] || ''} border-0`}>{inst.status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="w-8 h-8"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailInst(inst)}><Eye className="w-4 h-4 mr-2" />View Details</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {inst.status === 'scheduled' && <DropdownMenuItem onClick={() => advanceStatus(inst.id, 'in_progress')}><PlayCircle className="w-4 h-4 mr-2 text-amber-600" />Start Installation</DropdownMenuItem>}
                        {inst.status === 'in_progress' && <DropdownMenuItem onClick={() => advanceStatus(inst.id, 'testing')}><AlertTriangle className="w-4 h-4 mr-2 text-purple-600" />Move to Testing</DropdownMenuItem>}
                        {inst.status === 'testing' && <DropdownMenuItem onClick={() => advanceStatus(inst.id, 'completed')}><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />Mark Completed</DropdownMenuItem>}
                        {inst.status === 'failed' && <DropdownMenuItem onClick={() => advanceStatus(inst.id, 'scheduled')}><RotateCcw className="w-4 h-4 mr-2 text-blue-600" />Reschedule</DropdownMenuItem>}
                        {(inst.status === 'scheduled' || inst.status === 'in_progress') && (
                          <DropdownMenuItem className="text-red-600" onClick={() => advanceStatus(inst.id, 'cancelled')}><XCircle className="w-4 h-4 mr-2" />Cancel</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}><ChevronLeft className="w-4 h-4 mr-1" /> Prev</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailInst} onOpenChange={() => setDetailInst(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Wrench className="w-5 h-5 text-emerald-600" />
              {detailInst?.installationNumber}
              <Badge className={`${STATUS_COLORS[detailInst?.status || ''] || ''} border-0`}>{detailInst?.status?.replace('_', ' ')}</Badge>
            </DialogTitle>
          </DialogHeader>
          {detailInst && (
            <div className="space-y-4">
              {/* Status Progress */}
              <div className="flex items-center gap-1">
                {STATUS_STEPS.map((s, i) => {
                  const currentIdx = STATUS_STEPS.indexOf(detailInst.status);
                  const isDone = i <= currentIdx;
                  return (
                    <div key={s} className="flex items-center gap-1 flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] hidden sm:block ${isDone ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>{s.replace('_', ' ')}</span>
                      {i < STATUS_STEPS.length - 1 && <div className={`flex-1 h-0.5 ${isDone ? 'bg-emerald-600' : 'bg-slate-200'}`} />}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-blue-50 rounded-lg"><span className="text-blue-400 text-xs">Vehicle</span><p className="font-bold text-blue-900">{detailInst.vehicle?.plateNumber || '—'}</p></div>
                <div className="p-3 bg-purple-50 rounded-lg"><span className="text-purple-400 text-xs">Device IMEI</span><p className="font-bold font-mono text-purple-900">{detailInst.device?.imei || '—'}</p></div>
                <div><span className="text-slate-400">Technician:</span><p className="font-medium">{detailInst.technician?.name || 'Unassigned'}</p>{detailInst.technician && <p className="text-xs text-slate-400">{detailInst.technician.phone}</p>}</div>
                <div><span className="text-slate-400">Emirate:</span><p className="font-medium">{detailInst.emirate || '—'}</p></div>
                <div><span className="text-slate-400">Location:</span><p className="font-medium">{detailInst.location || '—'}</p></div>
                <div><span className="text-slate-400">Scheduled:</span><p className="font-medium">{detailInst.scheduledDate ? `${new Date(detailInst.scheduledDate).toLocaleDateString('en-AE')} ${detailInst.scheduledTime || ''}` : '—'}</p></div>
                {detailInst.completedAt && <div><span className="text-slate-400">Completed:</span><p className="font-medium">{new Date(detailInst.completedAt).toLocaleDateString('en-AE')}</p></div>}
              </div>

              {/* Testing Checklist */}
              {(detailInst.status === 'testing' || detailInst.status === 'completed') && (
                <div className="p-3 border rounded-lg">
                  <p className="text-xs font-medium text-slate-500 mb-2 uppercase">Installation Checklist</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm"><CheckCircle2 className={`w-4 h-4 ${detailInst.gpsSignal ? 'text-emerald-500' : 'text-slate-300'}`} />GPS Signal Acquired</div>
                    <div className="flex items-center gap-2 text-sm"><CheckCircle2 className={`w-4 h-4 ${detailInst.powerWiring ? 'text-emerald-500' : 'text-slate-300'}`} />Power Wiring Verified</div>
                    <div className="flex items-center gap-2 text-sm"><CheckCircle2 className={`w-4 h-4 ${detailInst.antennaMounted ? 'text-emerald-500' : 'text-slate-300'}`} />Antenna Mounted</div>
                  </div>
                </div>
              )}

              {detailInst.notes && <div><span className="text-slate-400 text-sm">Notes:</span><p className="text-sm mt-1">{detailInst.notes}</p></div>}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t">
                {detailInst.status === 'scheduled' && <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => advanceStatus(detailInst.id, 'in_progress')}><PlayCircle className="w-4 h-4 mr-1.5" />Start Installation</Button>}
                {detailInst.status === 'in_progress' && <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => advanceStatus(detailInst.id, 'testing')}><AlertTriangle className="w-4 h-4 mr-1.5" />Move to Testing</Button>}
                {detailInst.status === 'testing' && <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => advanceStatus(detailInst.id, 'completed')}><CheckCircle2 className="w-4 h-4 mr-1.5" />Complete</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
