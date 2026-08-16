'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Plus, Trash2, Search, Circle, X, ChevronDown,
  MapPinned, Ruler,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { authFetch } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const UAE_CENTER: [number, number] = [24.45, 54.38];

interface Geofence {
  id: string;
  name: string;
  type: string;
  centerLat: number;
  centerLng: number;
  radius?: number | null;
  polygonPoints?: string | null;
  createdAt: string;
  organization?: string;
}

export default function GeofencesView() {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Geofence | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mapClickPos, setMapClickPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const circlesRef = useRef<any[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Create form
  const [form, setForm] = useState({
    name: '',
    type: 'circle',
    centerLat: '',
    centerLng: '',
    radius: '1000',
    polygonPoints: '',
  });

  const fetchGeofences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/geofences');
      const data = await res.json();
      if (res.ok) {
        setGeofences(data.geofences || []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGeofences();
  }, [fetchGeofences]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      const map = L.map(mapContainerRef.current!, {
        center: UAE_CENTER,
        zoom: 7,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      // Click on map to add geofence at that location
      map.on('click', (e: any) => {
        setMapClickPos({ lat: e.latlng.lat, lng: e.latlng.lng });
        setForm((prev) => ({
          ...prev,
          centerLat: e.latlng.lat.toFixed(6),
          centerLng: e.latlng.lng.toFixed(6),
        }));
        setCreateOpen(true);
      });

      mapRef.current = map;
      setMapLoaded(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Draw circles on map when geofences change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    import('leaflet').then((L) => {
      // Clear existing circles
      circlesRef.current.forEach((c) => c.remove());
      circlesRef.current = [];

      geofences.forEach((gf) => {
        if (gf.type === 'circle' && gf.centerLat && gf.centerLng) {
          const circle = L.circle([gf.centerLat, gf.centerLng], {
            radius: gf.radius || 1000,
            color: '#059669',
            fillColor: '#059669',
            fillOpacity: 0.2,
            weight: 2,
          }).addTo(mapRef.current);

          circle.bindPopup(
            `<div style="min-width:160px;font-family:Inter,sans-serif">
              <div style="font-weight:700;font-size:14px">${gf.name}</div>
              <div style="font-size:12px;color:#64748b">${gf.type === 'circle' ? `Circle · ${(gf.radius || 0).toLocaleString()}m` : 'Polygon'}</div>
              <hr style="margin:6px 0;border-color:#e2e8f0"/>
              <div style="font-size:12px;color:#64748b">${gf.centerLat.toFixed(4)}, ${gf.centerLng.toFixed(4)}</div>
              <button onclick="window.dispatchEvent(new CustomEvent('geofence-delete',{detail:'${gf.id}'}))" style="margin-top:8px;padding:4px 12px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Delete</button>
            </div>`,
            { className: '' }
          );

          circlesRef.current.push(circle);
        }
      });
    });
  }, [geofences, mapLoaded]);

  // Listen for popup delete events
  useEffect(() => {
    const handler = ((e: CustomEvent) => {
      const id = e.detail;
      const gf = geofences.find((g) => g.id === id);
      if (gf) handleDelete(gf);
    }) as EventListener;
    window.addEventListener('geofence-delete', handler);
    return () => window.removeEventListener('geofence-delete', handler);
  }, [geofences]);

  const panToGeofence = (gf: Geofence) => {
    if (mapRef.current) {
      mapRef.current.setView([gf.centerLat, gf.centerLng], 13, { animate: true });
      // Open popup for this geofence
      const idx = circlesRef.current.findIndex((c) => {
        const ll = c.getLatLng();
        return Math.abs(ll.lat - gf.centerLat) < 0.001 && Math.abs(ll.lng - gf.centerLng) < 0.001;
      });
      if (idx >= 0) circlesRef.current[idx].openPopup();
      setShowMobileList(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Geofence name is required');
      return;
    }
    if (form.type === 'circle' && (!form.centerLat || !form.centerLng || !form.radius)) {
      toast.error('Lat, Lng, and Radius are required for circle type');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name,
        type: form.type,
        centerLat: parseFloat(form.centerLat),
        centerLng: parseFloat(form.centerLng),
      };
      if (form.type === 'circle') {
        payload.radius = parseInt(form.radius, 10);
      } else {
        payload.polygonPoints = form.polygonPoints;
      }
      const res = await authFetch('/api/geofences', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(`Geofence "${form.name}" created`);
        setCreateOpen(false);
        setForm({ name: '', type: 'circle', centerLat: '', centerLng: '', radius: '1000', polygonPoints: '' });
        setMapClickPos(null);
        fetchGeofences();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to create geofence');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (gf: Geofence) => {
    try {
      const res = await authFetch(`/api/geofences/${gf.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Geofence "${gf.name}" deleted`);
        setDeleteTarget(null);
        fetchGeofences();
      } else {
        toast.error('Failed to delete geofence');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const filtered = geofences.filter(
    (g) => g.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (v: string) =>
    new Date(v).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <MapPinned className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Geofences</h2>
            <p className="text-sm text-slate-500">
              {geofences.length} zone{geofences.length !== 1 ? 's' : ''} configured
            </p>
          </div>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create Geofence
        </Button>
      </div>

      {/* Map + List Layout */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left Panel - List */}
        <AnimatePresence mode="wait">
          {showMobileList && (
            <motion.div
              className="w-full lg:w-80 shrink-0"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="rounded-xl border-slate-200">
                <CardContent className="p-3 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search geofences..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>

                  <ScrollArea className="max-h-[calc(100vh-24rem)]">
                    {loading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-20 rounded-lg bg-slate-100 animate-pulse" />
                        ))}
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="text-center py-8">
                        <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No geofences found</p>
                        <p className="text-xs text-slate-300 mt-1">Click on the map or use the button to create one</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filtered.map((gf) => (
                          <motion.div
                            key={gf.id}
                            className="p-3 rounded-lg border border-slate-200/60 hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer transition-all group"
                            onClick={() => panToGeofence(gf)}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm text-slate-900 truncate">{gf.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${
                                      gf.type === 'circle'
                                        ? 'border-emerald-300 text-emerald-700'
                                        : 'border-blue-300 text-blue-700'
                                    }`}
                                  >
                                    <Circle className="w-2.5 h-2.5 mr-0.5" />
                                    {gf.type}
                                  </Badge>
                                  {gf.type === 'circle' && gf.radius && (
                                    <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                                      <Ruler className="w-3 h-3" />
                                      {(gf.radius / 1000).toFixed(gf.radius >= 1000 ? 1 : 2)} km
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  {gf.centerLat.toFixed(4)}, {gf.centerLng.toFixed(4)}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(gf);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Panel - Map */}
        <div className="flex-1 relative">
          {/* Mobile toggle */}
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden absolute top-2 left-2 z-[1000] bg-white shadow-sm"
            onClick={() => setShowMobileList(!showMobileList)}
          >
            <MapPin className="w-3.5 h-3.5 mr-1.5" />
            {showMobileList ? 'Show Map' : 'Show List'}
          </Button>

          <div
            ref={mapContainerRef}
            className="rounded-xl overflow-hidden border border-slate-200/60 shadow-sm bg-slate-100"
            style={{ height: 'calc(100vh - 14rem)', minHeight: '400px' }}
          />

          {mapClickPos && !createOpen && (
            <div className="absolute bottom-4 left-4 z-[1000]">
              <Card className="bg-white/95 backdrop-blur shadow-lg border-slate-200 rounded-xl">
                <CardContent className="p-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs text-slate-600">
                    {mapClickPos.lat.toFixed(4)}, {mapClickPos.lng.toFixed(4)}
                  </span>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white ml-2"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Geofence
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setMapClickPos(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Create Geofence Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Plus className="w-4 h-4 text-emerald-600" />
              </div>
              Create Geofence
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Name</Label>
              <Input
                placeholder="e.g., Dubai Industrial Zone"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="circle">Circle</SelectItem>
                  <SelectItem value="polygon">Polygon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === 'circle' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Latitude</Label>
                    <Input
                      placeholder="24.4539"
                      value={form.centerLat}
                      onChange={(e) => setForm({ ...form, centerLat: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Longitude</Label>
                    <Input
                      placeholder="54.3773"
                      value={form.centerLng}
                      onChange={(e) => setForm({ ...form, centerLng: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Radius (meters)</Label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={form.radius}
                    onChange={(e) => setForm({ ...form, radius: e.target.value })}
                  />
                </div>
                {mapClickPos && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Picked from map: {mapClickPos.lat.toFixed(6)}, {mapClickPos.lng.toFixed(6)}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Polygon Points (JSON)</Label>
                <Input
                  placeholder='[[lat,lng],[lat,lng],...]'
                  value={form.polygonPoints}
                  onChange={(e) => setForm({ ...form, polygonPoints: e.target.value })}
                />
                <p className="text-xs text-slate-400">
                  Click on the map to set center, or enter polygon coordinates manually.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Geofence'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Geofence</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
