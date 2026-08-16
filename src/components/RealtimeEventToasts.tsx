'use client';
import { authFetch } from '@/lib/api';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Gauge, MapPin, Fuel, Wrench, Car,
} from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any -- icon map keys are dynamic event type strings */

const EVENT_ICONS: Record<string, any> = {
  speed_violation: Gauge,
  geofence_exit: MapPin,
  idle_alert: Car,
  fuel_low: Fuel,
  maintenance_reminder: Wrench,
  harsh_braking: AlertTriangle,
};

const EVENT_COLORS: Record<string, string> = {
  speed_violation: 'text-amber-500',
  geofence_exit: 'text-red-500',
  idle_alert: 'text-blue-500',
  fuel_low: 'text-orange-500',
  maintenance_reminder: 'text-purple-500',
  harsh_braking: 'text-red-500',
};

export default function RealtimeEventToasts({ enabled }: { enabled: boolean }) {
  const esRef = useRef<EventSource | null>(null);
  // Ref to hold latest connect fn so onerror can reconnect without circular reference
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;
    const es = new EventSource('/api/realtime/events');
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        const Icon = EVENT_ICONS[data.type] || AlertTriangle;
        const colorClass = EVENT_COLORS[data.type] || 'text-slate-500';

        toast(data.message, {
          icon: <Icon className={`w-4 h-4 ${colorClass}`} />,
          description: data.vehiclePlate ? `Plate: ${data.vehiclePlate}` : undefined,
          duration: 6000,
        });
      } catch {}
    };

    es.onerror = () => {
      es.close();
      // Reconnect after 10s via ref to avoid accessing connect before declaration
      setTimeout(() => {
        if (esRef.current === es) connectRef.current();
      }, 10000);
    };
  }, [enabled]);

  // Keep ref in sync so onerror always calls the latest version
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      esRef.current?.close();
      esRef.current = null;
    }
    return () => {
      esRef.current?.close();
    };
  }, [enabled, connect]);

  return null; // Toasts are rendered by sonner
}
