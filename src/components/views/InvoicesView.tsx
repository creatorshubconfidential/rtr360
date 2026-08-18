'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  FileText, Plus, DollarSign, Clock, CheckCircle2, AlertTriangle, Download,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { authFetch } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  tax: number;
  total: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  subscription?: {
    id: string;
    plan?: { name: string } | null;
  } | null;
}

export default function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    amount: '',
    tax: '5',
    dueDate: '',
    notes: '',
  });

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await authFetch(`/api/invoices?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleCreate = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('Valid amount is required'); return; }
    if (!form.dueDate) { toast.error('Due date is required'); return; }
    setSubmitting(true);
    try {
      const tax = parseFloat(form.tax) || 0;
      const res = await authFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          tax,
          dueDate: form.dueDate,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create invoice'); return; }
      toast.success('Invoice created successfully');
      setCreateOpen(false);
      setForm({ amount: '', tax: '5', dueDate: '', notes: '' });
      fetchInvoices();
    } catch { toast.error('Failed to create invoice'); }
    finally { setSubmitting(false); }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      const res = await authFetch(`/api/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to update'); return; }
      toast.success('Invoice marked as paid');
      fetchInvoices();
    } catch { toast.error('Failed to update invoice'); }
  };

  const totalAmount = invoices.reduce((s, i) => s + i.total, 0);
  const paidAmount = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const pendingAmount = invoices.filter(i => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + i.total, 0);

  const columns: ColumnDef<Record<string, unknown>>[] = [
    {
      key: 'invoiceNumber', label: 'Invoice #', sortable: true,
      render: (_, row) => <span className="font-mono text-sm font-bold text-slate-900">{(row as unknown as Invoice).invoiceNumber}</span>,
    },
    {
      key: 'subscription', label: 'Plan',
      render: (_, row) => <span className="text-sm text-slate-600">{(row as unknown as Invoice).subscription?.plan?.name || '—'}</span>,
    },
    {
      key: 'amount', label: 'Amount', align: 'right',
      render: (_, row) => <span className="text-sm text-slate-700">AED {(row as unknown as Invoice).amount.toLocaleString()}</span>,
    },
    {
      key: 'tax', label: 'Tax', align: 'right',
      render: (_, row) => <span className="text-sm text-slate-500">AED {(row as unknown as Invoice).tax.toLocaleString()}</span>,
    },
    {
      key: 'total', label: 'Total', align: 'right',
      render: (_, row) => <span className="text-sm font-semibold text-slate-900">AED {(row as unknown as Invoice).total.toLocaleString()}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: (_, row) => {
        const inv = row as unknown as Invoice;
        return <Badge className={`text-[11px] ${STATUS_COLORS[inv.status] || 'bg-slate-100 text-slate-600'} border-0`}>{inv.status}</Badge>;
      },
    },
    {
      key: 'dueDate', label: 'Due Date',
      render: (_, row) => <span className="text-sm text-slate-600">{new Date((row as unknown as Invoice).dueDate).toLocaleDateString()}</span>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => {
        const inv = row as unknown as Invoice;
        return (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { window.open(`/api/invoices/${inv.id}/pdf`, '_blank'); }}><Download className="w-3 h-3" /> PDF</Button>
            {inv.status === 'pending' ? (
              <Button className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => handleMarkPaid(inv.id)}>Pay</Button>
            ) : inv.status === 'paid' ? (
              <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Paid</span>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Invoices</h2>
            <p className="text-sm text-slate-500">Billing & payment tracking</p>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-sm px-2.5">{total}</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"><Plus className="w-4 h-4" /> New Invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Amount (AED) *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
                <div className="space-y-2"><Label>Tax (%)</Label><Input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} placeholder="5" /></div>
              </div>
              <div className="space-y-2"><Label>Due Date *</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Invoice notes..." rows={2} /></div>
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <span className="text-slate-500">Total: </span>
                <span className="font-bold text-slate-900">AED {(form.amount ? (parseFloat(form.amount) * (1 + (parseFloat(form.tax) || 0) / 100)) : 0).toFixed(2)}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={submitting}>{submitting ? 'Creating...' : 'Create Invoice'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: FileText, label: 'Total Invoiced', value: `AED ${totalAmount.toLocaleString()}`, color: 'bg-emerald-100 text-emerald-600' },
          { icon: CheckCircle2, label: 'Paid', value: `AED ${paidAmount.toLocaleString()}`, color: 'bg-green-100 text-green-600' },
          { icon: Clock, label: 'Outstanding', value: `AED ${pendingAmount.toLocaleString()}`, color: 'bg-amber-100 text-amber-600' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="rounded-xl border-slate-200/60 shadow-sm">
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}><s.icon className="w-5 h-5" /></div>
                <div className="mt-3">
                  <div className="text-xl font-bold text-slate-900">{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden">
        {loading ? (
          <Card className="rounded-xl border-slate-200/60 shadow-sm"><div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
        ) : invoices.length === 0 ? (
          <Card className="rounded-xl border-slate-200/60">
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <FileText className="w-10 h-10 mb-3" /><p className="text-sm font-medium">No invoices found</p><p className="text-xs mt-1">Create a new invoice</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {invoices.map((inv) => (
              <motion.div key={inv.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="rounded-xl border-slate-200/60 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="font-mono text-sm font-bold text-slate-900">{inv.invoiceNumber}</div>
                      <Badge className={`text-[11px] ${STATUS_COLORS[inv.status] || 'bg-slate-100 text-slate-600'} border-0`}>{inv.status}</Badge>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-sm"><span className="text-slate-500">Amount</span><span className="font-semibold">AED {inv.total.toLocaleString()}</span></div>
                      <div className="flex justify-between text-xs text-slate-500"><span>Due</span><span>{new Date(inv.dueDate).toLocaleDateString()}</span></div>
                      <div className="flex justify-between text-xs text-slate-500"><span>Tax</span><span>AED {inv.tax.toLocaleString()}</span></div>
                    </div>
                    {inv.status === 'pending' && (
                      <Button className="w-full mt-3 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => handleMarkPaid(inv.id)}>Mark as Paid</Button>
                    )}
                    <Button variant="outline" className="w-full mt-2 h-8 text-xs gap-1" onClick={() => { window.open(`/api/invoices/${inv.id}/pdf`, '_blank'); }}><Download className="w-3 h-3" /> Download PDF</Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <DataTable
          columns={columns}
          data={invoices as unknown as Record<string, unknown>[]}
          keyExtractor={(row) => (row as unknown as Invoice).id}
          loading={loading}
          emptyMessage="No invoices found"
          emptyIcon={FileText}
          searchable
          searchPlaceholder="Search by invoice number..."
          searchValue={search}
          onSearch={(q) => { setSearch(q); setPage(1); }}
          toolbar={(
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {['pending', 'paid', 'overdue', 'cancelled'].map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          pagination={{
            page,
            pageSize: 12,
            totalPages,
            onPageChange: setPage,
          }}
          exportFilename="invoices"
        />
      </div>
    </div>
  );
}
