'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { UserPlus, Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { authFetch } from '@/lib/api';
import { STATUS_COLORS, PRIORITY_COLORS, EMIRATES, VEHICLE_TYPES, LEAD_SOURCES, VALID_LEAD_STATUSES } from '@/lib/constants';
import type { Lead } from '@/lib/types';

export default function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({});

  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', emirate: '',
    vehicleCount: '', vehicleType: '', requirement: '', source: '', priority: 'medium',
  });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const res = await authFetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLeads(data.leads || []);
        setTotalPages(data.pagination?.totalPages || 1);
        const counts: Record<string, number> = {};
        (data.leads || []).forEach((l: Lead) => {
          counts[l.status] = (counts[l.status] || 0) + 1;
        });
        setPipelineCounts(counts);
      }
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Lead name is required'); return; }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({ ...form, vehicleCount: form.vehicleCount ? parseInt(form.vehicleCount) : null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create lead'); return; }
      toast.success('Lead created successfully');
      setCreateOpen(false);
      setForm({ name: '', email: '', phone: '', company: '', emirate: '', vehicleCount: '', vehicleType: '', requirement: '', source: '', priority: 'medium' });
      fetchLeads();
    } catch { toast.error('Failed to create lead'); } finally { setSubmitting(false); }
  };

  const handleStatusUpdate = async (leadId: string, newStatus: string) => {
    try {
      const res = await authFetch(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed to update status'); return; }
      toast.success(`Lead moved to ${newStatus}`);
      fetchLeads();
    } catch { toast.error('Failed to update lead status'); }
  };

  const pipelineStatuses = ['new', 'contacted', 'qualified', 'demo', 'quotation', 'won', 'lost'];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Leads</h2>
          <p className="text-sm text-slate-500">Manage your sales pipeline</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"><Plus className="w-4 h-4" /> New Lead</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
            <DialogHeader><DialogTitle>Create New Lead</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 xx xxx xxxx" /></div>
                <div className="space-y-2"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Emirate</Label><Select value={form.emirate} onValueChange={(v) => setForm({ ...form, emirate: v })}><SelectTrigger><SelectValue placeholder="Select emirate" /></SelectTrigger><SelectContent>{EMIRATES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Vehicle Count</Label><Input type="number" value={form.vehicleCount} onChange={(e) => setForm({ ...form, vehicleCount: e.target.value })} placeholder="e.g. 10" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Vehicle Type</Label><Select value={form.vehicleType} onValueChange={(v) => setForm({ ...form, vehicleType: v })}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Source</Label><Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}><SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger><SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-2"><Label>Requirement</Label><Textarea value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} placeholder="Describe the requirement..." rows={3} /></div>
              <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>{submitting ? 'Creating...' : 'Create Lead'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-wrap gap-2">
        {pipelineStatuses.map((s) => (
          <Badge key={s} variant="outline" className={`text-xs px-2.5 py-1 ${STATUS_COLORS[s] || ''} border-0`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}: {pipelineCounts[s] || 0}
          </Badge>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search leads..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem>{VALID_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All Priority" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Priority</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
        </Select>
      </div>
      <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <UserPlus className="w-10 h-10 mb-3" /><p className="text-sm font-medium">No leads found</p><p className="text-xs mt-1">Create a new lead or adjust your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Company</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden md:table-cell">Phone</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden lg:table-cell">Emirate</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden sm:table-cell">Source</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Priority</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden lg:table-cell">Created</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-sm">{lead.name}</TableCell>
                      <TableCell className="text-sm text-slate-600">{lead.company || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600 hidden md:table-cell">{lead.phone || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600 hidden lg:table-cell">{lead.emirate || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {lead.source ? <Badge variant="secondary" className="text-[11px] bg-slate-100 text-slate-600 border-0">{lead.source}</Badge> : '—'}
                      </TableCell>
                      <TableCell><Badge className={`text-[11px] ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'} border-0`}>{lead.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[lead.priority] || 'bg-slate-300'}`} />
                          <span className="text-xs text-slate-600 capitalize">{lead.priority}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 hidden lg:table-cell">{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Select onValueChange={(v) => handleStatusUpdate(lead.id, v)}>
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Move to..." /></SelectTrigger>
                          <SelectContent>{VALID_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
