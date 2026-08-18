'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Users, Plus, Trash2,
  Edit, UserCheck, UserX, Shield, Mail, Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const ROLES = [
  'super_admin', 'platform_admin', 'operations_manager',
  'sales_manager', 'fleet_manager', 'dispatcher', 'viewer', 'org_owner',
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 border-red-200',
  platform_admin: 'bg-purple-100 text-purple-700 border-purple-200',
  operations_manager: 'bg-blue-100 text-blue-700 border-blue-200',
  sales_manager: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  fleet_manager: 'bg-amber-100 text-amber-700 border-amber-200',
  dispatcher: 'bg-slate-100 text-slate-700 border-slate-200',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
  org_owner: 'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500',
  inactive: 'bg-slate-400',
  suspended: 'bg-red-500',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  platform_admin: 'Platform Admin',
  operations_manager: 'Ops Manager',
  sales_manager: 'Sales Manager',
  fleet_manager: 'Fleet Manager',
  dispatcher: 'Dispatcher',
  viewer: 'Viewer',
  org_owner: 'Org Owner',
};

interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  organizationId: string;
  lastLoginAt: string | null;
  createdAt: string;
  organization: { id: string; name: string } | null;
}

const initialForm = {
  name: '', email: '', password: '', phone: '', role: 'viewer', status: 'active', organizationId: '',
};

export default function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await authFetch(`/api/users?${params}`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      phone: user.phone || '',
      role: user.role,
      status: user.status,
      organizationId: user.organizationId || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!editingUser && !form.password) {
      toast.error('Password is required for new users');
      return;
    }
    setSubmitting(true);
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        role: form.role,
        status: form.status,
      };
      if (form.organizationId) (payload as Record<string, unknown>).organizationId = form.organizationId;
      if (form.password) (payload as Record<string, unknown>).password = form.password;

      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      if (res.ok) {
        toast.success(editingUser ? 'User updated successfully' : 'User created successfully');
        setDialogOpen(false);
        fetchUsers();
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
      const res = await authFetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('User deleted successfully');
        setDeleteTarget(null);
        fetchUsers();
      } else {
        toast.error('Failed to delete user');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const activeCount = users.filter((u) => u.status === 'active').length;
  const inactiveCount = users.filter((u) => u.status === 'inactive').length;

  const formatDateTime = (v: string | null) => {
    if (!v) return '—';
    return new Date(v).toLocaleDateString('en-AE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const tableColumns: ColumnDef<Record<string, unknown>>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (_value, row) => {
        const user = row as unknown as User;
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
              {getInitials(user.name)}
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-900">{user.name}</p>
              {!user.emailVerified && (
                <span className="text-[10px] text-amber-600">Not verified</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-slate-600 flex items-center gap-1">
          <Mail className="w-3 h-3 text-slate-400" />
          {value as string}
        </span>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (value) => (
        <span className="text-sm text-slate-600 flex items-center gap-1">
          <Phone className="w-3 h-3 text-slate-400" />
          {(value as string) || '—'}
        </span>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (value) => (
        <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[value as string] || ROLE_COLORS.viewer}`}>
          <Shield className="w-2.5 h-2.5 mr-1" />
          {ROLE_LABELS[value as string] || (value as string)}
        </Badge>
      ),
    },
    {
      key: 'organization',
      label: 'Organization',
      render: (_value, row) => {
        const user = row as unknown as User;
        return <span className="text-sm text-slate-600">{user.organization?.name || '—'}</span>;
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[value as string] || 'bg-slate-400'}`} />
          <span className="text-sm text-slate-700 capitalize">{value as string}</span>
        </div>
      ),
    },
    {
      key: 'lastLoginAt',
      label: 'Last Login',
      render: (value) => {
        if (!value) return '—';
        return (
          <span className="text-xs text-slate-500">
            {new Date(value as string).toLocaleDateString('en-AE', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right' as const,
      render: (_value, row) => {
        const user = row as unknown as User;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(user)}>
              <Edit className="w-3.5 h-3.5 text-slate-500" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDeleteTarget(user)}>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Users</p>
              <p className="text-xl font-bold text-slate-900">{users.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Active</p>
              <p className="text-xl font-bold text-emerald-600">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <UserX className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Inactive</p>
              <p className="text-xl font-bold text-slate-600">{inactiveCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <DataTable<Record<string, unknown>>
          columns={tableColumns}
          data={users as unknown as Record<string, unknown>[]}
          keyExtractor={(row) => (row as unknown as User).id}
          loading={loading}
          emptyMessage="No users found"
          emptyIcon={Users}
          searchable
          searchPlaceholder="Search users by name or email..."
          searchValue={search}
          onSearch={(q) => { setSearch(q); setPage(1); }}
          pagination={{
            page,
            pageSize: 15,
            totalPages,
            onPageChange: setPage,
          }}
          toolbar={
            <div className="flex items-center gap-2">
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1.5" />Create User
              </Button>
            </div>
          }
        />
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-xl border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-2/3" />
              </CardContent>
            </Card>
          ))
        ) : users.length === 0 ? (
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-8 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No users found</p>
            </CardContent>
          </Card>
        ) : (
          users.map((user, idx) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <Card className="rounded-xl border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
                        {getInitials(user.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[user.role] || ROLE_COLORS.viewer}`}>
                      {ROLE_LABELS[user.role] || user.role}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Phone className="w-3 h-3" />{user.phone || '—'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[user.status] || 'bg-slate-400'}`} />
                      <span className="text-slate-600 capitalize">{user.status}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 col-span-2">
                      {user.organization?.name || 'No organization'}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{formatDateTime(user.lastLoginAt)}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(user)}>
                        <Edit className="w-3 h-3 mr-1" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => setDeleteTarget(user)}>
                        <Trash2 className="w-3 h-3 mr-1" />Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Mobile Search + Filters */}
      <div className="md:hidden flex flex-col gap-3">
        <Input
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-9"
        />
        <div className="flex gap-2">
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="All Roles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />Create
          </Button>
        </div>
      </div>

      {/* Mobile Pagination */}
      {totalPages > 1 && (
        <div className="md:hidden flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </Button>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              {editingUser ? 'Edit User' : 'Create User'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Name *</Label>
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email *</Label>
              <Input
                type="email"
                placeholder="user@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {editingUser ? 'Reset Password (leave blank to keep)' : 'Password *'}
              </Label>
              <Input
                type="password"
                placeholder={editingUser ? 'New password' : 'Min 8 characters'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Phone</Label>
              <Input
                placeholder="+971 XX XXX XXXX"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be
              undone.
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
