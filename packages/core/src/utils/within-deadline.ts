/**
 * Wait for a promise no longer than a deadline: what it settles with, or a
 * rejection once `timeoutMs` has passed with no answer — the promise itself
 * goes on, and what it settles with later is ignored.
 *
 * @param promise - What is waited for
 * @param timeoutMs - How long, in milliseconds
 * @returns What the promise settled with, in time
 * @throws Error once the deadline passes with no answer
 * @example
 * ```ts
 * const position = await withinDeadline(log.position(topic), 2_000);
 * ```
 */
export function withinDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}
