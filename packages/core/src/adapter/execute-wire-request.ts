import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
import { executeCall } from "../utils/execute";
import { buildErrorResponse } from "../utils/execute-response";
import { parseRequestPayload, type RequestPayloadInput } from "../utils/request-payload";
import { unsentUpload } from "./unsent-upload";
import { parseWireOptions } from "./wire-options";
import { refuseWireCall } from "./wire-refusal";

/** The context of a call a browser sent the proxy: the method it came with, and the proxy's request. */
export type WireContext = Context & { proxyMethod: "GET" | "POST" };

/**
 * Run one call a browser sent the proxy. Such a call is untrusted: it keeps
 * only the options `parseWireOptions` names, and the endpoint it names runs
 * only where `refuseWireCall` lets a browser reach it — asked before the
 * call is known to be a stream's, so a hidden endpoint stays unknown. An
 * upload it sends on as it arrives that fails on the browser's side is
 * answered as the upload's refusal. A server-side caller runs in this
 * process, already chose the destination, and goes through
 * `executeRequest` with the full set.
 *
 * @param sources - The registered sources
 * @param requestPayload - The call: source, group, method, variables and options
 * @param context - The proxy's request, its `Response`, and the method the call came with
 * @returns The `Response` the browser is answered with
 * @example
 * ```ts
 * const answer = await executeWireRequest(sources, payload, { req, res: new Response(), proxyMethod: "POST" });
 * ```
 */
export async function executeWireRequest(
  sources: Sources,
  requestPayload: RequestPayloadInput,
  context: WireContext & { res: Response },
): Promise<Response>;
export async function executeWireRequest(
  sources: Sources,
  requestPayload: RequestPayloadInput,
  context: WireContext,
): Promise<unknown>;
export async function executeWireRequest(
  sources: Sources,
  requestPayload: RequestPayloadInput,
  context: WireContext,
): Promise<unknown> {
  const call = parseRequestPayload(requestPayload);
  const accepted = parseWireOptions(call.options);
  if (!accepted.ok) return buildErrorResponse(context, 400, accepted.reason);
  const wire = { ...context, unsentUpload };
  return executeCall(sources, { ...call, options: accepted.options }, wire, (found) =>
    refuseWireCall({
      dataSource: found.dataSource,
      group: found.group,
      method: found.method,
      schema: found.schema,
      stream: found.options?.stream,
      proxyMethod: context.proxyMethod,
      sensitiveVariables: found.endpointOptions?.sensitiveVariables === true,
      endpoint: found.endpoint,
    }),
  );
}
