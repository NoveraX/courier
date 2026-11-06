import type { Context } from "../http-client/types";

/**
 * Whether a call's context names the request it serves — an adapter's
 * description of it, a `Request`, or the headers one came with — or the
 * proxy's own. Such a call is a server's: a page serves no request.
 *
 * @param context - The call's context
 * @returns `true` when it names one
 * @example
 * ```ts
 * if (namesRequest(context)) return serverSession(target).contextSession(context, target);
 * ```
 */
export function namesRequest(context: Context): boolean {
  return (
    context.incoming !== undefined || context.req !== undefined || context.headers !== undefined
  );
}
