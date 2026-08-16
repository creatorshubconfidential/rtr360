'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Send,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { authFetch, formatAED, formatDate, formatDateTime } from '@/lib/api';
import { STATUS_COLORS, QUOTATION_STATUSES, DEFAULT_QUOTATION_ITEMS, QUOTATION_TERMS } from '@/lib/constants';
import type { Quotation, QuotationItem, QuotationItemInput } from '@/lib/types';

export default function QuotationsView() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Create quotation
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<QuotationItemInput[]>([...DEFAULT_QUOTATION_ITEMS]);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [qNotes, setQNotes] = useState('');

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await authFetch(`/api/quotations?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setQuotations(data.quotations || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch { toast.error('Failed to load quotations'); }
    finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  // Search leads for quotation creation
  useEffect(() => {
    if (!leadSearch.trim()) { setLeadResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/leads?search=${encodeURIComponent(leadSearch)}&limit=5`);
        const data = await res.json();
        if (res.ok) setLeadResults(data.leads || []);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [leadSearch]);

  const fetchQuotationDetail = async (id: string) => {
    try {
      const res = await authFetch(`/api/quotations/${id}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedQuotation(data.quotation);
        setDetailOpen(true);
      }
    } catch { toast.error('Failed to load quotation'); }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/quotations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(`Quotation marked as ${status}`);
        fetchQuotations();
      }
    } catch { toast.error('Failed to update'); }
  };

  const handleCreate = async () => {
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({
          leadId: selectedLeadId,
          items,
          notes: qNotes || undefined,
          terms: QUOTATION_TERMS,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Quotation ${data.quotation.quotationNumber} created!`);
        setCreateOpen(false);
        setItems([...DEFAULT_QUOTATION_ITEMS]);
        setQNotes('');
        setSelectedLeadId(null);
        setLeadSearch('');
        fetchQuotations();
      } else { toast.error(data.error || 'Failed to create'); }
    } catch { toast.error('Failed to create quotation'); }
    finally { setSubmitting(false); }
  };

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  const tax = Math.round(subtotal * 5 / 100 * 100) / 100;
  const totalVal = Math.round((subtotal + tax) * 100) / 100;

  const statusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-3.5 h-3.5" />;
      case 'sent': return <Send className="w-3.5 h-3.5" />;
      case 'accepted': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'rejected': return <XCircle className="w-3.5 h-3.5" />;
      case 'expired': return <Clock className="w-3.5 h-3.5" />;
      default: return null;
    }
  };


  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Quotations</h2>
            <p className="text-sm text-slate-500">Create and manage customer quotations</p>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-sm px-2.5">
            {total}
          </Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Plus className="w-4 h-4" /> New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create New Quotation</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {/* Lead Search */}
              <div className="space-y-2">
                <Label>Link to Lead (optional)</Label>
                <Input
                  placeholder="Search lead by name or company..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
                {leadResults.length > 0 && !selectedLeadId && (
                  <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto">
                    {leadResults.map((l) => (
                      <button
                        key={l.id}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center justify-between"
                        onClick={() => { setSelectedLeadId(l.id); setLeadSearch(l.name + (l.company ? ` - ${l.company}` : '')); setLeadResults([]); }}
                      >
                        <span className="font-medium text-slate-800">{l.name}</span>
                        <span className="text-xs text-slate-400">{l.company || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedLeadId && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Linked to: {leadSearch}</span>
                    <button className="text-slate-400 hover:text-red-500 ml-auto" onClick={() => { setSelectedLeadId(null); setLeadSearch(''); }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <Label className="text-sm font-semibold">Line Items</Label>
                <div className="mt-2 space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input className="flex-1 h-9 text-sm" placeholder="Description" value={item.description}
                        onChange={(e) => { const u = [...items]; u[idx] = { ...u[idx], description: e.target.value }; setItems(u); }} />
                      <Input className="w-20 h-9 text-sm text-center" type="number" placeholder="Qty" value={item.quantity}
                        onChange={(e) => { const u = [...items]; u[idx] = { ...u[idx], quantity: parseInt(e.target.value) || 0 }; setItems(u); }} />
                      <Input className="w-28 h-9 text-sm text-right" type="number" placeholder="AED" value={item.unitPrice}
                        onChange={(e) => { const u = [...items]; u[idx] = { ...u[idx], unitPrice: parseFloat(e.target.value) || 0 }; setItems(u); }} />
                      <p className="text-sm font-medium text-slate-700 w-24 text-right">
                        {formatAED(item.quantity * item.unitPrice)}
                      </p>
                      <button className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2 gap-1.5"
                  onClick={() => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])}>
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={qNotes} onChange={(e) => setQNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
              </div>

              {/* Totals */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium">{formatAED(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">VAT (5%)</span>
                  <span className="font-medium">{formatAED(tax)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2">
                  <span>Total</span>
                  <span className="text-emerald-700">{formatAED(totalVal)}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Quotation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search quotation number..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {QUOTATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : quotations.length === 0 ? (
        <Card className="rounded-xl border-slate-200/60">
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FileText className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No quotations found</p>
            <p className="text-xs mt-1">Create your first quotation</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
            {quotations.map((q) => {
              const qItems = q.items;
              return (
                <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="rounded-xl border-slate-200/60 shadow-sm cursor-pointer hover:border-emerald-200 transition-colors"
                    onClick={() => fetchQuotationDetail(q.id)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-mono font-bold text-slate-800">{q.quotationNumber}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{q.lead?.company || q.lead?.name || '—'}</p>
                        </div>
                        <Badge className={`text-[11px] gap-1 ${STATUS_COLORS[q.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                          {statusIcon(q.status)} {q.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-slate-500">{formatDate(q.createdAt)}</span>
                        <span className="text-lg font-bold text-emerald-700">{formatAED(q.total)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Quotation #</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Lead / Company</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Items</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Subtotal</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">VAT</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Total</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((q) => {
                  const qItems = q.items;
                  return (
                    <TableRow key={q.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-mono text-sm font-semibold">{q.quotationNumber}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {q.lead?.company || q.lead?.name || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{qItems.length} item{qItems.length !== 1 ? 's' : ''}</TableCell>
                      <TableCell className="text-sm text-slate-600">{formatAED(q.subtotal)}</TableCell>
                      <TableCell className="text-sm text-slate-600">{formatAED(q.tax)}</TableCell>
                      <TableCell className="text-sm font-bold text-emerald-700">{formatAED(q.total)}</TableCell>
                      <TableCell>
                        <Badge className={`text-[11px] gap-1 ${STATUS_COLORS[q.status] || 'bg-slate-100 text-slate-600'} border-0`}>
                          {statusIcon(q.status)} {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDate(q.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => fetchQuotationDetail(q.id)}>
                            <Eye className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                          {q.status === 'draft' && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-600"
                              onClick={() => handleStatusUpdate(q.id, 'sent')}>
                              <Send className="w-3.5 h-3.5 mr-1" /> Send
                            </Button>
                          )}
                          {(q.status === 'sent' || q.status === 'draft') && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-600"
                              onClick={() => handleStatusUpdate(q.id, 'accepted')}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Accept
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3">
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
        </>
      )}

      {/* ─── Quotation Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedQuotation?.quotationNumber}</span>
              {selectedQuotation && (
                <Badge className={`${STATUS_COLORS[selectedQuotation.status] || 'bg-slate-100 text-slate-600'} border-0 gap-1`}>
                  {statusIcon(selectedQuotation.status)} {selectedQuotation.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedQuotation && (() => {
            const qItems = selectedQuotation.items;
            return (
              <div className="space-y-6 py-2">
                {/* Company Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Customer</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">
                      {selectedQuotation.lead?.company || selectedQuotation.lead?.name || 'N/A'}
                    </p>
                    {selectedQuotation.lead?.name && selectedQuotation.lead?.company && (
                      <p className="text-xs text-slate-500">{selectedQuotation.lead.name}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">RTR 360 Platform</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">Powered by Mianx.ai</p>
                    <p className="text-xs text-slate-500">Dubai, UAE</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Line Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs text-center">Qty</TableHead>
                        <TableHead className="text-xs text-right">Unit Price</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm text-slate-500">{idx + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{item.description}</TableCell>
                          <TableCell className="text-sm text-center">{item.quantity}</TableCell>
                          <TableCell className="text-sm text-right">{formatAED(item.unitPrice)}</TableCell>
                          <TableCell className="text-sm text-right font-medium">{formatAED(item.quantity * item.unitPrice)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals */}
                <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-medium">{formatAED(selectedQuotation.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">VAT ({selectedQuotation.taxRate}%)</span>
                    <span className="font-medium">{formatAED(selectedQuotation.tax)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2">
                    <span>Total</span>
                    <span className="text-emerald-700">{formatAED(selectedQuotation.total)}</span>
                  </div>
                </div>

                {/* Notes & Terms */}
                {selectedQuotation.notes && (
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm text-blue-900">{selectedQuotation.notes}</p>
                  </div>
                )}
                {selectedQuotation.terms && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Terms & Conditions</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{selectedQuotation.terms}</p>
                  </div>
                )}

                {/* Meta */}
                <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
                  <p>Created: {formatDateTime(selectedQuotation.createdAt)}</p>
                  {selectedQuotation.validUntil && <p>Valid until: {formatDate(selectedQuotation.validUntil)}</p>}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {selectedQuotation.status === 'draft' && (
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      onClick={() => { handleStatusUpdate(selectedQuotation.id, 'sent'); setDetailOpen(false); }}>
                      <Send className="w-4 h-4" /> Mark as Sent
                    </Button>
                  )}
                  {selectedQuotation.status === 'sent' && (
                    <>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        onClick={() => { handleStatusUpdate(selectedQuotation.id, 'accepted'); setDetailOpen(false); }}>
                        <CheckCircle className="w-4 h-4" /> Accept
                      </Button>
                      <Button variant="outline" className="text-red-600 gap-1.5"
                        onClick={() => { handleStatusUpdate(selectedQuotation.id, 'rejected'); setDetailOpen(false); }}>
                        <XCircle className="w-4 h-4" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
