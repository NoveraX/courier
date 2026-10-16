import type { StudioHooks } from "../studio/hooks";
import { studioRequestIdOf } from "../studio/studio-request-id";
import { parseWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";
import type { ExecuteFn } from "./execute-fn";
import type { HandlerConfig } from "./handler-config";
import { isOriginAllowed } from "./origin-policy";
import { errorResponse } from "./parse";
import { announceProxyCall, type ProxyCallEvents } from "./proxy-call-events";
import { readRouting } from "./read-routing";
import { admittedOnStudioPass } from "./studio-pass-gate";
import { parseWireOptionsJson } from "./wire-options";

/**
 * Create the proxy's GET entry point, for reads a CDN or the browser may
 * cache: the endpoint, its variables (`_v`) and its options (`_o`) all travel
 * in the URL.
 *
 * @param execute - Runs the call once its URL is read
 * @param dt - The Studio hooks
 * @param config - The handler's origins
 * @returns The entry point
 *
 * @example
 * ```ts
 * const handleGet = createGetHandler(execute, studioHooks, { allowedOrigins });
 * ```
 */
export function createGetHandler(
  execute: ExecuteFn,
  dt: StudioHooks,
  config?: HandlerConfig,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const proxyReceiveAt = performance.now();

    /* The other three transports check this and GET did not, so a third-party
       page could drive every readable endpoint with the user's cookies. The
       rule admits a request with no Origin, which is what a CDN or a
       server-to-server caller sends, so nothing this route exists for is
       affected. */
    if (!isOriginAllowed(request, config?.allowedOrigins)) {
      const origin = request.headers.get("origin");
      dt.onProxyOriginReject?.({ origin: origin ?? "", timestamp: Date.now() });
      return errorResponse(403, "Origin not allowed");
    }

    const url = new URL(request.url);
    const routing = readRouting(url);
    if (!routing) return errorResponse(400, "Missing required params: _s, _m");

    const call = announceProxyCall(
      dt,
      "GET",
      routing,
      studioRequestIdOf(request.headers),
      admittedOnStudioPass(request),
    );
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
