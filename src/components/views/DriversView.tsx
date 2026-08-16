'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users, Plus, Search, Filter, Phone, Mail, CreditCard,
  IdCard, AlertTriangle, ChevronLeft, ChevronRight, MoreVertical,
  Eye, Trash2, Ban, CheckCircle2, XCircle, Download
} from 'lucide-react';
import { exportCSV, DRIVER_COLUMNS } from '@/lib/export';

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
const LICENSE_TYPES = ['Light Vehicle', 'Heavy Vehicle', 'Motorcycle', 'Heavy Bus', 'Light Bus', 'Trailer', 'Forklift'];
const NATIONALITIES = ['UAE', 'India', 'Pakistan', 'Bangladesh', 'Philippines', 'Nepal', 'Sri Lanka', 'Egypt', 'Jordan', 'Other'];

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  on_leave: 'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
};

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  employeeId: string | null;
  licenseNumber: string | null;
  licenseType: string | null;
  licenseExpiry: string | null;
  emirate: string | null;
  nationality: string | null;
  status: string;
  score: number;
  totalTrips: number;
  totalDistance: number | null;
  totalViolations: number;
  vehicles: { id: string; plateNumber: string; vehicleType: string | null }[];
  createdAt: string;
}


export default function DriversView() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [emirateFilter, setEmirateFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailDriver, setDetailDriver] = useState<Driver | null>(null);

  // Create form
  const [form, setForm] = useState({
    name: '', phone: '', email: '', employeeId: '',
    licenseNumber: '', licenseType: '', licenseExpiry: '',
    emirate: '', nationality: '',
    emergencyContact: '', emergencyPhone: '', notes: ''
  });

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (emirateFilter) params.set('emirate', emirateFilter);
      const res = await authFetch(`/api/drivers?${params}`);
      const data = await res.json();
      if (res.ok) {
        setDrivers(data.drivers);
        setTotalPages(data.pagination.totalPages);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [page, search, statusFilter, emirateFilter]);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Driver name is required'); return; }
    try {
      const res = await authFetch('/api/drivers', {
        method: 'POST', body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Driver ${form.name} created successfully`);
        setCreateOpen(false);
        setForm({ name: '', phone: '', email: '', employeeId: '', licenseNumber: '', licenseType: '', licenseExpiry: '', emirate: '', nationality: '', emergencyContact: '', emergencyPhone: '', notes: '' });
        fetchDrivers();
      } else { toast.error(data.error || 'Failed to create driver'); }
    } catch { toast.error('Network error'); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/drivers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) { toast.success(`Driver status updated to ${status}`); fetchDrivers(); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error('Network error'); }
  };

  const deleteDriver = async (id: string) => {
    if (!confirm('Are you sure you want to delete this driver?')) return;
    try {
      const res = await authFetch(`/api/drivers/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Driver deleted'); fetchDrivers(); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error('Network error'); }
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Drivers', value: drivers.length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active', value: drivers.filter(d => d.status === 'active').length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'On Leave', value: drivers.filter(d => d.status === 'on_leave').length, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'License Expiring', value: drivers.filter(d => {
              if (!d.licenseExpiry) return false;
              const days = (new Date(d.licenseExpiry).getTime() - Date.now()) / (1000*60*60*24);
              return days < 30 && days > 0;
            }).length, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((c) => (
          <Card key={c.label} className={`${c.bg} border-0`}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filters + Create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search drivers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-10"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
          </SelectContent>
        </Select>
        <Select value={emirateFilter} onValueChange={(v) => { setEmirateFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-10"><SelectValue placeholder="Emirate" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Emirates</SelectItem>
            {EMIRATES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="gap-2 h-10"
          onClick={() => exportCSV({ data: drivers, filename: 'drivers', columns: DRIVER_COLUMNS })}
          disabled={drivers.length === 0}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-10"><Plus className="w-4 h-4 mr-1.5" /> Add Driver</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add New Driver</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2"><Label>Full Name *</Label><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. Mohammed Ali" /></div>
              <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} placeholder="+971-5X-XXX-XXXX" /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="driver@company.com" /></div>
              <div><Label>Employee ID</Label><Input value={form.employeeId} onChange={(e) => setForm({...form, employeeId: e.target.value})} placeholder="EMP-001" /></div>
              <div><Label>Nationality</Label>
                <Select value={form.nationality} onValueChange={(v) => setForm({...form, nationality: v})}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{NATIONALITIES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>License Number</Label><Input value={form.licenseNumber} onChange={(e) => setForm({...form, licenseNumber: e.target.value})} placeholder="DL-XXXXX" /></div>
              <div><Label>License Type</Label>
                <Select value={form.licenseType} onValueChange={(v) => setForm({...form, licenseType: v})}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{LICENSE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>License Expiry</Label><Input type="date" value={form.licenseExpiry} onChange={(e) => setForm({...form, licenseExpiry: e.target.value})} /></div>
              <div><Label>Emirate</Label>
                <Select value={form.emirate} onValueChange={(v) => setForm({...form, emirate: v})}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{EMIRATES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Emergency Contact</Label><Input value={form.emergencyContact} onChange={(e) => setForm({...form, emergencyContact: e.target.value})} placeholder="Contact name" /></div>
              <div><Label>Emergency Phone</Label><Input value={form.emergencyPhone} onChange={(e) => setForm({...form, emergencyPhone: e.target.value})} placeholder="+971-5X-XXX-XXXX" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate}>Create Driver</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading drivers...</div>
        ) : drivers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No drivers found</p>
            <p className="text-sm text-slate-400 mt-1">Add your first driver to get started</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Driver</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Contact</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">License</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Emirate</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Vehicle</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Score</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setDetailDriver(d)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                        <span className="text-emerald-700 font-semibold text-xs">{d.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{d.name}</p>
                        {d.employeeId && <p className="text-xs text-slate-400">{d.employeeId}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{d.phone || '—'}</div>
                    {d.email && <div className="text-xs text-slate-400">{d.email}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{d.licenseNumber || '—'}</div>
                    {d.licenseType && <div className="text-xs text-slate-400">{d.licenseType}</div>}
                    {d.licenseExpiry && new Date(d.licenseExpiry) < new Date(Date.now() + 30*24*60*60*1000) && (
                      <Badge className="bg-red-100 text-red-600 text-[10px] mt-1 border-0">Expiring</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{d.emirate || '—'}</TableCell>
                  <TableCell className="text-sm">{d.vehicles[0]?.plateNumber || '—'}</TableCell>
                  <TableCell>
                    <div className={`font-bold text-sm ${d.score >= 80 ? 'text-emerald-600' : d.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {d.score}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[11px] ${STATUS_COLORS[d.status] || ''} border-0`}>{d.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="w-8 h-8"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailDriver(d)}><Eye className="w-4 h-4 mr-2" />View Details</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {d.status !== 'active' && <DropdownMenuItem onClick={() => updateStatus(d.id, 'active')}><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />Activate</DropdownMenuItem>}
                        {d.status !== 'on_leave' && <DropdownMenuItem onClick={() => updateStatus(d.id, 'on_leave')}><Ban className="w-4 h-4 mr-2 text-amber-600" />Set On Leave</DropdownMenuItem>}
                        {d.status !== 'inactive' && <DropdownMenuItem onClick={() => updateStatus(d.id, 'inactive')}><XCircle className="w-4 h-4 mr-2 text-slate-600" />Deactivate</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => deleteDriver(d.id)}><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
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
      <Dialog open={!!detailDriver} onOpenChange={() => setDetailDriver(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <span className="text-emerald-700 font-bold text-sm">{detailDriver?.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>
              </div>
              {detailDriver?.name}
              <Badge className={`${STATUS_COLORS[detailDriver?.status || ''] || ''} border-0 ml-2`}>{detailDriver?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {detailDriver && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Employee ID:</span><p className="font-medium">{detailDriver.employeeId || '—'}</p></div>
                <div><span className="text-slate-400">Nationality:</span><p className="font-medium">{detailDriver.nationality || '—'}</p></div>
                <div><span className="text-slate-400">Phone:</span><p className="font-medium">{detailDriver.phone || '—'}</p></div>
                <div><span className="text-slate-400">Email:</span><p className="font-medium">{detailDriver.email || '—'}</p></div>
                <div><span className="text-slate-400">License #:</span><p className="font-medium">{detailDriver.licenseNumber || '—'}</p></div>
                <div><span className="text-slate-400">License Type:</span><p className="font-medium">{detailDriver.licenseType || '—'}</p></div>
                <div><span className="text-slate-400">License Expiry:</span><p className="font-medium">{detailDriver.licenseExpiry ? new Date(detailDriver.licenseExpiry).toLocaleDateString('en-AE') : '—'}</p></div>
                <div><span className="text-slate-400">Emirate:</span><p className="font-medium">{detailDriver.emirate || '—'}</p></div>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-2 border-t">
                <div className="text-center p-2 bg-slate-50 rounded-lg"><p className="text-lg font-bold text-emerald-600">{detailDriver.score}</p><p className="text-[10px] text-slate-400">Score</p></div>
                <div className="text-center p-2 bg-slate-50 rounded-lg"><p className="text-lg font-bold text-blue-600">{detailDriver.totalTrips}</p><p className="text-[10px] text-slate-400">Trips</p></div>
                <div className="text-center p-2 bg-slate-50 rounded-lg"><p className="text-lg font-bold text-purple-600">{detailDriver.totalDistance?.toFixed(0) || '0'}</p><p className="text-[10px] text-slate-400">KM</p></div>
                <div className="text-center p-2 bg-slate-50 rounded-lg"><p className="text-lg font-bold text-red-600">{detailDriver.totalViolations}</p><p className="text-[10px] text-slate-400">Violations</p></div>
              </div>
              {detailDriver.vehicles.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-2">Assigned Vehicles</p>
                  {detailDriver.vehicles.map(v => (
                    <div key={v.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-sm">
                      <span className="font-bold">{v.plateNumber}</span>
                      {v.vehicleType && <span className="text-slate-400">{v.vehicleType}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
