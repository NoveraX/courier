/**
 * Was this a cancellation the caller asked for?
 *
 * `fetch` rejects a cancelled request with the signal's reason — by default
 * a DOMException named `AbortError`. A timeout rejects with `TimeoutError`
 * instead, and is a failure to reach the server rather than a cancellation.
 *
 * @param error - Whatever a request rejected with
 * @returns `true` for an `AbortError`
 *
 * @example
 * ```ts
 * try { await call(); } catch (e) { if (isAbortError(e)) return; throw e; }
 * ```
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}
