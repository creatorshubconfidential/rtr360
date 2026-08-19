'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Copy, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExportButtonProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  filename: string;
  columns?: { key: string; label: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function resolveColumns(
  data: Record<string, unknown>[],
  columns?: { key: string; label: string }[],
): { key: string; label: string }[] {
  if (columns && columns.length > 0) return columns;
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({ key, label: key }));
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ExportButton({ data, filename, columns }: ExportButtonProps) {
  const [copied, setCopied] = useState(false);

  // Reset the "copied" indicator after 2 seconds
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const cols = resolveColumns(data, columns);

  const handleExportCsv = useCallback(() => {
    if (data.length === 0) {
      toast.error('No data to export.');
      return;
    }

    const header = cols.map((c) => escapeCsvCell(c.label)).join(',');
    const rows = data.map((row) =>
      cols.map((c) => escapeCsvCell(row[c.key])).join(','),
    );
    const csv = [header, ...rows].join('\n');

    triggerDownload(`${filename}.csv`, csv, 'text/csv;charset=utf-8;');
    toast.success(`Exported ${data.length} rows as CSV.`);
  }, [data, cols, filename]);

  const handleCopyToClipboard = useCallback(async () => {
    if (data.length === 0) {
      toast.error('No data to copy.');
      return;
    }

    const header = cols.map((c) => c.label).join('\t');
    const rows = data.map((row) =>
      cols.map((c) => {
        const val = row[c.key];
        const str = val === null || val === undefined ? '' : String(val);
        return str.includes('\t') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join('\t'),
    );
    const tsv = [header, ...rows].join('\n');

    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      toast.success(`Copied ${data.length} rows to clipboard.`);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  }, [data, cols]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          {copied ? (
            <ClipboardCheck className="size-4 text-emerald-600" />
          ) : (
            <Download className="size-4" />
          )}
          <span className="hidden sm:inline">
            {copied ? 'Copied!' : 'Export'}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleExportCsv}>
          <Download className="size-4" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCopyToClipboard}>
          <Copy className="size-4" />
          Copy to Clipboard
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
