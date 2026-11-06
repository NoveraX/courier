import type { AgentCall } from "../../agent/types";
import type { Context } from "../../http-client/types";

/**
 * The context of a call the server's caller makes, as a page's bundle has
 * it: the caller's own, with no mark — the root's caller, the server's,
 * calls for the page's one user there.
 *
 * @param context - The caller's own context
 * @returns A copy of it
 * @example
 * ```ts
 * directClient(source, { ...defaults, context: serverCallContext(defaults.context) });
 * ```
 */
export function serverCallContext(context: Context | undefined): Context {
  return { ...context };
}

/**
 * The context of a call made for an agent, as a page's bundle has it: the
 * rest of the call's, with no mark — no page makes a call for an agent.
 *
 * @param context - The rest of the call's context
 * @param _agent - The agent the call would be made for
 * @returns A copy of the context
 * @example
 * ```ts
 * await executeRequest(sources, call, agentCallContext({ defaultTimeout: 60_000 }, agent));
 * ```
 */
export function agentCallContext(context: Context | undefined, _agent: AgentCall): Context {
  return { ...context };
}

/**
 * The agent a call comes from, as a page's bundle has it: none.
 *
 * @param _context - The call's context
 * @returns `undefined`
 * @example
 * ```ts
 * if (agentOf(context)) return undefined;
 * ```
 */
export function agentOf(_context: Context | undefined): AgentCall | undefined {
  return undefined;
}

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
