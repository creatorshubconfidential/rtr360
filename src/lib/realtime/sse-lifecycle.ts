export type SseController = ReadableStreamDefaultController<Uint8Array>;

export interface SseLifecycle {
  send(data: string): boolean;
  close(): void;
  cleanup(): void;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> | undefined;
  setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval> | undefined;
  isClosed(): boolean;
}

/**
 * Owns the complete lifecycle of an SSE stream.
 *
 * The controller is intentionally only touched through this object so aborts,
 * timers, async callbacks and max-duration shutdown cannot race into a second
 * enqueue/close call after the stream has been closed.
 */
export function createSseLifecycle(
  controller: SseController,
  encoder: TextEncoder,
  signal: AbortSignal,
): SseLifecycle {
  let closed = false;
  let cleanedUp = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();

  const clearAll = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const interval of intervals) clearInterval(interval);
    intervals.clear();
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearAll();
    signal.removeEventListener('abort', onAbort);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    cleanup();
    try {
      controller.close();
    } catch {
      // The underlying stream may already have been closed by the runtime.
    }
  };

  const send = (data: string): boolean => {
    if (closed || signal.aborted) return false;
    try {
      controller.enqueue(encoder.encode(data));
      return true;
    } catch {
      // Treat an externally closed/cancelled controller as terminal and stop
      // every future producer before it can attempt another enqueue.
      closed = true;
      cleanup();
      return false;
    }
  };

  const setTimeoutSafe = (callback: () => void, delay: number) => {
    if (closed || signal.aborted || cleanedUp) return undefined;

    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => {
      timers.delete(timer);
      if (closed || signal.aborted || cleanedUp) return;
      try {
        callback();
      } catch {
        close();
      }
    }, delay);
    timers.add(timer);
    return timer;
  };

  const setIntervalSafe = (callback: () => void, delay: number) => {
    if (closed || signal.aborted || cleanedUp) return undefined;

    const interval = setInterval(() => {
      if (closed || signal.aborted || cleanedUp) return;
      try {
        callback();
      } catch {
        close();
      }
    }, delay);
    intervals.add(interval);
    return interval;
  };

  const onAbort = () => close();

  if (signal.aborted) {
    closed = true;
    cleanup();
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    send,
    close,
    cleanup,
    setTimeout: setTimeoutSafe,
    setInterval: setIntervalSafe,
    isClosed: () => closed || signal.aborted,
  };
}
