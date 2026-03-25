import type { StudioHooks } from "../studio/hooks";
import type { RequestPayloadInput } from "../utils/helpers";
import { errorResponse, META_KEYS, parseOptions } from "./parse";

type ExecuteFn = (
  request: Request,
  payload: RequestPayloadInput,
  proxyMethod: "GET" | "POST",
  proxyReceiveAt: number,
) => Promise<Response>;

export function createGetHandler(execute: ExecuteFn, dt: StudioHooks) {
  return async (request: Request): Promise<Response> => {
    const proxyReceiveAt = performance.now();
    const url = new URL(request.url);
    const source = url.searchParams.get("_s");
    const group = url.searchParams.get("_g") || undefined;
    const method = url.searchParams.get("_m");

    if (!source || !method) {
      return errorResponse(400, "Missing required params: _s, _m");
    }

    const variables: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (!META_KEYS.has(key)) variables[key] = value;
    }

    dt.onProxyReceive?.({ proxyMethod: "GET", source, group, method, timestamp: Date.now() });

    const parsedVars = Object.keys(variables).length > 0 ? variables : undefined;

    dt.onProxyParse?.({ source, group, method, variables: parsedVars, timestamp: Date.now() });

    const response = await execute(
      request,
      {
        source,
        group,
        method,
        variables: parsedVars,
        options: parseOptions(url.searchParams.get("_o")),
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
