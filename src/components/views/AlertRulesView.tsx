'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Bell, Plus, Search, ToggleLeft, ToggleRight, Trash2, Edit2,
  Shield, Zap, MapPin, Phone, Battery, AlertTriangle, Clock, Fuel,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ─── Types ───────────────────────────────────────────────────────────

interface AlertRule {
  id: string;
  name: string;
  type: string;
  conditions: Record<string, unknown>;
  channels: string[];
  active: boolean;
  createdAt: string;
  organization: { id: string; name: string };
}

// ─── Constants ───────────────────────────────────────────────────────

const ALERT_TYPES: Record<string, { icon: React.ElementType; label: string; description: string; color: string; bg: string }> = {
  overspeed:          { icon: Zap,           label: 'Overspeed',           description: 'Speed threshold exceeded',        color: 'text-amber-600',  bg: 'bg-amber-50' },
  geofence_enter:     { icon: MapPin,        label: 'Geofence Enter',      description: 'Vehicle entered geofence',          color: 'text-blue-600',   bg: 'bg-blue-50' },
  geofence_exit:      { icon: MapPin,        label: 'Geofence Exit',       description: 'Vehicle exited geofence',           color: 'text-blue-600',   bg: 'bg-blue-50' },
  sos:                { icon: AlertTriangle,  label: 'SOS',                 description: 'Emergency SOS button pressed',      color: 'text-red-600',    bg: 'bg-red-50' },
  idle:               { icon: Clock,         label: 'Idle',                description: 'Vehicle idle too long',             color: 'text-orange-600', bg: 'bg-orange-50' },
  fuel_drop:          { icon: Fuel,          label: 'Fuel Drop',           description: 'Sudden fuel drop detected',         color: 'text-yellow-600', bg: 'bg-yellow-50' },
  tamper:             { icon: Shield,        label: 'Tamper',              description: 'Device tampering detected',         color: 'text-purple-600', bg: 'bg-purple-50' },
  power_off:          { icon: Battery,       label: 'Power Off',           description: 'Device power removed',              color: 'text-slate-600',  bg: 'bg-slate-100' },
  low_battery:        { icon: Battery,       label: 'Low Battery',         description: 'Device battery low',                color: 'text-amber-600',  bg: 'bg-amber-50' },
  harsh_braking:      { icon: Zap,           label: 'Harsh Braking',       description: 'Harsh braking event',                color: 'text-rose-600',   bg: 'bg-rose-50' },
  harsh_acceleration: { icon: Zap,           label: 'Harsh Acceleration',  description: 'Harsh acceleration event',          color: 'text-rose-600',   bg: 'bg-rose-50' },
};

const CHANNEL_OPTIONS = [
  { value: 'in_app',  label: 'In-App',  icon: Bell },
  { value: 'email',   label: 'Email',   icon: Bell },
  { value: 'sms',     label: 'SMS',     icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: Phone },
] as const;

const CHANNEL_COLORS: Record<string, string> = {
  in_app: 'bg-emerald-100 text-emerald-700',
  email: 'bg-blue-100 text-blue-700',
  sms: 'bg-amber-100 text-amber-700',
  whatsapp: 'bg-green-100 text-green-700',
};

// ─── Auth Helper ─────────────────────────────────────────────────────

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

// ─── Animation Variants ──────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: 'easeOut' },
  }),
};

// ─── Component ───────────────────────────────────────────────────────

export default function AlertRulesView() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('');
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  // ── Fetch ──

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await authFetch(`/api/alert-rules?${params}`);
      const data = await res.json();
      if (res.ok) {
        setRules(data.alertRules ?? []);
      }
    } catch {
      toast.error('Failed to load alert rules');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // ── Computed ──

  const totalCount = rules.length;
  const activeCount = rules.filter(r => r.active).length;
  const inactiveCount = totalCount - activeCount;

  // ── CRUD ──

  function openCreateDialog() {
    setEditingRule(null);
    setFormName('');
    setFormType('');
    setFormChannels(['in_app']);
    setFormActive(true);
    setDialogOpen(true);
  }

  function openEditDialog(rule: AlertRule) {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormType(rule.type);
    setFormChannels([...rule.channels]);
    setFormActive(rule.active);
    setDialogOpen(true);
  }

  function toggleChannel(channel: string) {
    setFormChannels(prev =>
      prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel],
    );
  }

  async function handleSave() {
    if (!formName.trim()) { toast.error('Rule name is required'); return; }
    if (!formType) { toast.error('Please select an alert type'); return; }
    if (formChannels.length === 0) { toast.error('Select at least one notification channel'); return; }

    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        type: formType,
        channels: formChannels,
        active: formActive,
      };

      const res = editingRule
        ? await authFetch(`/api/alert-rules/${editingRule.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await authFetch('/api/alert-rules', { method: 'POST', body: JSON.stringify(body) });

      const data = await res.json();
      if (res.ok) {
        toast.success(editingRule ? 'Alert rule updated' : 'Alert rule created');
        setDialogOpen(false);
        fetchRules();
      } else {
        toast.error(data.error || 'Failed to save rule');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(rule: AlertRule) {
    try {
      const res = await authFetch(`/api/alert-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rule.active }),
      });
      if (res.ok) {
        toast.success(rule.active ? 'Rule deactivated' : 'Rule activated');
        fetchRules();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to toggle rule');
      }
    } catch {
      toast.error('Network error');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/api/alert-rules/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Alert rule deleted');
        setDeleteTarget(null);
        fetchRules();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to delete rule');
      }
    } catch {
      toast.error('Network error');
    }
  }

  // ── Helpers ──

  function getTypeInfo(type: string) {
    return ALERT_TYPES[type] ?? { icon: Bell, label: type, description: '', color: 'text-slate-600', bg: 'bg-slate-100' };
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* ── Summary Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 bg-slate-50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-200/60 flex items-center justify-center">
              <Bell className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Rules</p>
              <p className="text-2xl font-bold text-slate-900">{loading ? '—' : totalCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-emerald-50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <ToggleRight className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-500 uppercase tracking-wide">Active Rules</p>
              <p className="text-2xl font-bold text-emerald-700">{loading ? '—' : activeCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-slate-50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-200/60 flex items-center justify-center">
              <ToggleLeft className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Inactive Rules</p>
              <p className="text-2xl font-bold text-slate-500">{loading ? '—' : inactiveCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Search & Create ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search alert rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white h-10"
          onClick={openCreateDialog}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create Alert Rule
        </Button>
      </div>

      {/* ── Rule Cards Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-slate-200/60 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
            <Bell className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-1">No Alert Rules</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-5">
            {search
              ? `No rules matching "${search}". Try a different search term.`
              : 'Create your first alert rule to start monitoring your fleet vehicles in real time.'}
          </p>
          {!search && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={openCreateDialog}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Create Alert Rule
            </Button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rules.map((rule, i) => {
            const typeInfo = getTypeInfo(rule.type);
            const TypeIcon = typeInfo.icon;

            return (
              <motion.div
                key={rule.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <Card className="border-slate-200/60 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-4">
                    {/* Header: Icon + Name + Toggle */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full ${typeInfo.bg} flex items-center justify-center shrink-0`}>
                        <TypeIcon className={`w-5 h-5 ${typeInfo.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate">
                          {rule.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {typeInfo.description}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className="shrink-0 p-0.5 rounded-md hover:bg-slate-100 transition-colors"
                        aria-label={rule.active ? 'Deactivate rule' : 'Activate rule'}
                      >
                        {rule.active ? (
                          <ToggleRight className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-slate-300" />
                        )}
                      </button>
                    </div>

                    {/* Type Badge + Status */}
                    <div className="flex items-center gap-2 mb-3">
                      <Badge
                        variant="secondary"
                        className={`text-[11px] font-medium border-0 ${rule.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {typeInfo.label}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-[11px] font-medium border-0 ${rule.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}
                      >
                        {rule.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {/* Channels */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {rule.channels.map(ch => (
                        <Badge
                          key={ch}
                          variant="secondary"
                          className={`text-[10px] font-medium border-0 ${CHANNEL_COLORS[ch] ?? 'bg-slate-100 text-slate-600'}`}
                        >
                          {ch === 'in_app' ? 'App' : ch === 'sms' ? 'SMS' : ch.charAt(0).toUpperCase() + ch.slice(1)}
                        </Badge>
                      ))}
                    </div>

                    {/* Footer: Date + Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <p className="text-[11px] text-slate-400">
                        Created {formatDate(rule.createdAt)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-slate-400 hover:text-slate-700"
                          onClick={() => openEditDialog(rule)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span className="sr-only">Edit rule</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-slate-400 hover:text-red-600"
                          onClick={() => setDeleteTarget(rule)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="sr-only">Delete rule</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              {editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Rule Name</Label>
              <Input
                id="rule-name"
                placeholder="e.g. High Speed Alert Dubai"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Alert Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select alert type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ALERT_TYPES).map(([key, info]) => {
                    const Icon = info.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-slate-500" />
                          <span>{info.label}</span>
                          <span className="text-xs text-slate-400">— {info.description}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Channels */}
            <div className="space-y-2.5">
              <Label>Notification Channels</Label>
              <div className="grid grid-cols-2 gap-2">
                {CHANNEL_OPTIONS.map(ch => (
                  <label
                    key={ch.value}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                      formChannels.includes(ch.value)
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Checkbox
                      checked={formChannels.includes(ch.value)}
                      onCheckedChange={() => toggleChannel(ch.value)}
                    />
                    <span className="text-sm font-medium text-slate-700">{ch.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between px-1">
              <div>
                <Label className="text-sm font-medium">Active</Label>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formActive ? 'Rule is active and will trigger alerts' : 'Rule is paused and won\'t trigger alerts'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormActive(!formActive)}
                className="shrink-0"
                aria-label="Toggle active"
              >
                {formActive ? (
                  <ToggleRight className="w-8 h-8 text-emerald-600" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-300" />
                )}
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alert Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold text-slate-700">{deleteTarget?.name}</span>? This action cannot be undone and the rule will stop triggering alerts immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              Delete Rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
