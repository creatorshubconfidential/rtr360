'use client';

import { Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { NAV_SECTIONS } from '@/lib/constants';
import type { ViewType } from '@/lib/types';

export default function SidebarNav({
  currentView,
  onNavigate,
  onClose,
  userRole,
}: {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onClose?: () => void;
  userRole?: string;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white">RTR 360</span>
      </div>

      <Separator className="bg-slate-700/50" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-4 px-3 space-y-6">
        {NAV_SECTIONS.filter((section) => !section.superAdminOnly || userRole === 'super_admin').map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose?.();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-400'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border-l-2 border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {(item as unknown as Record<string, string | undefined>).badge && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-700 text-slate-400 border-0">
                        {(item as unknown as Record<string, string | undefined>).badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-700/50">
        <p className="text-[11px] text-slate-500">
          Powered by <span className="font-medium text-slate-400">Mianx.ai</span>
        </p>
      </div>
    </div>
  );
}
