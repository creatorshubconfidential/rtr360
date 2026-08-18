// ────────────────────────────────────────
// RTR 360 — useApi Generic Fetch Hook
// ────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/api';

export interface UseApiOptions<T> extends Omit<RequestInit, 'signal'> {
  /** Whether to automatically fetch on mount / url change (default: true) */
  enabled?: boolean;
  /** Initial data to use before the first fetch completes */
  initialData?: T;
  /** Custom parser — receives the raw Response, must return parsed data */
  parser?: (res: Response) => Promise<T>;
}

export interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<T | null>;
}

/**
 * Generic data-fetching hook powered by `authFetch`.
 *
 * Features:
 *  - Auto-fetches on mount and when `url` changes
 *  - `enabled` flag to conditionally skip fetching
 *  - `initialData` for optimistic UI
 *  - Debounced refetch to prevent double-fetch in React strict mode
 *  - Proper loading / error state management
 */
export function useApi<T = unknown>(
  url: string | null,
  options: UseApiOptions<T> = {},
): UseApiResult<T> {
  const { enabled = true, initialData = null, parser, ...fetchOptions } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled && !!url);

  // Refs to avoid stale closures in async callbacks
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the latest url/options for the refetch function
  const urlRef = useRef(url);
  const optionsRef = useRef(options);
  urlRef.current = url;
  optionsRef.current = options;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const fetchData = useCallback(
    async (targetUrl: string, opts: UseApiOptions<T>): Promise<T | null> => {
      if (!targetUrl) return null;

      try {
        setLoading(true);
        setError(null);

        const res = await authFetch(targetUrl, {
          ...fetchOptions,
          ...opts,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }

        const parsed: T = opts.parser
          ? await opts.parser(res)
          : await res.json();

        if (mountedRef.current) {
          setData(parsed);
          setError(null);
        }
        return parsed;
      } catch (err) {
        if (mountedRef.current) {
          const message =
            err instanceof Error ? err.message : 'An unexpected error occurred';
          setError(message);
        }
        return null;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [fetchOptions],
  );

  // Auto-fetch on mount and when url / enabled changes.
  // A small debounce (50 ms) prevents the double-fire in React 18+ strict mode.
  useEffect(() => {
    if (!enabled || !url) {
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchData(url, optionsRef.current);
    }, 50);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [url, enabled, fetchData]);

  const refetch = useCallback(async (): Promise<T | null> => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return null;
    return fetchData(currentUrl, optionsRef.current);
  }, [fetchData]);

  return { data, error, loading, refetch };
}
