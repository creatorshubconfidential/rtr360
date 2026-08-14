'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Settings, Save, Building2, Globe, Bell, Shield,
  Palette, Database, Mail, Phone, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

function authFetch(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rtr_token') : null;
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
}

export default function SettingsView() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [orgForm, setOrgForm] = useState({
    org_name: '',
    org_email: '',
    org_phone: '',
    org_website: '',
    org_address: '',
    org_emirate: '',
  });

  const [notifForm, setNotifForm] = useState({
    notify_email: 'true',
    notify_sms: 'false',
    notify_whatsapp: 'true',
    alert_overspeed: 'true',
    alert_geofence: 'true',
    alert_sos: 'true',
  });

  const [gpsForm, setGpsForm] = useState({
    gps_update_interval: '30',
    gps_idle_timeout: '300',
    gps_speed_threshold: '120',
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await authFetch('/api/settings');
        const data = await res.json();
        if (res.ok && data.settings) {
          setSettings(data.settings);
          // Populate forms
          const s = data.settings;
          setOrgForm({
            org_name: s.org_name || '',
            org_email: s.org_email || '',
            org_phone: s.org_phone || '',
            org_website: s.org_website || '',
            org_address: s.org_address || '',
            org_emirate: s.org_emirate || '',
          });
          setNotifForm({
            notify_email: s.notify_email || 'true',
            notify_sms: s.notify_sms || 'false',
            notify_whatsapp: s.notify_whatsapp || 'true',
            alert_overspeed: s.alert_overspeed || 'true',
            alert_geofence: s.alert_geofence || 'true',
            alert_sos: s.alert_sos || 'true',
          });
          setGpsForm({
            gps_update_interval: s.gps_update_interval || '30',
            gps_idle_timeout: s.gps_idle_timeout || '300',
            gps_speed_threshold: s.gps_speed_threshold || '120',
          });
        }
      } catch { /* settings may be empty */ }
      finally { setLoading(false); }
    };
    fetchSettings();
  }, []);

  const saveSetting = async (key: string, value: string) => {
    setSaving(key);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to save'); return; }
      toast.success('Setting saved');
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch { toast.error('Failed to save setting'); }
    finally { setSaving(null); }
  };

  const saveOrgSettings = () => {
    Object.entries(orgForm).forEach(([key, value]) => saveSetting(key, value));
  };

  const saveNotifSettings = () => {
    Object.entries(notifForm).forEach(([key, value]) => saveSetting(key, value));
  };

  const saveGpsSettings = () => {
    Object.entries(gpsForm).forEach(([key, value]) => saveSetting(key, value));
  };

  if (loading) {
    return <div className="space-y-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">Platform configuration & preferences</p>
      </div>

      {/* Organization Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
              <div><CardTitle className="text-base">Organization Details</CardTitle><CardDescription>Company information and contact details</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Organization Name</Label><Input value={orgForm.org_name} onChange={(e) => setOrgForm({ ...orgForm, org_name: e.target.value })} placeholder="RTR 360" /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={orgForm.org_email} onChange={(e) => setOrgForm({ ...orgForm, org_email: e.target.value })} placeholder="info@rtr.ae" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={orgForm.org_phone} onChange={(e) => setOrgForm({ ...orgForm, org_phone: e.target.value })} placeholder="+971-4-XXX-XXXX" /></div>
              <div className="space-y-2"><Label>Website</Label><Input value={orgForm.org_website} onChange={(e) => setOrgForm({ ...orgForm, org_website: e.target.value })} placeholder="https://rtr.ae" /></div>
              <div className="space-y-2 md:col-span-2"><Label>Address</Label><Input value={orgForm.org_address} onChange={(e) => setOrgForm({ ...orgForm, org_address: e.target.value })} placeholder="Office address..." /></div>
              <div className="space-y-2"><Label>Emirate</Label>
                <Select value={orgForm.org_emirate} onValueChange={(v) => setOrgForm({ ...orgForm, org_emirate: v })}>
                  <SelectTrigger><SelectValue placeholder="Select emirate" /></SelectTrigger>
                  <SelectContent>
                    {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'UAQ', 'RAK', 'Fujairah'].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end pt-2"><Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" onClick={saveOrgSettings} disabled={!!saving}><Save className="w-4 h-4" /> Save Organization</Button></div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notification Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><Bell className="w-5 h-5" /></div>
              <div><CardTitle className="text-base">Notifications & Alerts</CardTitle><CardDescription>Configure how you receive alerts and notifications</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'notify_email', label: 'Email Notifications', form: notifForm, setForm: setNotifForm },
                { key: 'notify_sms', label: 'SMS Notifications', form: notifForm, setForm: setNotifForm },
                { key: 'notify_whatsapp', label: 'WhatsApp Notifications', form: notifForm, setForm: setNotifForm },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  <Select value={item.form[item.key as keyof typeof item.form]} onValueChange={(v) => item.setForm({ ...item.form, [item.key]: v })}>
                    <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="true">Enabled</SelectItem><SelectItem value="false">Disabled</SelectItem></SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Alert Types</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { key: 'alert_overspeed', label: 'Overspeed Alerts' },
                { key: 'alert_geofence', label: 'Geofence Alerts' },
                { key: 'alert_sos', label: 'SOS / Emergency Alerts' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <span className="text-sm text-slate-700">{item.label}</span>
                  <Select value={notifForm[item.key as keyof typeof notifForm]} onValueChange={(v) => setNotifForm({ ...notifForm, [item.key]: v })}>
                    <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="true">On</SelectItem><SelectItem value="false">Off</SelectItem></SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2"><Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" onClick={saveNotifSettings} disabled={!!saving}><Save className="w-4 h-4" /> Save Notifications</Button></div>
          </CardContent>
        </Card>
      </motion.div>

      {/* GPS Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center"><Globe className="w-5 h-5" /></div>
              <div><CardTitle className="text-base">GPS & Tracking</CardTitle><CardDescription>GPS device configuration parameters</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Update Interval (sec)</Label>
                <Input type="number" value={gpsForm.gps_update_interval} onChange={(e) => setGpsForm({ ...gpsForm, gps_update_interval: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Idle Timeout (sec)</Label>
                <Input type="number" value={gpsForm.gps_idle_timeout} onChange={(e) => setGpsForm({ ...gpsForm, gps_idle_timeout: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Speed Threshold (km/h)</Label>
                <Input type="number" value={gpsForm.gps_speed_threshold} onChange={(e) => setGpsForm({ ...gpsForm, gps_speed_threshold: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end pt-2"><Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" onClick={saveGpsSettings} disabled={!!saving}><Save className="w-4 h-4" /> Save GPS Settings</Button></div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Platform Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="rounded-xl border-slate-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Shield className="w-5 h-5" /></div>
              <div><CardTitle className="text-base">Platform Info</CardTitle><CardDescription>System information and branding</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 rounded-lg bg-slate-50"><div className="text-lg font-bold text-slate-900">RTR 360</div><div className="text-xs text-slate-500">Platform</div></div>
              <div className="p-3 rounded-lg bg-slate-50"><div className="text-lg font-bold text-emerald-600">Mianx.ai</div><div className="text-xs text-slate-500">Powered By</div></div>
              <div className="p-3 rounded-lg bg-slate-50"><div className="text-lg font-bold text-slate-900">UAE</div><div className="text-xs text-slate-500">Market</div></div>
              <div className="p-3 rounded-lg bg-slate-50"><div className="text-lg font-bold text-slate-900">Phase 5</div><div className="text-xs text-slate-500">Current</div></div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
