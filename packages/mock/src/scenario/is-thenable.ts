/**
 * Whether a value is a promise, or anything else `await` would wait for.
 *
 * @param value - What a user callback returned
 * @returns `true` when it has a callable `then`
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
