import type { StudioHooks } from "../studio/hooks";
import { studioRequestIdOf } from "../utils/studio-request-id";
import { discardBody } from "./discard-body";
import type { ExecuteFn } from "./execute-fn";
import type { HandlerConfig } from "./handler-config";
import { errorResponse } from "./parse";
import { announceProxyCall } from "./proxy-call-events";
import { readEnvelope } from "./read-envelope";
import { readRouting } from "./read-routing";
import { recordDefaults } from "./record-defaults";

/**
 * Create the proxy's POST entry point.
 *
 * The endpoint is named in the URL, so the call is known — and shown in
 * Studio — before its body is read; the body carries the variables and the
 * options alone, as JSON or as a multipart upload.
 *
 * @param execute - Runs the call once its envelope is read
 * @param dt - The Studio hooks
 * @param config - The handler's body limits
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

    const routing = readRouting(new URL(request.url));
    if (!routing) {
      discardBody(request);
      return errorResponse(400, "Missing required params: _s, _m");
    }

    const call = announceProxyCall(dt, "POST", routing, studioRequestIdOf(request.headers));
    const read = await readEnvelope(request, config, recordDefaults(config, routing));
    if (!read.ok) {
      call.refused(read.status, read.message);
      return errorResponse(read.status, read.message, read.code, read.retryAfter);
    }
    call.parsed(read.envelope.variables);

    const payload = { ...routing, ...read.envelope };
    try {
      const response = await execute(request, payload, "POST", proxyReceiveAt, call.requestId);
      call.responded(response.status);
      return response;
    } finally {
      /* What the upload holds is the call's — its files, or the rest of one sent on as it
         arrived — and goes once the call has its answer, whatever ended it. */
      await read.release?.();
    }
  };
}
