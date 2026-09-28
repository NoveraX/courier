import type { StudioHooks } from "../studio/hooks";
import type { RequestPayloadInput } from "../utils/helpers";
import { discardBody } from "./discard-body";
import type { HandlerConfig } from "./handler-config";
import { isOriginAllowed } from "./origin-policy";
import { errorResponse } from "./parse";
import { readEnvelope } from "./read-envelope";

type ExecuteFn = (
  request: Request,
  payload: RequestPayloadInput,
  proxyMethod: "GET" | "POST",
  proxyReceiveAt: number,
) => Promise<Response>;

export function createPostHandler(execute: ExecuteFn, dt: StudioHooks, config?: HandlerConfig) {
  return async (request: Request): Promise<Response> => {
    const proxyReceiveAt = performance.now();
    const origin = request.headers.get("origin");

    if (!isOriginAllowed(request, config?.allowedOrigins)) {
      dt.onProxyOriginReject?.({ origin: origin ?? "", timestamp: Date.now() });
      discardBody(request);
      return errorResponse(403, "Origin not allowed");
    }

    const body = await readEnvelope(request, config);
    if (body instanceof Response) return body;

    const proxySource = extractField(body, "_source", "source", "unknown");
    const proxyGroup = extractOptionalField(body, "_group", "group");
    const proxyMethod = extractField(body, "_method", "method", "unknown");

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

    const response = await execute(request, body, "POST", proxyReceiveAt);

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
}

function extractField(
  body: RequestPayloadInput,
  formKey: string,
  jsonKey: string,
  fallback: string,
): string {
  if (body instanceof FormData) return String(body.get(formKey) ?? fallback);
  return ((body as Record<string, unknown>)?.[jsonKey] as string) ?? fallback;
}

function extractOptionalField(
  body: RequestPayloadInput,
  formKey: string,
  jsonKey: string,
): string | undefined {
  if (body instanceof FormData) return (body.get(formKey) as string | null) ?? undefined;
  return (body as Record<string, unknown>)?.[jsonKey] as string | undefined;
}
