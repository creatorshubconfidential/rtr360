'use client';

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

export default function ConnectionStatus() {
  const [status, setStatus] = useState<'online' | 'offline' | 'reconnecting'>('online');

  useEffect(() => {
    const goOffline = () => setStatus('offline');
    const goOnline = () => {
      setStatus('reconnecting');
      // Simulate brief reconnect
      setTimeout(() => setStatus('online'), 1000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (status === 'online') return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-50 lg:hidden">
      <div className={`flex items-center justify-center gap-2 py-2 text-xs font-medium ${
        status === 'offline'
          ? 'bg-red-500 text-white'
          : 'bg-amber-500 text-white'
      }`}>
        {status === 'offline' ? (
          <><WifiOff className="w-3.5 h-3.5" /> You are offline — showing cached data</>
        ) : (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reconnecting...</>
        )}
      </div>
    </div>
  );
}
