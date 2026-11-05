/*
 * The errors subscriptions ended on. A subscription marks the error it ends
 * with just before its listeners hear it, so a listener tells it, as it
 * hears it, from one the subscription goes on after: a relay passes the one
 * on as the end, the other as an error of its own. A page pays for the mark
 * alone; only a server's relay reads it.
 */
const finals = new WeakSet<object>();

/**
 * Mark the error a subscription ends with, before its listeners hear it.
 *
 * @param error - The error it ends with
 * @example
 * ```ts
 * markFinal(failure);
 * emit("error", failure);
 * ```
 */
export function markFinal(error: object): void {
  finals.add(error);
}

/**
 * Whether a subscription ended on the error its listener hears: the last it
 * tells, which `disconnected` and `close` follow.
 *
 * @param error - The error a listener of `error` heard
 * @returns Whether the subscription ended on it
 * @example
 * ```ts
 * upstream.on("error", (error) => isFinalError(error) || tellClient(error));
 * ```
 */
export function isFinalError(error: unknown): boolean {
  return finals.has(error as object);
}
