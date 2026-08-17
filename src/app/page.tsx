'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import LoginScreen from '@/components/LoginScreen';
import AdminDashboard from '@/components/AdminDashboard';
import type { UserSession } from '@/lib/types';

export default function Home() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error('Not authenticated');
        const data = await res.json();
        setUser(data.user);
      } catch {
        // Session invalid or expired — stay on login screen
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = (loggedInUser: UserSession) => {
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* silent */ }
    setUser(null);
    toast.info('You have been logged out');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--rtr-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <AdminDashboard user={user} onLogout={handleLogout} />;
}
