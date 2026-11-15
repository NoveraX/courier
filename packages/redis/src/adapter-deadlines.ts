/** How long `connect()` of a Redis adapter waits for Redis before it rejects, the adapter still connecting. */
export const CONNECT_TIMEOUT_MS = 10_000;

/** How long `disconnect()` of a Redis adapter waits for Redis to let its channels go before it settles anyway. */
export const DISCONNECT_TIMEOUT_MS = 2_000;

/** How long `subscribe()` of a Redis adapter waits for Redis to answer its SUBSCRIBE before it settles anyway, the channel subscribed once Redis answers. */
export const SUBSCRIBE_TIMEOUT_MS = 2_000;

/**
 * Wait for what Redis answers, or reject at the deadline with why — the
 * adapter going on connecting, whatever this caller is told.
 *
 * @param answer - What Redis is asked
 * @param timeoutMs - How long to wait for it
 * @returns The answer
 * @example
 * ```ts
 * await withinDeadline(redis.ping(), CONNECT_TIMEOUT_MS);
 * ```
 */
export function withinDeadline<T>(answer: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(`Redis did not answer within ${timeoutMs} ms; the adapter goes on connecting`),
      );
    }, timeoutMs);
  });
  return Promise.race([answer, late]).finally(() => clearTimeout(timer));
}

/**
 * Wait for work to settle, `timeoutMs` at most: what is still under way at
 * the deadline goes on, no longer waited for. It never rejects.
 *
 * @param work - What is waited for
 * @param timeoutMs - How long to wait for it
 * @example
 * ```ts
 * await settleWithin(Promise.allSettled(unsubscribes), DISCONNECT_TIMEOUT_MS);
 * ```
 */
export async function settleWithin(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const settled = work.then(
    () => undefined,
    () => undefined,
  );
  await Promise.race([settled, late]).finally(() => clearTimeout(timer));
}
