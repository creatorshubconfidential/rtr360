'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Shield, Search, ChevronLeft, ChevronRight,
  User, Monitor, Edit, Trash2, LogIn, LogOut, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';


import { authFetch } from '@/lib/api';
const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  login: 'bg-purple-100 text-purple-700',
  logout: 'bg-slate-100 text-slate-600',
  view: 'bg-cyan-100 text-cyan-700',
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Plus,
  update: Edit,
  delete: Trash2,
  login: LogIn,
  logout: LogOut,
  view: Monitor,
};

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

export default function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (entityFilter !== 'all') params.set('entity', entityFilter);
      const res = await authFetch(`/api/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.auditLogs || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      } else {
        toast.error(data.error || 'Access denied');
      }
    } catch { toast.error('Failed to load audit logs'); }
    finally { setLoading(false); }
  }, [page, actionFilter, entityFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

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
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Audit Logs</h2>
        <p className="text-sm text-slate-500">System activity & access history</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All Actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {['create', 'update', 'delete', 'login', 'logout', 'view'].map(a => (
              <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Entities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {['User', 'Vehicle', 'Driver', 'Device', 'Lead', 'Ticket', 'Invoice', 'MaintenanceRecord', 'Installation', 'Quotation'].map(e => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <Card className="rounded-xl border-slate-200/60 shadow-sm"><div className="p-6 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
      ) : logs.length === 0 ? (
        <Card className="rounded-xl border-slate-200/60">
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Shield className="w-10 h-10 mb-3" /><p className="text-sm font-medium">No audit logs found</p>
          </div>
        </Card>
      ) : (
        <>
          <Card className="rounded-xl border-slate-200/60 shadow-sm overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-slate-50/80">
                <TableHead className="text-xs uppercase tracking-wide text-slate-500 w-12">#</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Action</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Entity</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden md:table-cell">User</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500 hidden lg:table-cell">IP Address</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Time</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {logs.map((log, idx) => {
                  const ActionIcon = ACTION_ICONS[log.action] || Monitor;
                  return (
                    <TableRow key={log.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-xs text-slate-400">{(page - 1) * 20 + idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'}`}>
                            <ActionIcon className="w-3.5 h-3.5" />
                          </div>
                          <Badge className={`text-[10px] ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'} border-0`}>{log.action}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-800">{log.entity}</TableCell>
                      <TableCell className="text-sm text-slate-600 hidden md:table-cell">{log.user?.name || 'System'}</TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono hidden lg:table-cell">{log.ipAddress || '—'}</TableCell>
                      <TableCell className="text-xs text-slate-500">{timeAgo(log.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Page {page} of {totalPages} ({total} records)</p>
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
