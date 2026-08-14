'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellOff, CheckCheck, AlertTriangle, Ticket,
  Wrench, CreditCard, Settings, Info, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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

type NotificationType = 'alert' | 'ticket' | 'maintenance' | 'invoice' | 'system' | 'info';

const TYPE_CONFIG: Record<NotificationType, { icon: any; color: string; bg: string; label: string }> = {
  alert: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100', label: 'Alert' },
  ticket: { icon: Ticket, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Ticket' },
  maintenance: { icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Maintenance' },
  invoice: { icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-100', label: 'Invoice' },
  system: { icon: Settings, color: 'text-slate-600', bg: 'bg-slate-100', label: 'System' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Info' },
};

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  metadata: any;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function NotificationsView() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/notifications?limit=50');
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    if (!notif || notif.read) return;
    try {
      const res = await authFetch('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      /* silent */
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await authFetch('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
        toast.success('All notifications marked as read');
      }
    } catch {
      toast.error('Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center relative">
            <Bell className="w-5 h-5 text-emerald-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
            <p className="text-sm text-slate-500">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                : 'All caught up!'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-9"
          onClick={markAllRead}
          disabled={markingAll || unreadCount === 0}
        >
          <CheckCheck className={`w-4 h-4 mr-1.5 ${markingAll ? 'animate-pulse' : ''}`} />
          {markingAll ? 'Marking...' : 'Mark All Read'}
        </Button>
      </div>

      {/* Notifications List */}
      <Card className="rounded-xl border-slate-200">
        <CardContent className="p-0">
          <ScrollArea className="max-h-[calc(100vh-16rem)]">
            {loading ? (
              <div className="divide-y divide-slate-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-4 flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <BellOff className="w-7 h-7 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-700">No notifications</p>
                <p className="text-sm text-slate-400 mt-1">
                  You're all up to date. New notifications will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                <AnimatePresence>
                  {notifications.map((notif, idx) => {
                    const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
                    const Icon = config.icon;
                    return (
                      <motion.div
                        key={notif.id}
                        className={`p-4 flex gap-3 cursor-pointer transition-colors ${
                          notif.read
                            ? 'bg-white hover:bg-slate-50/80'
                            : 'bg-emerald-50/40 hover:bg-emerald-50/70'
                        }`}
                        onClick={() => markAsRead(notif.id)}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ delay: idx * 0.03 }}
                      >
                        {/* Type Icon */}
                        <div
                          className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center shrink-0`}
                        >
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {!notif.read && (
                                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                              )}
                              <p
                                className={`text-sm truncate ${
                                  notif.read ? 'text-slate-600 font-medium' : 'text-slate-900 font-bold'
                                }`}
                              >
                                {notif.title}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 ${config.bg} ${config.color} border-0`}
                            >
                              {config.label}
                            </Badge>
                          </div>
                          <p
                            className={`mt-1 text-xs leading-relaxed line-clamp-2 ${
                              notif.read ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {notif.body}
                          </p>
                          <p className="mt-1.5 text-[11px] text-slate-400">{timeAgo(notif.createdAt)}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
