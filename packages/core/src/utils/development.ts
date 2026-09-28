/**
 * Whether this runs outside production, as `NODE_ENV` says.
 *
 * A browser loading the library as native ESM, and a Worker without Node
 * compatibility, have no `process` at all, and reading it unguarded threw a
 * ReferenceError from `defineApi`. Where there is no `process` to ask, the
 * answer is no, which keeps every development-only allowance closed.
 * `process.env.NODE_ENV` stays spelled out so a bundler can still replace it.
 *
 * @returns `true` only when a `process` exists and `NODE_ENV` is not `"production"`
 * @example
 * ```ts
 * if (isDevelopment()) studioHooks.onSourceDefined?.(source, baseURL);
 * ```
 */
export function isDevelopment(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
}
