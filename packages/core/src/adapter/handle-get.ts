import type { StudioHooks } from "../studio/hooks";
import { studioRequestIdOf } from "../studio/studio-request-id";
import { parseWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";
import type { ExecuteFn } from "./execute-fn";
import { errorResponse } from "./parse";
import { announceProxyCall, type ProxyCallEvents } from "./proxy-call-events";
import { readRouting } from "./read-routing";
import { parseWireOptionsJson } from "./wire-options";

/**
 * Create the proxy's GET entry point, for reads a CDN or the browser may
 * cache: the endpoint, its variables (`_v`) and its options (`_o`) all travel
 * in the URL. The page a request comes from is checked in front of it, as in
 * front of every entry point (see `gateEntry`): a third-party page would
 * otherwise drive every readable endpoint with the user's cookies.
 *
 * @param execute - Runs the call once its URL is read
 * @param dt - The Studio hooks
 * @returns The entry point
 *
 * @example
 * ```ts
 * const handleGet = gateEntry(createGetHandler(execute, studioHooks), config, studioHooks, refusals);
 * ```
 */
export function createGetHandler(
  execute: ExecuteFn,
  dt: StudioHooks,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const proxyReceiveAt = performance.now();

    const url = new URL(request.url);
    const routing = readRouting(url);
    if (!routing) return errorResponse(400, "Missing required params: _s, _m");

    const call = announceProxyCall(dt, "GET", routing, studioRequestIdOf(request.headers));
    const decoded = parseWireVariables(url.searchParams.get(WIRE_VARIABLES_KEY));
    if (!decoded.ok) return refuse(call, decoded.reason);
    const accepted = parseWireOptionsJson(url.searchParams.get("_o"));
    if (!accepted.ok) return refuse(call, accepted.reason);
    call.parsed(decoded.variables);

    const payload = { ...routing, variables: decoded.variables, options: accepted.options };
    const response = await execute(request, payload, "GET", proxyReceiveAt, call.requestId);
    call.responded(response.status);
    return response;
  };
}

/** Refuse a call whose URL does not read, ending it for Studio as well. */
function refuse(call: ProxyCallEvents, reason: string): Response {
  call.refused(400, reason);
  return errorResponse(400, reason);
}
