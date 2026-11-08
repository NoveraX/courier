import { hasOwnProcess, inProduction } from "./environment";

/**
 * Whether this runs outside production, as `NODE_ENV` says.
 *
 * A browser loading the library as native ESM, and a Worker without Node
 * compatibility, have no `process` at all, and reading it unguarded threw a
 * ReferenceError from `defineApi`. Where the runtime has no `process` of its
 * own to ask — one Object.prototype holds is none — the answer is no, which
 * keeps every development-only allowance closed, and so does a
 * `"production"` found anywhere, the prototype's too: a value there may
 * close an allowance, never open one. `process.env.NODE_ENV` stays spelled
 * out so a bundler can still replace it.
 *
 * @returns `true` only when the runtime owns a `process` and `NODE_ENV` reads no `"production"`
 * @example
 * ```ts
 * if (isDevelopment()) studioHooks.onSourceDefined?.(source, baseURL);
 * ```
 */
export function isDevelopment(): boolean {
  return hasOwnProcess() && !inProduction();
}
