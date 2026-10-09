/* The calls Studio's suggested fixes turn on: a line holding one is the line that fixes. */
const FIX_CALLS = [
  ".timeout(",
  ".retry(",
  "idempotencyKey",
  "cacheMiddleware(",
  "authMiddleware(",
  ".response(z.",
  ".variables(z.",
  "createProxyCaller",
  "Promise.all(",
] as const;

/**
 * Whether a line of a suggested fix is the one that makes the fix — it
 * holds the call the finding recommends — so it can be drawn out.
 *
 * @param line - The line
 * @returns Whether it holds a fixing call
 * @example
 * ```ts
 * isFixLine('  .timeout(5_000)'); // true
 * ```
 */
export function isFixLine(line: string): boolean {
  return FIX_CALLS.some((call) => line.includes(call));
}
