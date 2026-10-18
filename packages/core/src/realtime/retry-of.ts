/**
 * Why a stream's connection is being opened again, as the client saw it:
 * how many connections in a row failed, when the next one opens, and how
 * the last one ended — the error it failed with, the close a socket
 * reported, or a server that fell silent.
 */
export interface ConnectionRetry {
  /** Connections in a row that ended before they delivered anything; 0 after one that delivered and then dropped */
  failures: number;
  /** In how many ms the next connection opens */
  retryIn: number;
  /** What the last connection failed with: fetch's rejection, a refusal the client retries, a socket's error event */
  error?: unknown;
  /** How the last socket closed */
  closed?: { code: number; reason: string } | undefined;
  /** Whether the last socket opened before it closed */
  opened?: boolean | undefined;
  /** How long the server had sent nothing for when the client gave up on the connection */
  silentFor?: number | undefined;
}

/* Kept beside the subscription, channel or connection, not on it: their
   shapes are the public API, and only Studio's instrumentation asks. */
const RETRIES = new WeakMap<object, () => ConnectionRetry | undefined>();

/**
 * Tell why a subscription, channel or connection last reconnected to whoever
 * asks {@link retryOf} of it.
 *
 * @param target - What reconnects
 * @param read - Its last retry, as it is now
 */
export function shareRetry(target: object, read: () => ConnectionRetry | undefined): void {
  RETRIES.set(target, read);
}

/**
 * Why a subscription, channel or connection last reconnected, read as it
 * reports `reconnecting`.
 *
 * @param target - What reconnects
 * @returns Its last retry, or `undefined` for one that never reconnected or does not tell
 * @example
 * ```ts
 * subscription.on("status", (status) => {
 *   if (status === "reconnecting") retryOf(subscription); // → { failures: 2, retryIn: 2000, error }
 * });
 * ```
 */
export function retryOf(target: object): ConnectionRetry | undefined {
  return RETRIES.get(target)?.();
}
