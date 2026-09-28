import type { StudioHooks } from "../studio/hooks";
import { discardBody } from "./discard-body";
import type { ExecuteFn } from "./execute-fn";
import type { HandlerConfig } from "./handler-config";
import { isOriginAllowed } from "./origin-policy";
import { errorResponse } from "./parse";
import { announceProxyCall } from "./proxy-call-events";
import { readEnvelope } from "./read-envelope";
import { readRouting } from "./read-routing";

/**
 * Create the proxy's POST entry point.
 *
 * The endpoint is named in the URL, so the call is known — and shown in
 * Studio — before its body is read; the body carries the variables and the
 * options alone, as JSON or as a multipart upload.
 *
 * @param execute - Runs the call once its envelope is read
 * @param dt - The Studio hooks
 * @param config - The handler's origins and body limits
 * @returns The entry point
 *
 * @example
 * ```ts
 * const handlePost = createPostHandler(execute, studioHooks, { maxUploadBytes: 50_000_000 });
 * ```
 */
export function createPostHandler(
  execute: ExecuteFn,
  dt: StudioHooks,
  config?: HandlerConfig,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const proxyReceiveAt = performance.now();

    if (!isOriginAllowed(request, config?.allowedOrigins)) {
      dt.onProxyOriginReject?.({
        origin: request.headers.get("origin") ?? "",
        timestamp: Date.now(),
      });
      discardBody(request);
      return errorResponse(403, "Origin not allowed");
    }

    const routing = readRouting(new URL(request.url));
    if (!routing) {
      discardBody(request);
      return errorResponse(400, "Missing required params: _s, _m");
    }

    const call = announceProxyCall(dt, "POST", routing);
    const read = await readEnvelope(request, config);
    if (!read.ok) {
      call.refused(read.status, read.message);
      return errorResponse(read.status, read.message);
    }
    call.parsed(read.envelope.variables);

    const payload = { ...routing, ...read.envelope };
    const response = await execute(request, payload, "POST", proxyReceiveAt, call.requestId);
    call.responded(response.status);
    return response;
  };
}
