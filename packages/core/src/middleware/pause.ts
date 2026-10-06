import { abortReason } from "../utils/abort-reason";

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
  if (signal?.aborted) throw abortReason(signal);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
  if (signal?.aborted) throw abortReason(signal);
}
