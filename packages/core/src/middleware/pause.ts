import { cancellation } from "../utils/cancellation";
import { ONCE } from "../utils/own";

/**
 * Wait, unless the caller stops waiting first.
 *
 * Middleware that holds a call back — between retries, behind a rate limit —
 * must not keep a caller who has cancelled waiting for the full delay.
 *
 * @param ms - How long to wait
 * @param signal - The call's signal, when it has one
 * @returns When the delay has passed
 * @throws Why the signal aborted, as soon as it does
 *
 * @example
 * ```ts
 * await pause(backoff, ctx.signal);
 * ```
 */
export async function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) throw cancellation(signal);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, ONCE);
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
  if (signal?.aborted) throw cancellation(signal);
}

/**
 * Wait for what a callback returned, unless the caller stops waiting
 * first — a hook a middleware awaits, which may never settle. A promise
 * still unsettled then is left to settle on its own: nothing waits for it,
 * and its rejection, should one come, is dropped.
 *
 * @param value - What the callback returned
 * @param signal - The call's signal, when it has one
 * @returns What the promise resolved with
 * @throws What it rejected with, or why the signal aborted, as soon as it does
 *
 * @example
 * ```ts
 * await waitUnlessStopped(onRetry(event, ctx), ctx.signal);
 * ```
 */
export function waitUnlessStopped<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(cancellation(signal));
  return new Promise<T>((resolve, reject) => {
    const stop = (): void => reject(cancellation(signal));
    signal.addEventListener("abort", stop, ONCE);
    Promise.resolve(value)
      .finally(() => signal.removeEventListener("abort", stop))
      .then(resolve, reject);
  });
}
