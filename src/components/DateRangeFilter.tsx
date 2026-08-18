'use client';

import { useState, useCallback } from 'react';
import { Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateRangeFilterProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear?: () => void;
  className?: string;
  label?: string;
}

export function DateRangeFilter({
  from, to, onFromChange, onToChange, onClear, className, label = 'Date Range',
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const hasFilter = !!(from || to);

  const clear = useCallback(() => {
    onFromChange('');
    onToChange('');
    onClear?.();
  }, [onFromChange, onToChange, onClear]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 gap-1.5 text-xs font-normal', hasFilter && 'border-emerald-300 bg-emerald-50 text-emerald-700', className)}
        >
          <Calendar className="w-3.5 h-3.5" />
          {hasFilter ? (
            <span className="max-w-[120px] truncate">
              {from ? new Date(from).toLocaleDateString('en-AE', { day: '2-digit', month: 'short' }) : '…'}
              {' – '}
              {to ? new Date(to).toLocaleDateString('en-AE', { day: '2-digit', month: 'short' }) : '…'}
            </span>
          ) : (
            label
          )}
          {hasFilter && (
            <X className="w-3 h-3 ml-0.5" onClick={(e) => { e.stopPropagation(); clear(); }} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>
        <div className="flex items-center gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 uppercase">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="h-9 w-40 text-xs"
            />
          </div>
          <span className="text-slate-300 mt-4">→</span>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 uppercase">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="h-9 w-40 text-xs"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
