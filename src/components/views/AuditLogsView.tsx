 
'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Shield, Monitor, Edit, Trash2, LogIn, LogOut, Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DataTable, type ColumnDef } from '@/components/DataTable';


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

  const columns: ColumnDef<Record<string, unknown>>[] = [
    {
      key: '_idx',
      label: '#',
      className: 'w-12',
      render: (v) => <span className="text-xs text-slate-400">{v as number}</span>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (_value, row) => {
        const log = row as unknown as AuditLogItem;
        const ActionIcon = ACTION_ICONS[log.action] || Monitor;
        return (
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'}`}>
              <ActionIcon className="w-3.5 h-3.5" />
            </div>
            <Badge className={`text-[10px] ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'} border-0`}>{log.action}</Badge>
          </div>
        );
      },
    },
    {
      key: 'entity',
      label: 'Entity',
      render: (v) => <span className="text-sm font-medium text-slate-800">{v as string}</span>,
    },
    {
      key: 'user',
      label: 'User',
      className: 'hidden md:table-cell',
      render: (_value, row) => {
        const log = row as unknown as AuditLogItem;
        return <span className="text-sm text-slate-600">{log.user?.name || 'System'}</span>;
      },
    },
    {
      key: 'ipAddress',
      label: 'IP Address',
      className: 'hidden lg:table-cell',
      render: (v) => <span className="text-xs text-slate-500 font-mono">{(v as string) || '—'}</span>,
    },
    {
      key: 'createdAt',
      label: 'Time',
      render: (v) => <span className="text-xs text-slate-500">{timeAgo(v as string)}</span>,
    },
  ];

  const tableData = logs.map((log, idx) => ({
    ...log,
    _idx: (page - 1) * 20 + idx + 1,
  })) as unknown as Record<string, unknown>[];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Audit Logs</h2>
        <p className="text-sm text-slate-500">System activity & access history</p>
      </div>

      <DataTable<Record<string, unknown>>
        columns={columns}
        data={tableData}
        keyExtractor={(row) => (row as unknown as AuditLogItem).id}
        loading={loading}
        emptyMessage="No audit logs found"
        emptyIcon={Shield}
        searchable
        searchPlaceholder="Search audit logs…"
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        toolbar={
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
        }
        pagination={{
          page,
          pageSize: 20,
          totalPages,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
