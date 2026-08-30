import { describe, expect, it, vi } from 'vitest';
import { createSseLifecycle } from '@/lib/realtime/sse-lifecycle';

type FakeController = {
  enqueue: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function makeController(): FakeController {
  return {
    enqueue: vi.fn(),
    close: vi.fn(),
  };
}

describe('SSE lifecycle', () => {
  it('sends while open and closes idempotently', () => {
    const controller = makeController();
    const abort = new AbortController();
    const lifecycle = createSseLifecycle(controller as never, new TextEncoder(), abort.signal);

    expect(lifecycle.send('data: hello\n\n')).toBe(true);
    expect(controller.enqueue).toHaveBeenCalledTimes(1);

    lifecycle.close();
    lifecycle.close();

    expect(controller.close).toHaveBeenCalledTimes(1);
    expect(lifecycle.send('data: after-close\n\n')).toBe(false);
    expect(controller.enqueue).toHaveBeenCalledTimes(1);
  });

  it('aborts safely and prevents future sends and timers', () => {
    vi.useFakeTimers();
    try {
      const controller = makeController();
      const abort = new AbortController();
      const lifecycle = createSseLifecycle(controller as never, new TextEncoder(), abort.signal);
      const callback = vi.fn();

      lifecycle.setTimeout(callback, 1000);
      lifecycle.setInterval(callback, 1000);
      abort.abort();
      vi.advanceTimersByTime(5000);

      expect(callback).not.toHaveBeenCalled();
      expect(controller.close).toHaveBeenCalledTimes(1);
      expect(lifecycle.isClosed()).toBe(true);
      expect(lifecycle.send('data: after-abort\n\n')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reschedule work after close', () => {
    vi.useFakeTimers();
    try {
      const controller = makeController();
      const abort = new AbortController();
      const lifecycle = createSseLifecycle(controller as never, new TextEncoder(), abort.signal);
      const callback = vi.fn(() => lifecycle.close());

      lifecycle.setTimeout(callback, 1000);
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(5000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(controller.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles an externally closed controller without throwing', () => {
    const controller = makeController();
    controller.enqueue.mockImplementation(() => {
      throw new TypeError('Controller is already closed');
    });
    const abort = new AbortController();
    const lifecycle = createSseLifecycle(controller as never, new TextEncoder(), abort.signal);

    expect(() => lifecycle.send('data: late\n\n')).not.toThrow();
    expect(lifecycle.isClosed()).toBe(true);
    expect(lifecycle.send('data: later\n\n')).toBe(false);
    expect(controller.close).not.toHaveBeenCalled();
  });

  it('handles an already-aborted signal before any producer starts', () => {
    const controller = makeController();
    const abort = new AbortController();
    abort.abort();
    const lifecycle = createSseLifecycle(controller as never, new TextEncoder(), abort.signal);

    expect(lifecycle.isClosed()).toBe(true);
    expect(lifecycle.send('data: hello\n\n')).toBe(false);
    expect(lifecycle.setTimeout(vi.fn(), 0)).toBeUndefined();
    expect(lifecycle.setInterval(vi.fn(), 0)).toBeUndefined();
  });
});
