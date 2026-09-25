/** How `withTimeout` treats the process while it waits. */
export interface WithTimeoutOptions {
  /**
   * Whether the timer keeps the process alive (default: `false`). Pass
   * `true` where nothing else does — before a server listens — or a process
   * whose only pending work hangs exits without the time ever running out.
   */
  keepAlive?: boolean;
}

/**
 * Wait for work, but give up on it once `timeoutMs` has passed.
 *
 * The work is not cancelled: it keeps running, and whatever it settles with
 * after that is the business of whoever holds it. Unless `keepAlive` is
 * set, the timer alone does not keep the process alive: a process with
 * nothing else to do exits while a load it gave up on still waits, and the
 * caller must hold the process open itself for the time to run out.
 *
 * @param work - What to wait for
 * @param timeoutMs - How long to wait for it
 * @param expired - Called once, when the time runs out first; what it
 *   returns is thrown
 * @param options - Whether the timer keeps the process alive
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
  { keepAlive = false }: WithTimeoutOptions = {},
): Promise<TValue> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(expired()), timeoutMs);
    if (!keepAlive) timer.unref();
  });
  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
