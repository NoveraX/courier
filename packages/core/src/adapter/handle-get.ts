import type { StudioHooks } from "../studio/hooks";
import type { RequestPayloadInput } from "../utils/helpers";
import { parseWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";
import type { HandlerConfig } from "./handler-config";
import { isOriginAllowed } from "./origin-policy";
import { errorResponse } from "./parse";
import { parseWireOptionsJson } from "./wire-options";

type ExecuteFn = (
  request: Request,
  payload: RequestPayloadInput,
  proxyMethod: "GET" | "POST",
  proxyReceiveAt: number,
) => Promise<Response>;

export function createGetHandler(execute: ExecuteFn, dt: StudioHooks, config?: HandlerConfig) {
  return async (request: Request): Promise<Response> => {
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
    const source = url.searchParams.get("_s");
    const group = url.searchParams.get("_g") || undefined;
    const method = url.searchParams.get("_m");

    if (!source || !method) {
      return errorResponse(400, "Missing required params: _s, _m");
    }

    const decoded = parseWireVariables(url.searchParams.get(WIRE_VARIABLES_KEY));
    if (!decoded.ok) return errorResponse(400, decoded.reason);
    const parsedVars = decoded.variables;

    dt.onProxyReceive?.({ proxyMethod: "GET", source, group, method, timestamp: Date.now() });

    const accepted = parseWireOptionsJson(url.searchParams.get("_o"));
    if (!accepted.ok) return errorResponse(400, accepted.reason);

    dt.onProxyParse?.({ source, group, method, variables: parsedVars, timestamp: Date.now() });

    const response = await execute(
      request,
      {
        source,
        group,
        method,
        variables: parsedVars,
        options: accepted.options,
      },
      "GET",
      proxyReceiveAt,
    );

    dt.onProxyRespond?.({
      proxyMethod: "GET",
      source,
      group,
      method,
      status: response.status,
      timestamp: Date.now(),
    });

    return response;
  };
}
