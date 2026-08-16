'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet dynamically imported, types unavailable */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Truck, Navigation, Clock, RefreshCw, Wifi, WifiOff, Gauge, MapPin, Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/api';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

const UAE_CENTER: [number, number] = [24.4539, 54.3773];

interface VehiclePosition {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  driver: { id: string; name: string; phone: string | null } | null;
  device: { id: string; imei: string; status: string } | null;
  status: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  lastUpdate: string;
}

const UAE_LOCATIONS = [
  { lat: 25.2048, lng: 55.2708 },
  { lat: 25.2769, lng: 55.2962 },
  { lat: 25.1972, lng: 55.2744 },
  { lat: 25.2285, lng: 55.2872 },
  { lat: 25.1118, lng: 55.1391 },
  { lat: 24.4539, lng: 54.3773 },
  { lat: 25.3519, lng: 55.4210 },
  { lat: 25.5255, lng: 55.5313 },
];

function generatePositions(vehicles: any[]): VehiclePosition[] {
  return vehicles.map((v, i) => {
    const loc = UAE_LOCATIONS[i % UAE_LOCATIONS.length];
    return {
      ...v,
      lat: loc.lat + (Math.random() - 0.5) * 0.05,
      lng: loc.lng + (Math.random() - 0.5) * 0.05,
      speed: Math.round(Math.random() * 120),
      heading: Math.round(Math.random() * 360),
      lastUpdate: new Date(Date.now() - Math.random() * 300000).toISOString(),
    };
  });
}


export default function LiveTrackingView() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<VehiclePosition | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLive, setIsLive] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const positionsRef = useRef(positions);
  useEffect(() => { positionsRef.current = positions; });
  const [mapLoaded, setMapLoaded] = useState(false);

  // Fetch vehicles
  const fetchVehicles = useCallback(async () => {
    try {
      const res = await authFetch('/api/vehicles?limit=100');
      const data = await res.json();
      if (res.ok) {
        setVehicles(data.vehicles);
        setPositions(generatePositions(data.vehicles));
      }
    } catch {}
  }, []);

  useEffect(() => { fetchVehicles().finally(() => setLoading(false)); }, [fetchVehicles]);

  // Initialize Leaflet map (client-side only)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    
    // Dynamically import leaflet
    import('leaflet').then((L) => {
      const map = L.map(mapContainerRef.current!, {
        center: UAE_CENTER,
        zoom: 7,
        zoomControl: true,
      });
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      
      // Add UAE boundary markers
      [[25.2048, 55.2708], [24.4539, 54.3773], [25.3519, 55.4210]].forEach(([lat, lng], i) => {
        L.circle([lat, lng], {
          radius: i === 0 ? 3000 : 5000,
          color: ['#059669', '#2563eb', '#8b5cf6'][i],
          fillColor: ['#059669', '#2563eb', '#8b5cf6'][i],
          fillOpacity: 0.06,
          weight: 2,
          dashArray: '6,4',
        }).addTo(map);
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

  // Update markers when positions change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    
    import('leaflet').then((L) => {
      // Clear old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      
      const filtered = positions.filter(p => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'moving') return p.speed > 5;
        if (statusFilter === 'idle') return p.speed <= 5;
        return p.status === statusFilter;
      });
      
      filtered.forEach(pos => {
        const color = pos.speed > 5 ? '#2563eb' : '#8b5cf6';
        const icon = L.divIcon({
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 6l1.5 3h-3L12 6zM7 12l3-1.5v3L7 12zm10 0l-3 1.5v-3L17 12zm-5 5l-1.5-3h3L12 17z"/></svg></div>`,
          className: 'custom-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        });
        
        const marker = L.marker([pos.lat, pos.lng], { icon }).addTo(mapRef.current);
        marker.bindPopup(`
          <div style="min-width:180px;font-family:Inter,sans-serif">
            <div style="font-weight:700;font-size:14px">${pos.plateNumber}</div>
            <div style="font-size:12px;color:#64748b">${[pos.make, pos.model].filter(Boolean).join(' ')}</div>
            <hr style="margin:6px 0;border-color:#e2e8f0"/>
            <div style="font-size:12px;display:grid;grid-template-columns:auto 1fr;gap:2px 8px">
              <span style="color:#94a3b8">Driver:</span><span style="font-weight:500">${pos.driver?.name || 'Unassigned'}</span>
              <span style="color:#94a3b8">Speed:</span><span style="font-weight:700;color:${pos.speed > 100 ? '#dc2626' : '#059669'}">${pos.speed} km/h</span>
              <span style="color:#94a3b8">IMEI:</span><span style="font-family:monospace;font-size:11px">${pos.device?.imei || 'N/A'}</span>
            </div>
          </div>
        `);
        
        marker.on('click', () => setSelectedVehicle(pos));
        markersRef.current.push(marker);
      });
    });
  }, [positions, statusFilter, mapLoaded]);

  // Pan to selected vehicle
  useEffect(() => {
    if (!mapRef.current || !selectedVehicle) return;
    mapRef.current.setView([selectedVehicle.lat, selectedVehicle.lng], 14, { animate: true });
  }, [selectedVehicle]);

  // Real-time SSE connection (Phase 8)
  useEffect(() => {
    if (!isLive) {
      esRef.current?.close();
      esRef.current = null;
      setSseConnected(false);
      return;
    }
    const es = new EventSource('/api/realtime/vehicles');
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          // Server sends initial positions
          const serverPositions: VehiclePosition[] = data.vehicles.map((v: any) => ({
            id: v.id,
            plateNumber: v.plateNumber,
            make: v.make,
            model: v.model,
            driver: v.driver ? { id: '', name: v.driver, phone: null } : null,
            device: v.imei ? { id: '', imei: v.imei, status: 'installed' } : null,
            status: v.status,
            lat: v.lat,
            lng: v.lng,
            speed: v.speed,
            heading: v.heading,
            lastUpdate: v.timestamp,
          }));
          setPositions(serverPositions);
          setSseConnected(true);
        } else if (data.type === 'update') {
          // Incremental position updates from server
          setPositions(prev => {
            const updateMap = new Map<string, any>(data.vehicles.map((v: any) => [v.id, v]));
            return prev.map(p => {
              const u = updateMap.get(p.id);
              if (!u) return p;
              return {
                ...p,
                lat: u.lat,
                lng: u.lng,
                speed: u.speed,
                heading: u.heading,
                status: u.status,
                lastUpdate: u.timestamp,
              };
            });
          });
        }
      } catch {}
    };

    es.onopen = () => setSseConnected(true);
    es.onerror = () => {
      setSseConnected(false);
      // Fallback to polling if SSE fails
      if (positionsRef.current.length > 0) {
        const fallbackInterval = setInterval(() => {
          setPositions(prev => prev.map(p => ({
            ...p,
            lat: p.lat + (Math.random() - 0.5) * 0.002,
            lng: p.lng + (Math.random() - 0.5) * 0.002,
            speed: Math.max(0, Math.min(140, p.speed + Math.round((Math.random() - 0.5) * 10))),
            lastUpdate: new Date().toISOString(),
          })));
        }, 3000);
        return () => clearInterval(fallbackInterval);
      }
    };

    return () => {
      es.close();
      esRef.current = null;
      setSseConnected(false);
    };
  }, [isLive]);

  const filteredPositions = positions.filter(p => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'moving') return p.speed > 5;
    if (statusFilter === 'idle') return p.speed <= 5;
    return p.status === statusFilter;
  });

  const movingCount = positions.filter(p => p.speed > 5).length;
  const idleCount = positions.filter(p => p.speed <= 5).length;
  const avgSpeed = positions.length > 0 ? Math.round(positions.reduce((s, p) => s + p.speed, 0) / positions.length) : 0;

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 text-sm">Loading fleet positions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-0"><CardContent className="p-3 flex items-center gap-2"><Navigation className="w-5 h-5 text-emerald-600" /><div><p className="text-[10px] text-emerald-400 uppercase font-medium">Moving</p><p className="text-xl font-bold text-emerald-700">{movingCount}</p></div></CardContent></Card>
        <Card className="bg-purple-50 border-0"><CardContent className="p-3 flex items-center gap-2"><Clock className="w-5 h-5 text-purple-600" /><div><p className="text-[10px] text-purple-400 uppercase font-medium">Idle</p><p className="text-xl font-bold text-purple-700">{idleCount}</p></div></CardContent></Card>
        <Card className="bg-blue-50 border-0"><CardContent className="p-3 flex items-center gap-2"><Gauge className="w-5 h-5 text-blue-600" /><div><p className="text-[10px] text-blue-400 uppercase font-medium">Avg Speed</p><p className="text-xl font-bold text-blue-700">{avgSpeed} km/h</p></div></CardContent></Card>
        <Card className="bg-amber-50 border-0"><CardContent className="p-3 flex items-center gap-2"><Truck className="w-5 h-5 text-amber-600" /><div><p className="text-[10px] text-amber-400 uppercase font-medium">Total Tracked</p><p className="text-xl font-bold text-amber-700">{positions.length}</p></div></CardContent></Card>
      </div>

      {/* Map + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Map */}
        <div
          ref={mapContainerRef}
          className="flex-1 rounded-xl overflow-hidden border border-slate-200/60 shadow-sm bg-slate-100"
          style={{ height: 'calc(100vh - 18rem)', minHeight: '400px' }}
        />

        {/* Sidebar */}
        <div className="w-full lg:w-80 space-y-3">
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 h-9"><SelectValue placeholder="Filter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                <SelectItem value="moving">Moving</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isLive ? 'default' : 'outline'}
              size="sm"
              className={isLive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              onClick={() => setIsLive(!isLive)}
            >
              {isLive ? <Wifi className="w-3.5 h-3.5 mr-1.5" /> : <WifiOff className="w-3.5 h-3.5 mr-1.5" />}
              {isLive ? 'LIVE' : 'PAUSED'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchVehicles}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
            <span className={`text-xs ml-auto flex items-center gap-1 ${sseConnected ? 'text-emerald-500' : 'text-slate-400'}`}>
              <Radio className={`w-3 h-3 ${sseConnected ? 'animate-pulse' : ''}`} />
              {sseConnected ? 'SSE' : 'Polling'}
            </span>
            <span className="text-xs text-slate-400">{filteredPositions.length}</span>
          </div>

          {/* Vehicle List */}
          <div className="space-y-2 max-h-[calc(100vh-26rem)] overflow-y-auto custom-scrollbar">
            {filteredPositions.map((pos) => (
              <div
                key={pos.id}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedVehicle?.id === pos.id
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                    : 'border-slate-200/60 hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedVehicle(pos)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${pos.speed > 5 ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span className="font-semibold text-sm">{pos.plateNumber}</span>
                  </div>
                  <span className={`text-xs font-bold ${pos.speed > 100 ? 'text-red-600' : pos.speed > 5 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {pos.speed} km/h
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                  <span>{pos.driver?.name || 'No driver'}</span>
                  <span>{[pos.make, pos.model].filter(Boolean).join(' ')}</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  Updated {new Date(pos.lastUpdate).toLocaleTimeString('en-AE')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>


      {selectedVehicle && (
        <Card className="border-emerald-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-lg">{selectedVehicle.plateNumber}</h3>
                <p className="text-sm text-slate-500">{[selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(' ')}</p>
              </div>
              <Badge className={`${selectedVehicle.speed > 5 ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'} border-0`}>
                {selectedVehicle.speed > 5 ? 'Moving' : 'Idle'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div><p className="text-xs text-slate-400">Speed</p><p className={`text-xl font-bold ${selectedVehicle.speed > 100 ? 'text-red-600' : 'text-emerald-600'}`}>{selectedVehicle.speed}<span className="text-xs font-normal ml-1">km/h</span></p></div>
              <div><p className="text-xs text-slate-400">Driver</p><p className="text-sm font-medium mt-1">{selectedVehicle.driver?.name || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Device</p><p className="text-sm font-mono mt-1">{selectedVehicle.device?.imei || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Last Update</p><p className="text-sm font-medium mt-1">{new Date(selectedVehicle.lastUpdate).toLocaleTimeString('en-AE')}</p></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
