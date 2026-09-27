/**
 * Wait, unless the caller stops waiting first.
 *
 * Middleware that holds a call back — between retries, behind a rate limit —
 * must not keep a caller who has cancelled waiting for the full delay.
 *
 * @param ms - How long to wait
 * @param signal - The call's signal, when it has one
 * @returns When the delay has passed
 * @throws The signal's reason, as soon as it aborts
 *
 * @example
 * ```ts
 * await pause(backoff, ctx.signal);
 * ```
 */
export async function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
  signal?.throwIfAborted();
}
