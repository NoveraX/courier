/** Lets callers through at a bounded rate, one at a time, in the order they asked. */
export interface AdmissionQueue {
  /**
   * Wait for this caller's turn.
   *
   * @param signal - The caller's signal, when it has one
   * @returns When the caller may go
   * @throws The signal's reason, as soon as it aborts
   */
  enter(signal: AbortSignal | undefined): Promise<void>;
}

/** A caller waiting for its turn. */
interface Waiter {
  readonly admit: () => void;
}

/**
 * A queue that lets at most `limit` callers through in any `windowMs`
 * milliseconds.
 *
 * The window is measured from when each caller was actually let through, not
 * from when it was due: a timer that a busy event loop runs late delays the
 * callers behind it rather than letting several through together. Callers go
 * one at a time, first come first served. A caller that cancels leaves the
 * queue at once, and the turn it would have taken goes to the next in line.
 *
 * @param limit - How many callers a window lets through
 * @param windowMs - How long a window lasts, in milliseconds
 * @returns The queue callers wait in
 *
 * @example
 * ```ts
 * const queue = createAdmissionQueue(10, 1000);
 * await queue.enter(ctx.signal);
 * ```
 */
export function createAdmissionQueue(limit: number, windowMs: number): AdmissionQueue {
  /* When each caller inside the current window was let through, oldest first. */
  const released: number[] = [];
  const waiting: Waiter[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function admitDue(): void {
    timer = undefined;
    const now = performance.now();
    while (released.length > 0 && (released[0] ?? now) + windowMs <= now) released.shift();
    while (waiting.length > 0 && released.length < limit) {
      released.push(now);
      waiting.shift()?.admit();
    }
    if (waiting.length > 0) timer = setTimeout(admitDue, (released[0] ?? now) + windowMs - now);
  }

  function leave(waiter: Waiter): void {
    waiting.splice(waiting.indexOf(waiter), 1);
    if (waiting.length > 0 || timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  return {
    enter(signal) {
      return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const waiter: Waiter = { admit };
        function admit(): void {
          signal?.removeEventListener("abort", cancel);
          resolve();
        }
        function cancel(): void {
          leave(waiter);
          reject(signal?.reason);
        }
        signal?.addEventListener("abort", cancel, { once: true });
        waiting.push(waiter);
        if (timer === undefined) admitDue();
      });
    },
  };
}
