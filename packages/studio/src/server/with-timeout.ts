/**
 * Wait for work, but give up on it once `timeoutMs` has passed.
 *
 * The work is not cancelled: it keeps running, and whatever it settles with
 * after that is the business of whoever holds it. The timer alone does not
 * keep the process alive: a process with nothing else to do exits while a
 * load it gave up on still waits, and a caller that needs the time to run
 * out holds the process open itself, as `holdProcessOpen` does.
 *
 * @param work - What to wait for
 * @param timeoutMs - How long to wait for it
 * @param expired - Called once, when the time runs out first; what it
 *   returns is thrown
 * @returns What the work resolved with
 * @throws What `expired` returned when the time ran out first, or what the
 *   work rejected with
 *
 * @example
 * ```ts
 * const loaded = await withTimeout(load(), 20_000, () => new ConfigLoadTimeoutError(20_000));
 * ```
 */
export async function withTimeout<TValue>(
  work: Promise<TValue>,
  timeoutMs: number,
  expired: () => Error,
): Promise<TValue> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(expired()), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
