// ────────────────────────────────────────
// RTR 360 — useDebounce Hook & Utility
// ────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

/**
 * Returns a debounced version of the provided value.
 * Useful for delaying search inputs, filter changes, etc.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Imperative debounce utility — wraps a function so it only fires
 * after `delay` ms of inactivity.
 *
 * Usage:
 *   const handleChange = debounce((val: string) => { ... }, 300);
 *   // remember to call handleChange.cancel() in cleanup if needed
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
