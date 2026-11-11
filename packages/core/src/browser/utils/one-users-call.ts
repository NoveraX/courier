import type { Context } from "../../http-client/types";

/**
 * Whether a call made now is one user's own, as a page's bundle has it:
 * every call of a page is. Its context names no request, its document is
 * the page's, and no server lends it anything — the root's caller, the
 * server's, calls for the page's one user there too. A bundler that builds
 * for the browser takes this module in place of the one that asks.
 *
 * @param _context - The call's context
 * @returns `true`
 * @example
 * ```ts
 * const held = cancels && isOneUsersCall(context);
 * ```
 */
export function isOneUsersCall(_context?: Context): boolean {
  return true;
}
