'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard, MapPin, Truck, Bot, BarChart3, BrainCircuit,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

type ViewType = string;

interface Props {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  notifCount?: number;
}

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
  { id: 'analytics', icon: BrainCircuit, label: 'Analytics' },
  { id: 'live-tracking', icon: MapPin, label: 'Track' },
  { id: 'vehicles', icon: Truck, label: 'Fleet' },
  { id: 'ai-assistant', icon: Bot, label: 'AI' },
];

export default function MobileBottomNav({ currentView, onNavigate, notifCount = 0 }: Props) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<ViewType>(currentView);

  useEffect(() => {
    setActive(currentView);
  }, [currentView]);

  if (!isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <nav className="bg-white border-t border-slate-200 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActive(item.id);
                  onNavigate(item.id);
                }}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[56px] relative ${
                  isActive
                    ? 'text-emerald-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {isActive && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-600 rounded-full" />
                )}
                <div className="relative">
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                  {item.id === 'dashboard' && notifCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'text-emerald-600' : ''}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
