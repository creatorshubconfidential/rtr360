// ────────────────────────────────────────
// RTR 360 — usePagination Hook
// ────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';

export interface UsePaginationOptions {
  /** Initial page number (1-based, default: 1) */
  initialPage?: number;
  /** Items per page (default: 20, max: 100) */
  pageSize?: number;
}

export interface UsePaginationReturn {
  /** Current 1-based page number */
  page: number;
  /** Current page size */
  pageSize: number;
  /** Total number of pages (0 until setTotalPages is called) */
  totalPages: number;
  /** Update total page count (typically after receiving API response) */
  setTotalPages: (total: number) => void;
  /** Jump to a specific page */
  goToPage: (page: number) => void;
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
  /** Whether a next page exists */
  canNext: boolean;
  /** Whether a previous page exists */
  canPrev: boolean;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Manages pagination state.
 *
 * Usage:
 *   const { page, pageSize, totalPages, setTotalPages, goToPage, nextPage, prevPage, canNext, canPrev } = usePagination();
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const rawPageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const clampedPageSize = Math.min(Math.max(1, rawPageSize), MAX_PAGE_SIZE);

  const [page, setPage] = useState(options.initialPage ?? 1);
  const [totalPages, setTotalPagesState] = useState(0);

  const setTotalPages = useCallback((total: number) => {
    setTotalPagesState(Math.max(0, total));
  }, []);

  const goToPage = useCallback(
    (target: number) => {
      setPage((prev) => {
        const clamped = Math.min(Math.max(1, target), totalPages || 1);
        // Avoid unnecessary state updates
        if (clamped === prev) return prev;
        return clamped;
      });
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    setPage((prev) => {
      if (totalPages > 0 && prev >= totalPages) return prev;
      return prev + 1;
    });
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((prev) => {
      if (prev <= 1) return prev;
      return prev - 1;
    });
  }, []);

  const canNext = useMemo(() => page < totalPages, [page, totalPages]);
  const canPrev = useMemo(() => page > 1, [page]);

  return {
    page,
    pageSize: clampedPageSize,
    totalPages,
    setTotalPages,
    goToPage,
    nextPage,
    prevPage,
    canNext,
    canPrev,
  };
}
