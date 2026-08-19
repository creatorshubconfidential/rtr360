// ────────────────────────────────────────
// RTR 360 — useSearch Hook
// ────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/api';
import { useDebounce } from './useDebounce';

export interface UseSearchOptions<T> extends Omit<RequestInit, 'signal'> {
  /** Debounce delay in ms (default: 300) */
  delay?: number;
  /** Custom parser for the response */
  parser?: (res: Response) => Promise<T[]>;
  /** Minimum query length before triggering a search (default: 1) */
  minQueryLength?: number;
}

export interface UseSearchReturn<T> {
  /** Current raw query string */
  query: string;
  /** Update the query (will debounce automatically) */
  setQuery: (q: string) => void;
  /** Current search results (null until first fetch completes) */
  results: T[] | null;
  /** Whether a search request is in flight */
  loading: boolean;
}

/**
 * Search hook that combines `useDebounce` with `authFetch`.
 *
 * Usage:
 *   const { query, setQuery, results, loading } = useSearch('/api/vehicles', 'plate_number');
 *   // -> fetches /api/vehicles?search=<query> with 300 ms debounce
 *
 * @param url  Base API endpoint (without query params)
 * @param _key Reserved for future server-side filtering key (currently appends `?search=`)
 */
export function useSearch<T = unknown>(
  url: string,
  _key?: string,
  options: UseSearchOptions<T> = {},
): UseSearchReturn<T> {
  const { delay = 300, parser, minQueryLength = 1, ...fetchOptions } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);

  const debouncedQuery = useDebounce(query, delay);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Skip search for empty / too-short queries
    if (!debouncedQuery || debouncedQuery.length < minQueryLength) {
      setResults(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const doSearch = async () => {
      try {
        setLoading(true);

        const separator = url.includes('?') ? '&' : '?';
        const searchUrl = `${url}${separator}search=${encodeURIComponent(debouncedQuery)}`;

        const res = await authFetch(searchUrl, {
          ...fetchOptions,
        });

        if (cancelled || !mountedRef.current) return;

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Search failed with status ${res.status}`);
        }

        const parsed: T[] = parser ? await parser(res) : await res.json();
        if (!cancelled && mountedRef.current) {
          setResults(parsed);
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setResults(null);
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    doSearch();

    return () => {
      cancelled = true;
    };
    // fetchOptions is a request-init bag that's stable when coming from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, url, minQueryLength, parser, delay]);

  return { query, setQuery, results, loading };
}
