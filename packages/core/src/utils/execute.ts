import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
import { callInstruments } from "./execute-studio";
import { type CallRefusal, type CallRequest, resolveCallTarget } from "./execute-target";
import { ownFields } from "./own";
import { prepareAndRun } from "./prepare-and-run";
import { parseRequestPayload, type RequestPayloadInput } from "./request-payload";

/**
 * Run one call against the registered sources: the proxy's handler and a
 * direct caller both end here.
 *
 * The call names its source, group and method. It is refused with a 400
 * when they name nothing, or when its variables have no form on the wire;
 * the proxy refuses what is not a browser's to use first, with
 * `executeWireRequest`. Otherwise its variables are validated, it runs
 * through the source's and the endpoint's middleware, and its answer is
 * built.
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
  return executeCall(sources, parseRequestPayload(requestPayload), context);
}

/**
 * Run a call read from its payload against the registered sources, after
 * `refuse` has had its say on the endpoint it found.
 *
 * @param sources - The registered sources
 * @param call - The call: source, group, method, variables and options
 * @param context - Where the call came from
 * @param refuse - What refuses a found call where it came from, when anything does
 * @returns What `executeRequest` returns for the call
 * @example
 * ```ts
 * await executeCall(sources, { source: "api", group: "users", method: "list", variables: undefined, options: undefined }, context);
 * ```
 */
export async function executeCall(
  sources: Sources,
  call: CallRequest,
  context: Context | undefined,
  refuse?: CallRefusal,
): Promise<unknown> {
  /* Its context, read as its own fields alone however the call came: the target holds the call's
     own options so. */
  const own = context && ownFields(context);
  const { studio, timing } = callInstruments(own?.studioRequestId);
  const resolution = resolveCallTarget(sources, call, own, refuse);
  if ("refusal" in resolution) return resolution.refusal;
  return prepareAndRun(resolution.target, studio, timing, own);
}
