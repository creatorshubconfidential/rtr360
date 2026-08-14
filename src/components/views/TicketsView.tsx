'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Ticket, Plus, Search, ChevronLeft, ChevronRight,
  MessageSquare, Clock, CheckCircle2, AlertCircle, Download,
} from 'lucide-react';
import { exportCSV, TICKET_COLUMNS } from '@/lib/export';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  pending: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
};

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-slate-400',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

interface TicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string | null;
  priority: string;
  status: string;
  vehiclePlate: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function TicketsView() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    subject: '',
    description: '',
    priority: 'medium',
    vehiclePlate: '',
  });

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const res = await authFetch(`/api/tickets?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setTickets(data.tickets || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch {
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleCreate = async () => {
    if (!form.subject.trim()) { toast.error('Subject is required'); return; }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({ ...form, vehiclePlate: form.vehiclePlate.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create ticket'); return; }
      toast.success('Ticket created successfully');
      setCreateOpen(false);
      setForm({ subject: '', description: '', priority: 'medium', vehiclePlate: '' });
      fetchTickets();
    } catch { toast.error('Failed to create ticket'); }
    finally { setSubmitting(false); }
  };

  const handleStatusUpdate = async (ticketId: string, newStatus: string) => {
    try {
      const res = await authFetch(`/api/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to update'); return; }
      toast.success(`Ticket moved to ${newStatus.replace('_', ' ')}`);
      fetchTickets();
    } catch { toast.error('Failed to update ticket'); }
  };

  const openCount = tickets.filter(t => t.status === 'open').length;
  const ipCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Tickets</h2>
            <p className="text-sm text-slate-500">Customer support & issue tracking</p>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-sm px-2.5">{total}</Badge>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => exportCSV({ data: tickets, filename: 'tickets', columns: TICKET_COLUMNS })}
          disabled={tickets.length === 0}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"><Plus className="w-4 h-4" /> New Ticket</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create New Ticket</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Subject *</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief description of the issue" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detailed description..." rows={3} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Vehicle Plate</Label><Input value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} placeholder="e.g. DXB-A-12345" /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>{submitting ? 'Creating...' : 'Create Ticket'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Ticket, label: 'Total Tickets', value: total, color: 'bg-emerald-100 text-emerald-600' },
          { icon: MessageSquare, label: 'Open', value: openCount, color: 'bg-blue-100 text-blue-600' },
          { icon: Clock, label: 'In Progress', value: ipCount, color: 'bg-orange-100 text-orange-600' },
          { icon: CheckCircle2, label: 'Resolved', value: resolvedCount, color: 'bg-green-100 text-green-600' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="rounded-xl border-slate-200/60 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}><s.icon className="w-5 h-5" /></div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900">{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search tickets..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['open', 'in_progress', 'pending', 'resolved', 'closed'].map(s => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {['low', 'medium', 'high', 'urgent'].map(p => (
              <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <Card className="rounded-xl border-slate-200/60 shadow-sm"><div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
      ) : tickets.length === 0 ? (
        <Card className="rounded-xl border-slate-200/60">
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Ticket className="w-10 h-10 mb-3" /><p className="text-sm font-medium">No tickets found</p><p className="text-xs mt-1">Create a new ticket or adjust your filters</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
            {tickets.map((t) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="rounded-xl border-slate-200/60 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-mono text-slate-500">{t.ticketNumber}</div>
                      <Badge className={`text-[11px] shrink-0 ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'} border-0`}>{t.status.replace('_', ' ')}</Badge>
                    </div>
                    <div className="mt-2 font-medium text-sm text-slate-900 line-clamp-2">{t.subject}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-slate-300'}`} /><span className="capitalize">{t.priority}</span></div>
                      <span>{timeAgo(t.createdAt)}</span>
                    </div>
                    {t.vehiclePlate && <div className="mt-1.5 text-xs text-slate-500">Vehicle: {t.vehiclePlate}</div>}
                    <div className="mt-3">
                      <Select onValueChange={(v) => handleStatusUpdate(t.id, v)}>
                        <SelectTrigger className="h-8 text-xs w-full"><SelectValue placeholder="Update status" /></SelectTrigger>
                        <SelectContent>
                          {['open', 'in_progress', 'pending', 'resolved', 'closed'].map(s => (
                            <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Desktop Table */}
          <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden hidden lg:block">
            <Table>
              <TableHeader><TableRow className="bg-slate-50/80">
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Ticket #</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Subject</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Priority</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Vehicle</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Created</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-mono text-xs text-slate-600">{t.ticketNumber}</TableCell>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{t.subject}</TableCell>
                    <TableCell><div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-slate-300'}`} /><span className="text-xs text-slate-600 capitalize">{t.priority}</span></div></TableCell>
                    <TableCell><Badge className={`text-[11px] ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'} border-0`}>{t.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-600">{t.vehiclePlate || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{timeAgo(t.createdAt)}</TableCell>
                    <TableCell>
                      <Select onValueChange={(v) => handleStatusUpdate(t.id, v)}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Update..." /></SelectTrigger>
                        <SelectContent>
                          {['open', 'in_progress', 'pending', 'resolved', 'closed'].map(s => (
                            <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</SelectItem>
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
