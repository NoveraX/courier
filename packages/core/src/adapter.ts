import type { Sources } from "./define/types";
import { devtoolsHooks } from "./devtools";
import { executeRequest } from "./utils/execute";
import type { RequestPayloadInput } from "./utils/helpers";

const META_KEYS = new Set(["_s", "_g", "_m", "_o"]);

const errorResponse = (status: number, message: string) =>
  Response.json({ success: false, message }, { status });

function parseOptions(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
      return value;
    });
  } catch {
    return undefined;
  }
}

export type AdapterHandler = {
  /** Handle any HTTP method (auto-routes GET/POST, returns 405 for others) */
  handle: (request: Request) => Promise<Response>;
  /** Handle GET request (query endpoints only) */
  handleGet: (request: Request) => Promise<Response>;
  /** Handle POST request (mutations + data) */
  handlePost: (request: Request) => Promise<Response>;
};

export function createHandler(sources: Sources): AdapterHandler {
  const execute = (request: Request, payload: RequestPayloadInput, proxyMethod: "GET" | "POST") =>
    executeRequest(sources, payload, { req: request, res: new Response(), proxyMethod });

  const dt = devtoolsHooks;

  const handleGet = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const source = url.searchParams.get("_s");
    const group = url.searchParams.get("_g") || undefined;
    const method = url.searchParams.get("_m");

    if (!source || !method) {
      return errorResponse(400, "Missing required params: _s, _m");
    }

    const variables: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (!META_KEYS.has(key)) {
        variables[key] = value;
      }
    }

    dt.onProxyReceive?.({
      proxyMethod: "GET",
      source,
      group,
      method,
      timestamp: Date.now(),
    });

    const parsedVars = Object.keys(variables).length > 0 ? variables : undefined;

    dt.onProxyParse?.({
      source,
      group,
      method,
      variables: parsedVars,
      timestamp: Date.now(),
    });

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

  const handlePost = async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");

    if (!origin || new URL(request.url).origin !== origin) {
      dt.onProxyOriginReject?.({
        origin: origin ?? "",
        timestamp: Date.now(),
      });
      return errorResponse(403, "Origin mismatch");
    }

    const contentType = request.headers.get("content-type");

    let body: RequestPayloadInput;

    if (contentType?.includes("multipart/form-data")) {
      body = await request.formData();
    } else if (contentType?.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        return errorResponse(400, "Invalid JSON body");
      }
    } else {
      return errorResponse(415, "Unsupported Content-Type");
    }

    const proxySource =
      body instanceof FormData
        ? String(body.get("_source") ?? "unknown")
        : ((body?.source as string) ?? "unknown");
    const proxyGroup =
      body instanceof FormData
        ? ((body.get("_group") as string | null) ?? undefined)
        : (body?.group as string | undefined);
    const proxyMethod =
      body instanceof FormData
        ? String(body.get("_method") ?? "unknown")
        : ((body?.method as string) ?? "unknown");

    dt.onProxyReceive?.({
      proxyMethod: "POST",
      source: proxySource,
      group: proxyGroup,
      method: proxyMethod,
      timestamp: Date.now(),
    });

    const proxyVariables = body instanceof FormData ? undefined : (body?.variables as unknown);

    dt.onProxyParse?.({
      source: proxySource,
      group: proxyGroup,
      method: proxyMethod,
      variables: proxyVariables,
      timestamp: Date.now(),
    });

    const response = await execute(request, body, "POST");

    dt.onProxyRespond?.({
      proxyMethod: "POST",
      source: proxySource,
      group: proxyGroup,
      method: proxyMethod,
      status: response.status,
      timestamp: Date.now(),
    });

    return response;
  };

  const handle = async (request: Request): Promise<Response> => {
    if (request.method === "GET") return handleGet(request);
    if (request.method === "POST") return handlePost(request);
    return errorResponse(405, "Method not allowed");
  };

  return { handle, handleGet, handlePost };
}
