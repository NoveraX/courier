import type { BaseOptions, Context } from "../http-client/types";
import type { MiddlewareContext } from "../middleware/types";
import { type CallSession, sessionFor } from "../session/call-session";
import { type SessionTarget, sessionTargetOf } from "../session/session-target";
import type { CallTarget } from "./execute-target";

/**
 * Start finding what the user's session and `forward` give a call. It has to
 * start before the call first waits, while the framework still knows which
 * request is being served; what it finds is awaited when the call is built.
 *
 * @param target - The call, resolved to its API and endpoint
 * @param context - The call's context
 * @returns What the call carries, now or later; `undefined` for nothing
 * @example
 * ```ts
 * const pending = startCallSession(target, context);
 * ```
 */
export function startCallSession(
  target: CallTarget,
  context: Context | undefined,
): CallSession | Promise<CallSession | undefined> | undefined {
  return sessionFor(context, callSessionTarget(target));
}

/**
 * A call as the session reads it: its API's session and `forward`, what its
 * endpoint does, and where it goes.
 *
 * @param target - The call, resolved to its API and endpoint
 * @returns The call as the session reads it
 * @example
 * ```ts
 * const again = await sessionFor(context, callSessionTarget(target));
 * ```
 */
export function callSessionTarget(target: CallTarget): SessionTarget {
  const { source, group, method } = target;
  return sessionTargetOf({
    dataSource: target.dataSource,
    endpointOptions: target.endpointOptions,
    kind: target.schema?.type,
    httpMethod: target.httpMethod,
    prefixUrl: target.options?.prefixUrl,
    name: [source, group, method].filter((part) => part !== undefined && part !== "").join("."),
  });
}

/**
 * Put what the session gives a call on it: its headers under any the call
 * set itself, and what `fetch` has to be given under the API's own options
 * and the call's. A call that carries the user's credentials from a server
 * follows redirects only on the API's own origin.
 *
 * @param session - What the session gives the call
 * @param ctx - The middleware context, whose headers the call is sent with
 * @param options - The call's options
 * @param sourceOptions - The API's options
 * @returns The call's options, with the session's under them
 * @example
 * ```ts
 * callOptions = applyCallSession(session, middlewareCtx, callOptions, dataSource.options);
 * ```
 */
export function applyCallSession<TOptions extends object>(
  session: CallSession | undefined,
  ctx: Pick<MiddlewareContext, "headers" | "carriesSession">,
  options: TOptions,
  sourceOptions: BaseOptions | undefined,
): TOptions {
  if (session === undefined) return options;
  for (const [name, value] of session.headers) {
    if (!ctx.headers.has(name)) ctx.headers.set(name, value);
  }
  ctx.carriesSession = session.carries;
  const init = Object.entries(session.fetchInit ?? {}).filter(
    ([key]) => sourceOptions === undefined || !(key in sourceOptions),
  );
  const within = session.carries && session.incoming !== undefined;
  return { ...Object.fromEntries(init), ...options, ...(within && { withinOrigin: true }) };
}
