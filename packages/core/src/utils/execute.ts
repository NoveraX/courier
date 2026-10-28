import { parseWireOptions } from "../adapter/wire-options";
import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
import { buildErrorResponse } from "./execute-response";
import { callInstruments } from "./execute-studio";
import { resolveCallTarget } from "./execute-target";
import { prepareAndRun } from "./prepare-and-run";
import { parseRequestPayload, type RequestPayloadInput } from "./request-payload";

/**
 * Run one call against the registered sources: the proxy's handler and a
 * direct caller both end here.
 *
 * The call names its source, group and method. It is refused with a 400
 * when they name nothing, when its variables have no form on the wire, or —
 * over the proxy — when its options or its endpoint are not the browser's
 * to use. Otherwise its variables are validated, it runs through the
 * source's and the endpoint's middleware, and its answer is built.
 *
 * @param sources - The registered sources
 * @param requestPayload - The call: source, group, method, variables and options
 * @param context - Where the call came from; with `res`, the answer is a `Response`
 * @returns A `Response` for the proxy; the data, or the whole response with
 *   `rawData`, for a direct caller, who gets a failure as a rejection
 *
 * @example
 * ```ts
 * const users = await executeRequest(sources, { source: "api", group: "users", method: "list" });
 * ```
 */
export async function executeRequest(
  sources: Sources,
  requestPayload: RequestPayloadInput,
  context: Context & { res: Response },
): Promise<Response>;
export async function executeRequest(
  sources: Sources,
  requestPayload: RequestPayloadInput,
  context?: Context,
): Promise<unknown>;
export async function executeRequest(
  sources: Sources,
  requestPayload: RequestPayloadInput,
  context?: Context,
): Promise<unknown> {
  const { source, group, method, variables, options: given } = parseRequestPayload(requestPayload);

  /* A request that arrived over the proxy is untrusted, so it keeps only the
     options `parseWireOptions` names. A server-side caller runs in this
     process, already chose the destination, and keeps the full set. */
  let options = given;
  if (context?.proxyMethod !== undefined) {
    const accepted = parseWireOptions(given);
    if (!accepted.ok) return buildErrorResponse(context, 400, accepted.reason);
    options = accepted.options;
  }

  const { studio, timing } = callInstruments(context?.studioRequestId);
  const call = { source, group, method, variables, options };
  const resolution = resolveCallTarget(sources, call, context);
  if ("refusal" in resolution) return resolution.refusal;
  return prepareAndRun(resolution.target, studio, timing, context);
}
