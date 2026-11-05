/**
 * Was this a cancellation the caller asked for?
 *
 * `fetch` rejects a cancelled request with the signal's reason — by default
 * a DOMException named `AbortError` — and a cancelled call with Courier's
 * own `AbortError`: both are named so. A timeout rejects with `TimeoutError`
 * instead, and is a failure to reach the server rather than a cancellation.
 * The public guard for Courier's error is `isAbortError`, from the errors.
 *
 * @param error - Whatever a request rejected with
 * @returns `true` for an error named `AbortError`
 *
 * @example
 * ```ts
 * try { await call(); } catch (e) { if (isCancellation(e)) return; throw e; }
 * ```
 */
export function isCancellation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}
