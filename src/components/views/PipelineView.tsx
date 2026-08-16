'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GripVertical,
  Phone,
  Building2,
  MapPin,
  Plus,
  MessageSquare,
  FileText,
  ChevronRight,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { authFetch, formatAED, formatDate } from '@/lib/api';
import { STATUS_COLORS, PRIORITY_COLORS, PIPELINE_STAGES, EMIRATES, VEHICLE_TYPES, LEAD_SOURCES, ACTIVITY_TYPES, ACTIVITY_ICONS, DEFAULT_QUOTATION_ITEMS, QUOTATION_TERMS } from '@/lib/constants';
import type { Lead, LeadDetail, Quotation, QuotationItemInput, Activity, PipelineSummary } from '@/lib/types';

// ────────────────────────────────────────
// PipelineView — CRM Kanban Board
// ────────────────────────────────────────

export default function PipelineView() {
  const [pipeline, setPipeline] = useState<Record<string, Lead[]>>({});
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Quotation dialog state
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [quotationItems, setQuotationItems] = useState<QuotationItemInput[]>([...DEFAULT_QUOTATION_ITEMS]);
  const [quotationNotes, setQuotationNotes] = useState('');
  const [quotationLeadId, setQuotationLeadId] = useState<string | null>(null);
  const [quotationSubmitting, setQuotationSubmitting] = useState(false);

  // Activity form state
  const [activityType, setActivityType] = useState('note');
  const [activityTitle, setActivityTitle] = useState('');
  const [activityDesc, setActivityDesc] = useState('');
  const [activitySubmitting, setActivitySubmitting] = useState(false);

  // Create lead form
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', emirate: '',
    vehicleCount: '', vehicleType: '', requirement: '', source: '', priority: 'medium',
  });

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/pipeline');
      const data = await res.json();
      if (res.ok) {
        setPipeline(data.pipeline || {});
        setSummary(data.summary || null);
      }
    } catch {
      toast.error('Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const fetchLeadDetail = async (leadId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await authFetch(`/api/leads/${leadId}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedLead(data.lead);
      } else {
        toast.error(data.error || 'Failed to load lead');
      }
    } catch {
      toast.error('Failed to load lead');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      const res = await authFetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Moved to ${newStatus}`);
        fetchPipeline();
        // Refresh detail if open
        if (selectedLead?.id === leadId) {
          fetchLeadDetail(leadId);
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update lead');
    }
  };

  const handleCreateLead = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          vehicleCount: form.vehicleCount ? parseInt(form.vehicleCount) : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Lead created!');
        setCreateOpen(false);
        setForm({ name: '', email: '', phone: '', company: '', emirate: '', vehicleCount: '', vehicleType: '', requirement: '', source: '', priority: 'medium' });
        fetchPipeline();
      } else {
        toast.error(data.error || 'Failed to create lead');
      }
    } catch {
      toast.error('Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateQuotation = async () => {
    if (quotationItems.length === 0) { toast.error('Add at least one item'); return; }
    setQuotationSubmitting(true);
    try {
      const res = await authFetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({
          leadId: quotationLeadId,
          items: quotationItems,
          notes: quotationNotes || undefined,
          terms: QUOTATION_TERMS,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Quotation ${data.quotation.quotationNumber} created!`);
        setQuotationOpen(false);
        setQuotationItems([...DEFAULT_QUOTATION_ITEMS]);
        setQuotationNotes('');
        setQuotationLeadId(null);
        if (selectedLead?.id) fetchLeadDetail(selectedLead.id);
      } else {
        toast.error(data.error || 'Failed to create quotation');
      }
    } catch {
      toast.error('Failed to create quotation');
    } finally {
      setQuotationSubmitting(false);
    }
  };

  const handleAddActivity = async () => {
    if (!activityTitle.trim() || !selectedLead) return;
    setActivitySubmitting(true);
    try {
      const res = await authFetch('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: activityType,
          title: activityTitle.trim(),
          description: activityDesc.trim() || undefined,
          leadId: selectedLead.id,
        }),
      });
      if (res.ok) {
        toast.success('Activity logged');
        setActivityTitle('');
        setActivityDesc('');
        setActivityType('note');
        fetchLeadDetail(selectedLead.id);
      } else {
        toast.error('Failed to log activity');
      }
    } catch {
      toast.error('Failed to log activity');
    } finally {
      setActivitySubmitting(false);
    }
  };

  const addQuotationItem = () => {
    setQuotationItems([...quotationItems, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeQuotationItem = (idx: number) => {
    setQuotationItems(quotationItems.filter((_, i) => i !== idx));
  };

  const updateQuotationItem = (idx: number, field: keyof QuotationItemInput, value: string | number) => {
    const updated = [...quotationItems];
    (updated[idx] as unknown as Record<string, unknown>)[field] = value;
    setQuotationItems(updated);
  };

  const quotationSubtotal = quotationItems.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  const quotationTax = Math.round(quotationSubtotal * 5 / 100 * 100) / 100;
  const quotationTotal = Math.round((quotationSubtotal + quotationTax) * 100) / 100;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sales Pipeline</h2>
          <p className="text-sm text-slate-500">Track and manage your sales opportunities</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPipeline} className="gap-1.5">
            Refresh
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <Plus className="w-4 h-4" /> New Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contact name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 5x xxx xxxx" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.ae" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Emirate</Label>
                    <Select value={form.emirate} onValueChange={(v) => setForm({ ...form, emirate: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{EMIRATES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['low', 'medium', 'high', 'urgent'].map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vehicle Count</Label>
                    <Input type="number" value={form.vehicleCount} onChange={(e) => setForm({ ...form, vehicleCount: e.target.value })} placeholder="e.g. 10" />
                  </div>
                  <div className="space-y-2">
                    <Label>Vehicle Type</Label>
                    <Select value={form.vehicleType} onValueChange={(v) => setForm({ ...form, vehicleType: v })}>
                      <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Requirement</Label>
                  <Textarea value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} placeholder="Describe the customer requirement..." rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreateLead} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Lead'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Pipeline Summary Cards */}
      {summary && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-xl border-slate-200/60 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{summary.total}</p>
                  <p className="text-xs text-slate-500">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-200/60 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{summary.wonThisMonth}</p>
                  <p className="text-xs text-slate-500">Won This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-200/60 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{summary.byStage.proposal || 0}</p>
                  <p className="text-xs text-slate-500">In Proposal</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-200/60 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-600">AED</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{formatAED(summary.totalValue)}</p>
                  <p className="text-xs text-slate-500">Pipeline Value</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0">
          {PIPELINE_STAGES.map((stage) => {
            const leads = pipeline[stage.id] || [];
            return (
              <div
                key={stage.id}
                className={`flex-shrink-0 w-[280px] lg:w-auto lg:flex-1 bg-slate-50/80 rounded-xl border-t-[3px] ${stage.color} p-3`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-700">{stage.label}</h3>
                    <Badge variant="secondary" className="text-[11px] bg-white text-slate-600 border-0">
                      {leads.length}
                    </Badge>
                  </div>
                </div>

                {/* Lead Cards */}
                <div className="space-y-2.5 min-h-[120px]">
                  {leads.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No leads
                    </div>
                  )}
                  {leads.map((lead) => (
                    <motion.div
                      key={lead.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 }}
                    >
                      <Card
                        className="rounded-lg border-slate-200/60 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-emerald-200"
                        onClick={() => fetchLeadDetail(lead.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">{lead.name}</p>
                              {lead.company && (
                                <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" /> {lead.company}
                                </p>
                              )}
                            </div>
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_COLORS[lead.priority] || 'bg-slate-300'}`} />
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            {lead.emirate && (
                              <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.emirate}</span>
                            )}
                            {lead.vehicleCount && (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                {lead.vehicleCount} vehicle{lead.vehicleCount > 1 ? 's' : ''}
                              </span>
                            )}
                            {lead.source && (
                              <span>{lead.source}</span>
                            )}
                          </div>

                          {/* Quick actions bar */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {lead.quotations && lead.quotations.length > 0 && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">
                                  {lead.quotations.length} quote{lead.quotations.length > 1 ? 's' : ''}
                                </span>
                              )}
                              {lead._count && lead._count.activities > 0 && (
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                                  {lead._count.activities} activities
                                </span>
                              )}
                            </div>
                            {lead.assignedTo && (
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600" title={lead.assignedTo.name}>
                                {lead.assignedTo.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                            )}
                          </div>

                          {/* Move to next stage button */}
                          <div className="mt-2">
                            <Select onValueChange={(v) => handleStatusChange(lead.id, v)}>
                              <SelectTrigger className="h-7 text-[11px] w-full">
                                <SelectValue placeholder="Move to..." />
                              </SelectTrigger>
                              <SelectContent>
                                {PIPELINE_STAGES.map((s) => (
                                  <SelectItem key={s.id} value={s.id} disabled={s.id === lead.status}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Lead Detail Side Sheet ─── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:w-[540px] p-0 overflow-y-auto">
          <SheetTitle className="sr-only">Lead Detail</SheetTitle>
          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-60 w-full" />
            </div>
          ) : selectedLead ? (
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedLead.name}</h3>
                  {selectedLead.company && (
                    <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> {selectedLead.company}
                    </p>
                  )}
                </div>
                <Badge className={`${STATUS_COLORS[selectedLead.status] || 'bg-slate-100 text-slate-600'} border-0`}
                >
                  {selectedLead.status}
                </Badge>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl">
                {selectedLead.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <a href={`tel:${selectedLead.phone}`} className="text-emerald-600 hover:underline">{selectedLead.phone}</a>
                  </div>
                )}
                {selectedLead.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400">✉</span>
                    <a href={`mailto:${selectedLead.email}`} className="text-emerald-600 hover:underline">{selectedLead.email}</a>
                  </div>
                )}
                {selectedLead.emirate && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="w-4 h-4 text-slate-400" /> {selectedLead.emirate}
                  </div>
                )}
                {selectedLead.vehicleCount && (
                  <div className="text-sm text-slate-600">
                    <span className="font-medium">{selectedLead.vehicleCount}</span> vehicle{selectedLead.vehicleCount > 1 ? 's' : ''}
                    {selectedLead.vehicleType && ` (${selectedLead.vehicleType})`}
                  </div>
                )}
                {selectedLead.source && (
                  <div className="text-sm text-slate-500">
                    Source: <span className="font-medium text-slate-700">{selectedLead.source}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm">
                  <div className={`w-2.5 h-2.5 rounded-full ${PRIORITY_COLORS[selectedLead.priority] || 'bg-slate-300'}`} />
                  <span className="capitalize text-slate-600">{selectedLead.priority} priority</span>
                </div>
              </div>

              {/* Notes */}
              {selectedLead.notes && (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{selectedLead.notes}</p>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    setQuotationLeadId(selectedLead.id);
                    setQuotationOpen(true);
                  }}
                >
                  <FileText className="w-3.5 h-3.5" /> Create Quotation
                </Button>
                <Select
                  onValueChange={(v) => handleStatusChange(selectedLead.id, v)}
                >
                  <SelectTrigger className="h-9 w-[160px] text-xs gap-1.5">
                    <span className="text-slate-500">Move to</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((s) => (
                      <SelectItem key={s.id} value={s.id} disabled={s.id === selectedLead.status}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Activity Log */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700">Activity Log</h4>
                </div>

                {/* Add Activity Form */}
                <div className="p-3 bg-slate-50 rounded-lg mb-3 space-y-2">
                  <div className="flex gap-2">
                    <Select value={activityType} onValueChange={setActivityType}>
                      <SelectTrigger className="h-8 w-[110px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {ACTIVITY_ICONS[t] || '📋'} {t.charAt(0).toUpperCase() + t.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 text-xs flex-1"
                      placeholder="Activity title..."
                      value={activityTitle}
                      onChange={(e) => setActivityTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddActivity()}
                    />
                    <Button
                      size="sm"
                      className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleAddActivity}
                      disabled={activitySubmitting || !activityTitle.trim()}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Input
                    className="h-7 text-xs"
                    placeholder="Description (optional)..."
                    value={activityDesc}
                    onChange={(e) => setActivityDesc(e.target.value)}
                  />
                </div>

                {/* Activities List */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {!selectedLead.activities || selectedLead.activities.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No activities yet</p>
                  ) : (
                    selectedLead.activities.map((act) => (
                      <div key={act.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm flex-shrink-0">
                          {ACTIVITY_ICONS[act.type] || '📋'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-800 truncate">{act.title}</p>
                            <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">{formatDate(act.createdAt)}</span>
                          </div>
                          {act.description && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{act.description}</p>
                          )}
                          {act.user && (
                            <p className="text-[10px] text-slate-400 mt-0.5">by {act.user.name}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quotations */}
              {selectedLead.quotations && selectedLead.quotations.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Quotations</h4>
                  <div className="space-y-2">
                    {selectedLead.quotations.map((q: Quotation) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between p-3 bg-white border border-slate-200/60 rounded-lg hover:border-emerald-200 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800 font-mono">{q.quotationNumber}</p>
                          <p className="text-xs text-slate-500">{formatDate(q.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">{formatAED(q.total)}</p>
                          <Badge className={`text-[10px] ${STATUS_COLORS[q.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                            {q.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Meta */}
              <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
                <p>Created: {formatDate(selectedLead.createdAt)}</p>
                <p>Last updated: {formatDate(selectedLead.updatedAt)}</p>
                {selectedLead.organization && <p>Org: {selectedLead.organization.name}</p>}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* ─── Create Quotation Dialog ─── */}
      <Dialog open={quotationOpen} onOpenChange={setQuotationOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Quotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Line Items */}
            <div>
              <Label className="text-sm font-semibold">Line Items</Label>
              <div className="mt-2 space-y-2">
                {quotationItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      className="flex-1 h-9 text-sm"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateQuotationItem(idx, 'description', e.target.value)}
                    />
                    <Input
                      className="w-20 h-9 text-sm text-center"
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateQuotationItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                    />
                    <Input
                      className="w-28 h-9 text-sm text-right"
                      type="number"
                      placeholder="AED"
                      value={item.unitPrice}
                      onChange={(e) => updateQuotationItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                    <p className="text-sm font-medium text-slate-700 w-24 text-right">
                      {formatAED(item.quantity * item.unitPrice)}
                    </p>
                    <button
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      onClick={() => removeQuotationItem(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={addQuotationItem}>
                <Plus className="w-3.5 h-3.5" /> Add Item
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={quotationNotes}
                onChange={(e) => setQuotationNotes(e.target.value)}
                placeholder="Additional notes for the customer..."
                rows={2}
              />
            </div>

            {/* Totals */}
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{formatAED(quotationSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">VAT (5%)</span>
                <span className="font-medium">{formatAED(quotationTax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2">
                <span>Total</span>
                <span className="text-emerald-700">{formatAED(quotationTotal)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotationOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleCreateQuotation}
              disabled={quotationSubmitting}
            >
              {quotationSubmitting ? 'Creating...' : 'Create Quotation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
