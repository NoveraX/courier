import type { CallOptions, HTTPExecutor } from "@noverax/courier";

import { withQuerySignal } from "./with-query-signal";

/**
 * The option fields every HTTP hook shares, as the untyped implementation
 * sees them; `QueryGroupClient` gives callers the per-endpoint types.
 */
export interface HookOptions extends Record<string, unknown> {
  variables?: unknown;
  requestOptions?: CallOptions;
}

/** How the hooks of one group reach its endpoints over HTTP. */
export interface GroupCall {
  /** Call a method once, as a mutation does. */
  send: (method: string, variables: unknown, requestOptions?: CallOptions) => Promise<unknown>;
  /** Call a method for a query, aborting the request when the query's signal fires. */
  fetch: (
    method: string,
    variables: unknown,
    requestOptions: CallOptions | undefined,
    signal: AbortSignal,
  ) => Promise<unknown>;
}

/**
 * Bind a transport's HTTP executor to one group.
 *
 * @param groupName - API group the hooks belong to
 * @param httpExecutor - Direct or proxy executor the caller was built with
 * @returns The two ways a hook calls an endpoint
 * @example
 * const call = createGroupCall("users", httpExecutor);
 * queryFn: ({ signal }) => call.fetch("getAll", undefined, undefined, signal);
 */
export function createGroupCall(groupName: string, httpExecutor: HTTPExecutor): GroupCall {
  function send(method: string, variables: unknown, requestOptions?: CallOptions) {
    return httpExecutor(groupName, method, variables, requestOptions ?? {}, false);
  }

  return {
    send,
    fetch: (method, variables, requestOptions, signal) =>
      send(method, variables, withQuerySignal(requestOptions, signal)),
  };
}
