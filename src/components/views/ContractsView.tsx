'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  FileText, Plus, Search, ChevronLeft, ChevronRight, Trash2,
  Edit, AlertTriangle, Clock, CheckCircle2, XCircle, FilePen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function authFetch(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rtr_token') : null;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  expired: 'bg-red-100 text-red-700 border-red-200',
  terminated: 'bg-slate-100 text-slate-600 border-slate-200',
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  active: CheckCircle2,
  expired: XCircle,
  terminated: XCircle,
  draft: FilePen,
};

interface Contract {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  status: string;
  terms: string | null;
  createdAt: string;
  organization: { id: string; name: string } | null;
}

const initialForm = {
  title: '', startDate: '', endDate: '', status: 'draft', terms: '',
};

export default function ContractsView() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await authFetch(`/api/contracts?${params}`);
      const data = await res.json();
      if (res.ok) {
        setContracts(data.contracts || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const getDaysRemaining = (endDate: string | null, status: string): number | null => {
    if (status !== 'active' || !endDate) return null;
    const end = new Date(endDate).getTime();
    const now = Date.now();
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  };

  const activeCount = contracts.filter((c) => c.status === 'active').length;
  const expiringSoonCount = contracts.filter((c) => {
    const days = getDaysRemaining(c.endDate, c.status);
    return days !== null && days >= 0 && days <= 30;
  }).length;

  const openCreate = () => {
    setEditingContract(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const openEdit = (contract: Contract) => {
    setEditingContract(contract);
    setForm({
      title: contract.title,
      startDate: contract.startDate?.slice(0, 10) || '',
      endDate: contract.endDate?.slice(0, 10) || '',
      status: contract.status,
      terms: contract.terms || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Contract title is required');
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error('Start and end dates are required');
      return;
    }
    setSubmitting(true);
    try {
      const url = editingContract ? `/api/contracts/${editingContract.id}` : '/api/contracts';
      const method = editingContract ? 'PATCH' : 'POST';
      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          title: form.title,
          startDate: form.startDate,
          endDate: form.endDate,
          status: form.status,
          terms: form.terms || null,
        }),
      });
      if (res.ok) {
        toast.success(editingContract ? 'Contract updated' : 'Contract created');
        setDialogOpen(false);
        fetchContracts();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Operation failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/api/contracts/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Contract deleted');
        setDeleteTarget(null);
        fetchContracts();
      } else {
        toast.error('Failed to delete contract');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const formatDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const formatDaysRemaining = (days: number | null) => {
    if (days === null) return '—';
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Today';
    return `${days}d remaining`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total</p>
              <p className="text-xl font-bold text-slate-900">{contracts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Active</p>
              <p className="text-xl font-bold text-emerald-600">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Expiring Soon</p>
              <p className="text-xl font-bold text-amber-600">{expiringSoonCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Draft</p>
              <p className="text-xl font-bold text-slate-600">
                {contracts.filter((c) => c.status === 'draft').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search contracts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />Create Contract
          </Button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <Card className="rounded-xl border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Title</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Organization</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Start Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">End Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Days Remaining</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No contracts found</p>
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract, idx) => {
                  const days = getDaysRemaining(contract.endDate, contract.status);
                  const StatusIcon = STATUS_ICONS[contract.status] || FileText;
                  const daysColor = days !== null && days <= 7 && days >= 0
                    ? 'text-red-600'
                    : days !== null && days <= 30
                      ? 'text-amber-600'
                      : 'text-slate-600';
                  return (
                    <motion.tr
                      key={contract.id}
                      className="border-b last:border-0 hover:bg-slate-50/50 transition-colors"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold text-sm text-slate-900">{contract.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{contract.organization?.name || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{formatDate(contract.startDate)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{formatDate(contract.endDate)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[contract.status] || ''}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${daysColor}`}>
                          {formatDaysRemaining(days)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(contract)}>
                            <Edit className="w-3.5 h-3.5 text-slate-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDeleteTarget(contract)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-xl border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
              </CardContent>
            </Card>
          ))
        ) : contracts.length === 0 ? (
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-8 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No contracts found</p>
            </CardContent>
          </Card>
        ) : (
          contracts.map((contract, idx) => {
            const days = getDaysRemaining(contract.endDate, contract.status);
            return (
              <motion.div
                key={contract.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
              >
                <Card className="rounded-xl border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{contract.title}</p>
                          <p className="text-xs text-slate-500">{contract.organization?.name || 'No org'}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[contract.status] || ''}`}>
                        {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">Start: </span>
                        <span className="text-slate-600">{formatDate(contract.startDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">End: </span>
                        <span className="text-slate-600">{formatDate(contract.endDate)}</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className={`text-xs font-medium ${daysColor}`}>
                        {formatDaysRemaining(days)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(contract)}>
                          <Edit className="w-3 h-3 mr-1" />Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => setDeleteTarget(contract)}>
                          <Trash2 className="w-3 h-3 mr-1" />Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
              {editingContract ? 'Edit Contract' : 'Create Contract'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Title *</Label>
              <Input
                placeholder="Contract title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Start Date *</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">End Date *</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Terms & Conditions</Label>
              <Textarea
                placeholder="Enter contract terms..."
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : editingContract ? 'Update Contract' : 'Create Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.title}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
