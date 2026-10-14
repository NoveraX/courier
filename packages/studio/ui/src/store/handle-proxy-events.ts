import { requestFromStart } from "./handle-request-events";
import type { RequestEntry } from "./types";

type EventPayload = Record<string, unknown>;

/**
 * A request announced again.
 *
 * A proxy announces a call as soon as it arrives, before its body is read,
 * so a pending upload has a row; the executor announces it again once it
 * has read the call, with its variables, middleware and schemas. The row
 * keeps when it started and how far it has got, and takes what the later
 * announcement adds.
 *
 * @param r - The request already shown
 * @param event - The later `request:start`
 * @returns The request with both announcements' details
 *
 * @example
 * ```ts
 * withRepeatedStart(arrived, executorStart)
 * ```
 */
export function withRepeatedStart(r: RequestEntry, event: EventPayload): RequestEntry {
  const fresh = requestFromStart(event);
  return {
    ...r,
    source: fresh.source || r.source,
    group: fresh.group ?? r.group,
    method: fresh.method || r.method,
    httpMethod: fresh.httpMethod ?? r.httpMethod,
    variables: fresh.variables !== undefined ? fresh.variables : r.variables,
    mode: r.mode === "proxy" || fresh.mode === "proxy" ? "proxy" : "direct",
    type: fresh.type ?? r.type,
    middlewareCount: Math.max(fresh.middlewareCount, r.middlewareCount),
    hasValidation: {
      variables: fresh.hasValidation.variables || r.hasValidation.variables,
      response: fresh.hasValidation.response || r.hasValidation.response,
    },
    url: fresh.url ?? r.url,
    sessionId: r.sessionId || fresh.sessionId,
  };
}

/**
 * The row with the variables the proxy read, when nothing else named them.
 *
 * A call the proxy refuses after reading it — to an endpoint no mark opens,
 * say — never reaches the executor, so this is the only place its variables
 * are told.
 *
 * @param r - The request
 * @param event - A `proxy:parse` event
 * @returns The request, with its variables when it had none
 *
 * @example
 * ```ts
 * withProxyParse(request, { variables: { id: 1 } })
 * ```
 */
export function withProxyParse(r: RequestEntry, event: EventPayload): RequestEntry {
  return r.variables === undefined && event.variables !== undefined
    ? { ...r, variables: event.variables }
    : r;
}
