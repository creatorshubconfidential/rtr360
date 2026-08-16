'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Cpu, Plus, Search, ChevronLeft, ChevronRight, MoreVertical,
  Eye, Trash2, Wifi, Package, CheckCircle2, XCircle, AlertTriangle, RotateCcw, Settings
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

const DEVICE_TYPES = ['GPS Tracker', 'OBD Tracker', 'Wired Tracker', 'Personal Tracker', 'Asset Tracker', 'Camera', 'Temperature Sensor'];
const WAREHOUSES = ['RTR Dubai Warehouse', 'RTR Abu Dhabi Warehouse', 'RTR Sharjah Warehouse', 'Mobile Stock'];

const STATUS_COLORS: Record<string, string> = {
  warehouse: 'bg-blue-100 text-blue-700',
  reserved: 'bg-amber-100 text-amber-700',
  installed: 'bg-emerald-100 text-emerald-700',
  defective: 'bg-red-100 text-red-700',
  returned: 'bg-purple-100 text-purple-700',
  decommissioned: 'bg-slate-200 text-slate-600',
};

const STATUS_ICONS: Record<string, string> = {
  warehouse: '📦', reserved: '⏳', installed: '✅', defective: '❌', returned: '🔄', decommissioned: '🗑️',
};

interface Device {
  id: string;
  imei: string;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  deviceType: string | null;
  protocol: string | null;
  phoneNumber: string | null;
  firmware: string | null;
  warehouse: string | null;
  status: string;
  purchaseCost: number | null;
  installDate: string | null;
  warrantyExpiry: string | null;
  lastPingAt: string | null;
  batteryLevel: number | null;
  notes: string | null;
  sim: { id: string; number: string; provider: string | null; status: string } | null;
  vehicles: { id: string; plateNumber: string }[];
  organization: { id: string; name: string } | null;
  createdAt: string;
}


export default function DevicesView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [detailDevice, setDetailDevice] = useState<Device | null>(null);

  const [form, setForm] = useState({
    imei: '', serialNumber: '', model: '', manufacturer: '',
    deviceType: '', protocol: '', warehouse: 'RTR Dubai Warehouse',
    purchaseDate: '', purchaseCost: '', warrantyExpiry: '', notes: ''
  });

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await authFetch(`/api/devices?${params}`);
      const data = await res.json();
      if (res.ok) {
        setDevices(data.devices);
        setTotalPages(data.pagination.totalPages);
        setCounts(data.counts || {});
      }
    } catch {} finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleCreate = async () => {
    if (!form.imei.trim() || form.imei.trim().length < 10) { toast.error('Valid IMEI is required (min 10 chars)'); return; }
    try {
      const res = await authFetch('/api/devices', {
        method: 'POST', body: JSON.stringify({
          ...form,
          purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Device ${form.imei} added to inventory`);
        setCreateOpen(false);
        setForm({ imei: '', serialNumber: '', model: '', manufacturer: '', deviceType: '', protocol: '', warehouse: 'RTR Dubai Warehouse', purchaseDate: '', purchaseCost: '', warrantyExpiry: '', notes: '' });
        fetchDevices();
      } else { toast.error(data.error || 'Failed'); }
    } catch { toast.error('Network error'); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) { toast.success(`Device marked as ${status}`); fetchDevices(); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error('Network error'); }
  };

  const deleteDevice = async (id: string) => {
    if (!confirm('Delete this device?')) return;
    try {
      const res = await authFetch(`/api/devices/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Device deleted'); fetchDevices(); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error('Network error'); }
  };

  const totalInvestment = devices.reduce((sum, d) => sum + (d.purchaseCost || 0), 0);

  return (
    <div className="space-y-4">
      {/* Inventory Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-slate-50 border-0"><CardContent className="p-3"><p className="text-[10px] font-medium text-slate-400 uppercase">Total</p><p className="text-xl font-bold text-slate-800">{counts.warehouse + (counts.reserved||0) + (counts.installed||0) + (counts.defective||0) + (counts.returned||0) + (counts.decommissioned||0) || devices.length}</p></CardContent></Card>
        <Card className="bg-blue-50 border-0"><CardContent className="p-3"><p className="text-[10px] font-medium text-blue-400 uppercase">Warehouse</p><p className="text-xl font-bold text-blue-700">{counts.warehouse || 0}</p></CardContent></Card>
        <Card className="bg-amber-50 border-0"><CardContent className="p-3"><p className="text-[10px] font-medium text-amber-400 uppercase">Reserved</p><p className="text-xl font-bold text-amber-700">{counts.reserved || 0}</p></CardContent></Card>
        <Card className="bg-emerald-50 border-0"><CardContent className="p-3"><p className="text-[10px] font-medium text-emerald-400 uppercase">Installed</p><p className="text-xl font-bold text-emerald-700">{counts.installed || 0}</p></CardContent></Card>
        <Card className="bg-red-50 border-0"><CardContent className="p-3"><p className="text-[10px] font-medium text-red-400 uppercase">Defective</p><p className="text-xl font-bold text-red-700">{counts.defective || 0}</p></CardContent></Card>
        <Card className="bg-purple-50 border-0"><CardContent className="p-3"><p className="text-[10px] font-medium text-purple-400 uppercase">Investment</p><p className="text-xl font-bold text-purple-700">AED {totalInvestment.toLocaleString()}</p></CardContent></Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search by IMEI, serial, model, phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[150px] h-10"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="warehouse">Warehouse</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="installed">Installed</SelectItem>
            <SelectItem value="defective">Defective</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-10"><Plus className="w-4 h-4 mr-1.5" /> Add Device</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Device to Inventory</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2"><Label>IMEI Number *</Label><Input value={form.imei} onChange={(e) => setForm({...form, imei: e.target.value})} placeholder="15-digit IMEI" className="font-mono" /></div>
              <div><Label>Serial Number</Label><Input value={form.serialNumber} onChange={(e) => setForm({...form, serialNumber: e.target.value})} placeholder="SN-XXXX" /></div>
              <div><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({...form, model: e.target.value})} placeholder="e.g. GT06N" /></div>
              <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => setForm({...form, manufacturer: e.target.value})} placeholder="e.g. Concox" /></div>
              <div><Label>Device Type</Label>
                <Select value={form.deviceType} onValueChange={(v) => setForm({...form, deviceType: v})}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Protocol</Label><Input value={form.protocol} onChange={(e) => setForm({...form, protocol: e.target.value})} placeholder="e.g. GT06" /></div>
              <div><Label>Warehouse</Label>
                <Select value={form.warehouse} onValueChange={(v) => setForm({...form, warehouse: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{WAREHOUSES.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Purchase Date</Label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({...form, purchaseDate: e.target.value})} /></div>
              <div><Label>Purchase Cost (AED)</Label><Input type="number" value={form.purchaseCost} onChange={(e) => setForm({...form, purchaseCost: e.target.value})} placeholder="0" /></div>
              <div><Label>Warranty Expiry</Label><Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm({...form, warrantyExpiry: e.target.value})} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate}>Add Device</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="p-12 text-center">
            <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No devices found</p>
            <p className="text-sm text-slate-400 mt-1">Add your first GPS device to inventory</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Device</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Type</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">SIM</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Warehouse</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Vehicle</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Cost</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setDetailDevice(d)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-sm">{STATUS_ICONS[d.status] || '📦'}</div>
                      <div>
                        <p className="font-mono text-sm font-semibold">{d.imei}</p>
                        <p className="text-xs text-slate-400">{[d.manufacturer, d.model].filter(Boolean).join(' ') || '—'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{d.deviceType || '—'}</TableCell>
                  <TableCell>
                    {d.sim ? (
                      <div className="flex items-center gap-1.5 text-sm"><Wifi className="w-3.5 h-3.5 text-emerald-500" />{d.sim.number}<span className="text-xs text-slate-400">({d.sim.provider})</span></div>
                    ) : <span className="text-slate-400 text-sm">No SIM</span>}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{d.warehouse || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{d.vehicles[0]?.plateNumber || '—'}</TableCell>
                  <TableCell className="text-sm">{d.purchaseCost ? `AED ${d.purchaseCost.toLocaleString()}` : '—'}</TableCell>
                  <TableCell><Badge className={`text-[11px] ${STATUS_COLORS[d.status] || ''} border-0`}>{d.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="w-8 h-8"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailDevice(d)}><Eye className="w-4 h-4 mr-2" />View Details</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {d.status === 'warehouse' && <DropdownMenuItem onClick={() => updateStatus(d.id, 'reserved')}><AlertTriangle className="w-4 h-4 mr-2 text-amber-600" />Reserve</DropdownMenuItem>}
                        {d.status === 'returned' && <DropdownMenuItem onClick={() => updateStatus(d.id, 'warehouse')}><RotateCcw className="w-4 h-4 mr-2 text-blue-600" />Back to Warehouse</DropdownMenuItem>}
                        {d.status === 'defective' && <DropdownMenuItem onClick={() => updateStatus(d.id, 'decommissioned')}><Settings className="w-4 h-4 mr-2" />Decommission</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => deleteDevice(d.id)}><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
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
      <Dialog open={!!detailDevice} onOpenChange={() => setDetailDevice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg">{STATUS_ICONS[detailDevice?.status || ''] || '📦'}</div>
              <span className="font-mono">{detailDevice?.imei}</span>
              <Badge className={`${STATUS_COLORS[detailDevice?.status || ''] || ''} border-0`}>{detailDevice?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {detailDevice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Manufacturer:</span><p className="font-medium">{detailDevice.manufacturer || '—'}</p></div>
                <div><span className="text-slate-400">Model:</span><p className="font-medium">{detailDevice.model || '—'}</p></div>
                <div><span className="text-slate-400">Serial Number:</span><p className="font-medium">{detailDevice.serialNumber || '—'}</p></div>
                <div><span className="text-slate-400">Device Type:</span><p className="font-medium">{detailDevice.deviceType || '—'}</p></div>
                <div><span className="text-slate-400">Protocol:</span><p className="font-medium">{detailDevice.protocol || '—'}</p></div>
                <div><span className="text-slate-400">Firmware:</span><p className="font-medium">{detailDevice.firmware || '—'}</p></div>
                <div><span className="text-slate-400">Warehouse:</span><p className="font-medium">{detailDevice.warehouse || '—'}</p></div>
                <div><span className="text-slate-400">Purchase Cost:</span><p className="font-medium">{detailDevice.purchaseCost ? `AED ${detailDevice.purchaseCost.toLocaleString()}` : '—'}</p></div>
              </div>
              {detailDevice.sim && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs font-medium text-blue-600 mb-1">SIM Card</p>
                  <p className="text-sm font-medium">{detailDevice.sim.number} <span className="text-slate-400">({detailDevice.sim.provider})</span></p>
                </div>
              )}
              {detailDevice.vehicles.length > 0 && (
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <p className="text-xs font-medium text-emerald-600 mb-1">Installed On</p>
                  <p className="text-sm font-bold">{detailDevice.vehicles[0].plateNumber}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
