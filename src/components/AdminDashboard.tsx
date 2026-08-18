'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, Bell, Bot, ExternalLink, Settings, LogOut, Truck,
  AlertTriangle, Ticket, Wrench, CreditCard, Info as InfoIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetTrigger, SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import dynamic from 'next/dynamic';

// Extracted views
import SidebarNav from '@/components/SidebarNav';
import DashboardView from '@/components/views/DashboardView';
import LeadsView from '@/components/views/LeadsView';
import VehiclesView from '@/components/views/VehiclesView';
import PipelineView from '@/components/views/PipelineView';
import QuotationsView from '@/components/views/QuotationsView';
import ContactsView from '@/components/views/ContactsView';
import DriversView from '@/components/views/DriversView';
import DevicesView from '@/components/views/DevicesView';
import InstallationsView from '@/components/views/InstallationsView';
import TechniciansView from '@/components/views/TechniciansView';
import MaintenanceView from '@/components/views/MaintenanceView';
import SubscriptionsView from '@/components/views/SubscriptionsView';
import InvoicesView from '@/components/views/InvoicesView';
import TicketsView from '@/components/views/TicketsView';
import SettingsView from '@/components/views/SettingsView';
import AuditLogsView from '@/components/views/AuditLogsView';
import AnalyticsView from '@/components/views/AnalyticsView';
import ReportsView from '@/components/views/ReportsView';
import AlertRulesView from '@/components/views/AlertRulesView';
import GeofencesView from '@/components/views/GeofencesView';
import UsersView from '@/components/views/UsersView';
import ContractsView from '@/components/views/ContractsView';
import TripsView from '@/components/views/TripsView';
import NotificationsView from '@/components/views/NotificationsView';
import SuperAdminView from '@/components/views/SuperAdminView';

// PWA & Real-Time
import MobileBottomNav from '@/components/MobileBottomNav';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import ConnectionStatus from '@/components/ConnectionStatus';
import RealtimeEventToasts from '@/components/RealtimeEventToasts';

// AI Assistant
import AIChatPanel from '@/components/AIChatPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import type { UserSession, ViewType } from '@/lib/types';

const LiveTrackingView = dynamic(() => import('@/components/views/LiveTrackingView'), {
  ssr: false,
  loading: () => <div className="h-[calc(100vh-8rem)] flex items-center justify-center bg-slate-50 rounded-xl"><div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" /></div>,
});

const viewTitle: Record<ViewType, string> = {
  dashboard: 'Dashboard',
  analytics: 'Advanced Analytics',
  reports: 'Reports & Analytics',
  'live-tracking': 'Live Tracking',
  'ai-assistant': 'AI Assistant',
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  devices: 'Devices',
  trips: 'Trips',
  installations: 'Installations',
  technicians: 'Technicians',
  maintenance: 'Maintenance',
  pipeline: 'Sales Pipeline',
  leads: 'Leads',
  contacts: 'Contacts',
  quotations: 'Quotations',
  contracts: 'Contracts',
  subscriptions: 'Subscriptions',
  invoices: 'Invoices',
  geofences: 'Geofences',
  'alert-rules': 'Alert Rules',
  tickets: 'Tickets',
  notifications: 'Notifications',
  users: 'User Management',
  settings: 'Settings',
  'audit-logs': 'Audit Logs',
  'super-admin': 'Super Admin',
};

export default function AdminDashboard({ user, onLogout }: { user: UserSession; onLogout: () => void }) {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifList, setNotifList] = useState<Array<{ id: string; title: string; body: string; read: boolean; type?: string }>>([]);
  const [notifCount, setNotifCount] = useState(0);

  const fetchNotifPreview = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=8');
      if (res.ok) {
        const data = await res.json();
        setNotifList(data.notifications || []);
        setNotifCount(data.unreadCount || 0);
      }
    } catch { /* silent */ }
  }, []);

  // Initial fetch + auto-refresh every 30s
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetchNotifPreview();
    const interval = setInterval(fetchNotifPreview, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifPreview]);

  const markNotifRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setNotifCount(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const NOTIF_ICONS: Record<string, React.ElementType> = {
    alert: AlertTriangle, ticket: Ticket, maintenance: Wrench,
    invoice: CreditCard, system: Settings, info: InfoIcon,
  };
  const NOTIF_COLORS: Record<string, string> = {
    alert: 'text-amber-500', ticket: 'text-blue-500', maintenance: 'text-orange-500',
    invoice: 'text-emerald-500', system: 'text-slate-500', info: 'text-blue-400',
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />;
      case 'pipeline': return <PipelineView />;
      case 'leads': return <LeadsView />;
      case 'contacts': return <ContactsView />;
      case 'quotations': return <QuotationsView />;
      case 'vehicles': return <VehiclesView />;
      case 'live-tracking': return <LiveTrackingView />;
      case 'drivers': return <DriversView />;
      case 'devices': return <DevicesView />;
      case 'installations': return <InstallationsView />;
      case 'technicians': return <TechniciansView />;
      case 'maintenance': return <MaintenanceView />;
      case 'subscriptions': return <SubscriptionsView />;
      case 'invoices': return <InvoicesView />;
      case 'tickets': return <TicketsView />;
      case 'analytics': return <AnalyticsView />;
      case 'reports': return <ReportsView />;
      case 'trips': return <TripsView />;
      case 'contracts': return <ContractsView />;
      case 'geofences': return <GeofencesView />;
      case 'alert-rules': return <AlertRulesView />;
      case 'notifications': return <NotificationsView />;
      case 'users': return <UsersView />;
      case 'settings': return <SettingsView />;
      case 'audit-logs': return <AuditLogsView />;
      case 'super-admin': return <SuperAdminView />;
      case 'ai-assistant': return <DashboardView />;
      default: return <DashboardView />;
    }
  };

  const view = renderView();

  return (
    <div className="min-h-screen flex bg-[var(--rtr-bg)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-slate-900 text-white shrink-0">
        <SidebarNav currentView={currentView} onNavigate={setCurrentView} userRole={user.role} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-slate-900 text-white border-slate-700">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SidebarNav currentView={currentView} onNavigate={setCurrentView} onClose={() => setSidebarOpen(false)} userRole={user.role} />
        </SheetContent>
      </Sheet>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">{viewTitle[currentView]}</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAiPanelOpen(true)}
              className="relative p-2 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer group"
              aria-label="AI Assistant"
            >
              <Bot className="w-5 h-5 text-slate-600 group-hover:text-emerald-600 transition-colors" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
            </button>

            <div className="relative">
              <button
                onClick={() => { setNotifOpen(!notifOpen); fetchNotifPreview(); }}
                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-slate-600" />
                {notifCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className="absolute right-0 top-12 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-slate-800">Notifications</h3>
                      <div className="flex items-center gap-2">
                        {notifCount > 0 && <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">{notifCount} new</Badge>}
                        <button onClick={() => { setCurrentView('notifications'); setNotifOpen(false); }} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer">
                          View All <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <ScrollArea className="max-h-72">
                      {notifList.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm">No notifications</div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {notifList.slice(0, 8).map((n) => {
                            const NIcon = NOTIF_ICONS[n.type || 'info'] || InfoIcon;
                            const NColor = NOTIF_COLORS[n.type || 'info'] || 'text-slate-400';
                            return (
                            <div
                              key={n.id}
                              onClick={() => { if (!n.read) markNotifRead(n.id); }}
                              className={`px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3 ${!n.read ? 'bg-emerald-50/30' : ''}`}
                            >
                              <NIcon className={`w-4 h-4 mt-0.5 shrink-0 ${NColor}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                                  <p className={`text-xs truncate ${!n.read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{n.title}</p>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{n.body}</p>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                    <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
                      <button onClick={() => { setCurrentView('notifications'); setNotifOpen(false); }} className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold w-full text-center cursor-pointer">
                        Open Notification Center
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                      {user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[120px] truncate">{user.name}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem><Settings className="w-4 h-4 mr-2" /> Profile</DropdownMenuItem>
                <DropdownMenuItem><Settings className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-red-600 focus:text-red-600">
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ErrorBoundary>
                {view}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* AI Chat Panel Overlay */}
      <AIChatPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />

      {/* PWA & Real-Time */}
      <MobileBottomNav currentView={currentView} onNavigate={(v) => setCurrentView(v as ViewType)} notifCount={notifCount} />
      <PWAInstallPrompt />
      <ConnectionStatus />
      <RealtimeEventToasts enabled={currentView === 'live-tracking' || currentView === 'dashboard'} />

      {notifOpen && <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />}
    </div>
  );
}