/**
 * Failures no second attempt mends, marked where they are made: a redirect
 * an upload cannot follow, which the upstream answers the same way every
 * time it is sent. A retry policy sends a call one ends once, whatever it
 * lists — a mark rather than a code, as each is still the error it is.
 */

const UNREPEATABLE = new WeakSet<object>();

/**
 * Mark a failure as one no second attempt mends.
 *
 * @param error - The failure, as it is about to be thrown
 * @returns The same failure
 * @example
 * ```ts
 * throw unrepeatable(new NetworkError({ cause }));
 * ```
 */
export function unrepeatable<TError extends object>(error: TError): TError {
  UNREPEATABLE.add(error);
  return error;
}

/**
 * Whether a failure was marked as one no second attempt mends.
 *
 * @param error - What an attempt was rejected with
 * @returns `true` for a marked failure
 * @example
 * ```ts
 * if (isUnrepeatable(error)) return undefined;
 * ```
 */
export function isUnrepeatable(error: unknown): boolean {
  return typeof error === "object" && error !== null && UNREPEATABLE.has(error);
}
