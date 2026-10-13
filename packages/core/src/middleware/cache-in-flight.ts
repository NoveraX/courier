import { abortReason } from "../utils/abort-reason";
import type { MiddlewareResponse } from "./types";

/** The misses being fetched, by cache key: what each will store, or nothing. */
export type MissesInFlight = Map<string, Promise<MiddlewareResponse | undefined>>;

/**
 * Wait for a miss another call is fetching: a burst on an empty or expired
 * entry reaches the API once rather than once per call. A call that stops
 * waiting leaves at once; one whose fetcher failed, or brought back an
 * answer the cache does not keep, gets nothing and makes its own call.
 *
 * @param pending - What the fetching call will store
 * @param signal - Fires when this call stops waiting
 * @returns What the fetching call stored, or `undefined`
 * @example
 * ```ts
 * const pending = inFlight.get(key);
 * const shared = pending && (await waitForMiss(pending, ctx.signal));
 * ```
 */
export function waitForMiss(
  pending: Promise<MiddlewareResponse | undefined>,
  signal: AbortSignal | undefined,
): Promise<MiddlewareResponse | undefined> {
  return untilStopped(pending, signal);
}

/**
 * Record a miss being fetched, for the calls that miss the same key until
 * it settles, and forget it once it has.
 *
 * @param inFlight - The misses being fetched
 * @param key - The cache key
 * @param stored - Settles with what the cache keeps of the answer, or nothing
 * @returns Nothing
 * @example
 * ```ts
 * fetchingMiss(inFlight, key, kept);
 * ```
 */
export function fetchingMiss(
  inFlight: MissesInFlight,
  key: string,
  stored: Promise<MiddlewareResponse | undefined>,
): void {
  const shared = stored.catch(() => undefined);
  inFlight.set(key, shared);
  void shared.finally(() => {
    if (inFlight.get(key) === shared) inFlight.delete(key);
  });
}

function untilStopped<TValue>(
  promise: Promise<TValue>,
  signal: AbortSignal | undefined,
): Promise<TValue> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<TValue>((resolve, reject) => {
    const stop = () => reject(abortReason(signal));
    signal.addEventListener("abort", stop, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", stop);
        reject(error);
      },
    );
  });
}
