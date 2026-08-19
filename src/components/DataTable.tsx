'use client';

import React, { useMemo, useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ArrowUpDown,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
  };
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
  toolbar?: React.ReactNode;
  exportFilename?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNextSortDirection(current: SortDirection): SortDirection {
  if (current === null) return 'asc';
  if (current === 'asc') return 'desc';
  return null;
}

function alignClass(align?: 'left' | 'center' | 'right'): string {
  switch (align) {
    case 'center':
      return 'text-center';
    case 'right':
      return 'text-right';
    default:
      return 'text-left';
  }
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Page number generation ─────────────────────────────────────────────────

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const showEllipsisBefore = current > 3;
  const showEllipsisAfter = current < total - 2;

  if (showEllipsisBefore) {
    pages.push(1);
    pages.push('ellipsis');
  } else {
    pages.push(1, 2, 3);
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (showEllipsisBefore) {
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
  }

  if (showEllipsisAfter) {
    if (!showEllipsisBefore) {
      pages.push('ellipsis');
    }
    pages.push(total);
  } else {
    for (let i = Math.max(total - 2, end + 1); i <= total; i++) {
      pages.push(i);
    }
  }

  return pages;
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function TableSkeleton<T>({ columns }: { columns: ColumnDef<T>[] }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, rowIdx) => (
        <TableRow key={rowIdx}>
          {columns.map((col) => (
            <TableCell key={col.key} className={cn(alignClass(col.align), 'py-3')}>
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState<T extends Record<string, unknown>>({
  icon: Icon,
  message,
  columns,
}: {
  icon?: LucideIcon;
  message: string;
  columns: ColumnDef<T>[];
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={columns.length}
        className="h-48 text-center"
      >
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          {Icon && <Icon className="size-10 stroke-[1.5]" />}
          <p className="text-sm">{message}</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = 'No data found.',
  emptyIcon,
  pagination,
  searchable = false,
  searchPlaceholder = 'Search…',
  onSearch,
  searchValue: controlledSearchValue,
  toolbar,
  exportFilename,
}: DataTableProps<T>) {
  // ── Sort state ──────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  // ── Internal search (uncontrolled fallback) ─────────────────────────────
  const [internalSearch, setInternalSearch] = useState('');
  const isControlledSearch = controlledSearchValue !== undefined;
  const searchQuery = isControlledSearch ? controlledSearchValue : internalSearch;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (isControlledSearch) {
        onSearch?.(val);
      } else {
        setInternalSearch(val);
      }
    },
    [isControlledSearch, onSearch],
  );

  // ── Sorting ─────────────────────────────────────────────────────────────
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return dir;
      if (bVal === null || bVal === undefined) return -dir;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * dir;
      }
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        const next = getNextSortDirection(sortDir);
        setSortDir(next);
        if (!next) setSortKey(null);
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey, sortDir],
  );

  // ── Pagination calculations ─────────────────────────────────────────────
  const totalItems = pagination ? data.length : 0;
  const pageStart =
    pagination && totalItems > 0
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0;
  const pageEnd = pagination
      ? Math.min(pagination.page * pagination.pageSize, totalItems)
      : 0;

  // ── CSV Export ──────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (!exportFilename || data.length === 0) return;
    const header = columns.map((c) => escapeCsvCell(c.label)).join(',');
    const rows = data.map((row) =>
      columns.map((c) => escapeCsvCell(row[c.key])).join(','),
    );
    const csv = [header, ...rows].join('\n');
    downloadCsv(`${exportFilename}.csv`, csv);
  }, [exportFilename, data, columns]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      {(searchable || toolbar || exportFilename) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {searchable && (
              <div className="relative max-w-xs flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-9"
                />
              </div>
            )}
            {toolbar}
          </div>

          {exportFilename && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={data.length === 0}
              className="shrink-0"
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          )}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((col) => {
                const isActive = sortKey === col.key;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      alignClass(col.align),
                      col.sortable && 'cursor-pointer select-none',
                      col.className,
                    )}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <div className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        <span className="ml-0.5 inline-flex flex-col leading-none">
                          {isActive && sortDir === 'asc' ? (
                            <ChevronUp className="size-3.5 text-foreground" />
                          ) : isActive && sortDir === 'desc' ? (
                            <ChevronDown className="size-3.5 text-foreground" />
                          ) : (
                            <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
                          )}
                        </span>
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableSkeleton<T> columns={columns} />
            ) : data.length === 0 ? (
              <EmptyState
                icon={emptyIcon}
                message={emptyMessage}
                columns={columns}
              />
            ) : (
              sortedData.map((row) => (
                <TableRow key={keyExtractor(row)} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(alignClass(col.align), col.className)}
                    >
                      {col.render
                        ? col.render(row[col.key], row)
                        : (row[col.key] as React.ReactNode) ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination Footer ─────────────────────────────────────────────── */}
      {pagination && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            {totalItems > 0 ? (
              <>
                Showing{' '}
                <span className="font-medium text-foreground">{pageStart}</span>
                {'–'}
                <span className="font-medium text-foreground">{pageEnd}</span>
                {' of '}
                <span className="font-medium text-foreground">{totalItems}</span>
              </>
            ) : (
              'No results'
            )}
          </p>

          <div className="flex items-center gap-3">
            {/* Page size selector */}
            {pagination.onPageSizeChange && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Rows
                </span>
                <Select
                  value={String(pagination.pageSize)}
                  onValueChange={(v) => pagination.onPageSizeChange!(Number(v))}
                >
                  <SelectTrigger size="sm" className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Page navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={pagination.page <= 1}
                onClick={() => pagination.onPageChange(1)}
              >
                <ChevronsLeft className="size-4" />
                <span className="sr-only">First page</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={pagination.page <= 1}
                onClick={() => pagination.onPageChange(pagination.page - 1)}
              >
                <ChevronUp className="size-4 rotate-[-90deg]" />
                <span className="sr-only">Previous page</span>
              </Button>

              {/* Page numbers */}
              <div className="mx-1 flex items-center gap-0.5">
                {getPageNumbers(pagination.page, pagination.totalPages).map(
                  (item, idx) => {
                    if (item === 'ellipsis') {
                      return (
                        <span
                          key={`ellipsis-${idx}`}
                          className="px-1 text-sm text-muted-foreground"
                        >
                          …
                        </span>
                      );
                    }
                    const isActive = item === pagination.page;
                    return (
                      <Button
                        key={item}
                        variant={isActive ? 'default' : 'ghost'}
                        size="icon"
                        className="size-8 text-sm"
                        onClick={() => pagination.onPageChange(item)}
                        disabled={isActive}
                      >
                        {item}
                        <span className="sr-only">Page {item}</span>
                      </Button>
                    );
                  },
                )}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => pagination.onPageChange(pagination.page + 1)}
              >
                <ChevronDown className="size-4 rotate-[-90deg]" />
                <span className="sr-only">Next page</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  pagination.onPageChange(pagination.totalPages)
                }
              >
                <ChevronsRight className="size-4" />
                <span className="sr-only">Last page</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
