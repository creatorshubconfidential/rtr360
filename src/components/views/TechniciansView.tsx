'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Wrench, Plus, Phone, Mail, MapPin,
  MoreVertical, Eye, Trash2, CheckCircle2, Star, Clock
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'UAQ', 'RAK', 'Fujairah'];
const SPECIALTIES = ['GPS Installation', 'OBD Installation', 'Camera Setup', 'Wiring', 'All Types'];

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  on_leave: 'bg-amber-100 text-amber-700',
};

interface Technician {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  emirate: string | null;
  specialty: string | null;
  status: string;
  totalInstalled: number;
  rating: number;
  notes: string | null;
  _count: { installations: number };
  createdAt: string;
}


export default function TechniciansView() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTech, setDetailTech] = useState<Technician | null>(null);

  const [form, setForm] = useState({ name: '', phone: '', email: '', emirate: '', specialty: '', notes: '' });

  const fetchTechnicians = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await authFetch(`/api/technicians?${params}`);
      const data = await res.json();
      if (res.ok) { setTechnicians(data.technicians); setTotalPages(data.pagination?.totalPages || 1); }
    } catch {} finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchTechnicians(); }, [fetchTechnicians]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    try {
      const res = await authFetch('/api/technicians', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Technician ${form.name} added`);
        setCreateOpen(false);
        setForm({ name: '', phone: '', email: '', emirate: '', specialty: '', notes: '' });
        fetchTechnicians();
      } else { toast.error(data.error || 'Failed'); }
    } catch { toast.error('Network error'); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/technicians/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) { toast.success(`Status updated to ${status}`); fetchTechnicians(); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error('Network error'); }
  };

  const deleteTech = async (id: string) => {
    if (!confirm('Delete this technician?')) return;
    try {
      const res = await authFetch(`/api/technicians/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Technician deleted'); fetchTechnicians(); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error('Network error'); }
  };

  const columns: ColumnDef<Record<string, unknown>>[] = [
    {
      key: 'name', label: 'Technician',
      render: (_value, row) => {
        const t = row as unknown as Technician;
        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-emerald-700 font-semibold text-xs">{t.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
            </div>
            <span className="font-medium text-sm">{t.name}</span>
          </div>
        );
      },
    },
    {
      key: 'phone', label: 'Contact',
      render: (_value, row) => {
        const t = row as unknown as Technician;
        return (
          <div>
            <div className="text-sm">{t.phone}</div>
            {t.email && <div className="text-xs text-slate-400">{t.email}</div>}
          </div>
        );
      },
    },
    {
      key: 'emirate', label: 'Emirate',
      render: (value) => <span className="text-sm">{(value as string) || '—'}</span>,
    },
    {
      key: 'specialty', label: 'Specialty',
      render: (value) => <span className="text-sm">{(value as string) || '—'}</span>,
    },
    {
      key: 'totalInstalled', label: 'Installations',
      render: (value) => (
        <span>
          <span className="font-bold text-emerald-600">{value as number}</span>
          <span className="text-xs text-slate-400 ml-1">completed</span>
        </span>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (value) => <Badge className={`text-[11px] ${STATUS_COLORS[value as string] || ''} border-0`}>{value as string}</Badge>,
    },
    {
      key: 'actions', label: '', className: 'w-10',
      render: (_value, row) => {
        const t = row as unknown as Technician;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailTech(t)}><Eye className="w-4 h-4 mr-2" />View Details</DropdownMenuItem>
              <DropdownMenuSeparator />
              {t.status !== 'active' && <DropdownMenuItem onClick={() => updateStatus(t.id, 'active')}><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />Activate</DropdownMenuItem>}
              {t.status !== 'on_leave' && <DropdownMenuItem onClick={() => updateStatus(t.id, 'on_leave')}><Clock className="w-4 h-4 mr-2 text-amber-600" />Set On Leave</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={() => deleteTech(t.id)}><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-slate-50 border-0"><CardContent className="p-4"><p className="text-xs font-medium text-slate-400 uppercase">Total</p><p className="text-2xl font-bold text-slate-800">{technicians.length}</p></CardContent></Card>
        <Card className="bg-emerald-50 border-0"><CardContent className="p-4"><p className="text-xs font-medium text-emerald-400 uppercase">Active</p><p className="text-2xl font-bold text-emerald-700">{technicians.filter(t => t.status === 'active').length}</p></CardContent></Card>
        <Card className="bg-blue-50 border-0"><CardContent className="p-4"><p className="text-xs font-medium text-blue-400 uppercase">Total Installations</p><p className="text-2xl font-bold text-blue-700">{technicians.reduce((s, t) => s + t.totalInstalled, 0)}</p></CardContent></Card>
        <Card className="bg-purple-50 border-0"><CardContent className="p-4"><p className="text-xs font-medium text-purple-400 uppercase">On Leave</p><p className="text-2xl font-bold text-purple-700">{technicians.filter(t => t.status === 'on_leave').length}</p></CardContent></Card>
      </div>

      {/* DataTable with toolbar */}
      <DataTable<Record<string, unknown>>
        columns={columns}
        data={technicians as unknown as Record<string, unknown>[]}
        keyExtractor={(row) => row.id as string}
        loading={loading}
        emptyMessage="No technicians found"
        emptyIcon={Wrench}
        searchable
        searchPlaceholder="Search technicians..."
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        toolbar={
          <div className="flex items-center gap-2">
            <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-10"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-10"><Plus className="w-4 h-4 mr-1.5" /> Add Technician</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add New Technician</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-2">
                  <div className="col-span-2"><Label>Full Name *</Label><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. Ahmed Hassan" /></div>
                  <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} placeholder="+971-5X-XXX-XXXX" /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="tech@rtr.ae" /></div>
                  <div><Label>Emirate</Label>
                    <Select value={form.emirate} onValueChange={(v) => setForm({...form, emirate: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{EMIRATES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Specialty</Label>
                    <Select value={form.specialty} onValueChange={(v) => setForm({...form, specialty: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate}>Add Technician</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
        pagination={{
          page,
          pageSize: 20,
          totalPages,
          onPageChange: setPage,
        }}
      />

      {/* Detail Dialog */}
      <Dialog open={!!detailTech} onOpenChange={() => setDetailTech(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <span className="text-emerald-700 font-bold text-sm">{detailTech?.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>
              </div>
              {detailTech?.name}
              <Badge className={`${STATUS_COLORS[detailTech?.status || '']} border-0 ml-2`}>{detailTech?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {detailTech && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /><div><span className="text-slate-400 text-xs">Phone</span><p className="font-medium">{detailTech.phone}</p></div></div>
                {detailTech.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /><div><span className="text-slate-400 text-xs">Email</span><p className="font-medium">{detailTech.email}</p></div></div>}
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /><div><span className="text-slate-400 text-xs">Emirate</span><p className="font-medium">{detailTech.emirate || '—'}</p></div></div>
                <div className="flex items-center gap-2"><Star className="w-4 h-4 text-slate-400" /><div><span className="text-slate-400 text-xs">Specialty</span><p className="font-medium">{detailTech.specialty || '—'}</p></div></div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div className="text-center p-3 bg-emerald-50 rounded-lg"><p className="text-2xl font-bold text-emerald-700">{detailTech.totalInstalled}</p><p className="text-xs text-slate-400">Installations</p></div>
                <div className="text-center p-3 bg-blue-50 rounded-lg"><p className="text-2xl font-bold text-blue-700">{detailTech._count.installations}</p><p className="text-xs text-slate-400">Total Jobs</p></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
