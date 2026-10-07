import { parseWireOptions } from "../adapter/wire-options";
import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import { generateRequestId, studioHooks } from "../studio";
import { clientForCall } from "./execute-helpers";
import type { InnerExecuteDeps } from "./execute-inner";
import { buildMiddlewareContext } from "./execute-middleware-context";
import { resolveMiddlewareChain, withCallerSignal, withEndpointTimeout } from "./execute-options";
import { namedHeadersOf } from "./execute-resolve";
import { buildErrorResponse } from "./execute-response";
import { runCall } from "./execute-run";
import { applyCallSession, startCallSession } from "./execute-session";
import {
  attachFetchHook,
  emitRequestStart,
  type StudioContext,
  type TimingState,
} from "./execute-studio";
import { type CallTarget, resolveCallTarget } from "./execute-target";
import { idempotencyHeader } from "./idempotency-header";
import { parseRequestPayload, type RequestPayloadInput } from "./request-payload";
import { withStudioUploads } from "./studio-uploads";

const log = createLogger("Session");

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

  const hasStudio = studioHooks.onRequestStart !== undefined;
  const studio: StudioContext = {
    hasStudio,
    requestId: hasStudio ? (context?.studioRequestId ?? generateRequestId()) : "",
    dt: studioHooks,
  };
  const timing: TimingState = {
    t0: hasStudio ? performance.now() : 0,
    tVarValidation: 0,
    tRespValidation: 0,
    tFetch: 0,
  };

  const call = { source, group, method, variables, options };
  const resolution = resolveCallTarget(sources, call, context);
  if ("refusal" in resolution) return resolution.refusal;
  return prepareAndRun(resolution.target, studio, timing, context);
}

/* The endpoint's own options — timeout, middleware, retry — are applied
   here, around the options the call itself gave. */
async function prepareAndRun(
  target: CallTarget,
  studio: StudioContext,
  timing: TimingState,
  context: Context | undefined,
): Promise<unknown> {
  /* Before anything waits: a framework may know the request being served
     only until then. What a provider fails with — a render a framework
     stops — is the call's failure, as it came. */
  const pendingSession = startCallSession(target, context);
  const { source, group, method, variables, dataSource, schema, endpointOptions } = target;
  const instance = clientForCall(dataSource, context, schema?.type);
  if (studio.hasStudio) attachFetchHook(instance, studio);

  const {
    rawData = false,
    forwardVariables = true,
    headers: baseHeaders,
    stream = false,
    ...baseOptions
  } = target.options ?? {};
  let callOptions = withStudioUploads(
    withCallerSignal(
      withEndpointTimeout(baseOptions, endpointOptions, context?.defaultTimeout),
      context?.req,
    ),
    studio,
    { source, group, method },
  );

  const middlewareCtx = buildMiddlewareContext({
    source,
    group,
    method,
    variables,
    baseHeaders,
    context,
    dataSource,
    requestId: studio.requestId,
    endpointAllowedHeaders: endpointOptions?.allowedHeaders,
    kind: schema?.type,
    signal: callOptions.signal ?? undefined,
    idempotencyHeader: idempotencyHeader(endpointOptions?.idempotencyKey),
  });
  const session = await pendingSession;
  if (session?.refusal !== undefined) {
    log.warn(`Refused: ${session.refusal}`);
    return buildErrorResponse(context, 403, session.refusal);
  }
  callOptions = applyCallSession(session, middlewareCtx, callOptions, dataSource.options);
  const mode = context?.mode ?? (context?.proxyMethod ? "proxy" : "direct");

  /* Source-level middleware wraps endpoint-level, so a concern declared once
     for the whole API still sees a request an endpoint also decorated. A
     retry policy is the outermost of the endpoint's own, so it re-runs them. */
  const middlewares = resolveMiddlewareChain(dataSource.options?.middleware, endpointOptions);

  emitRequestStart(studio, {
    source,
    group,
    method,
    variables,
    mode,
    middlewareCount: middlewares.length,
    schema,
    httpMethod: target.httpMethod,
  });

  const inner: PreparedInner = {
    endpoint: target.endpoint as PreparedInner["endpoint"],
    instance,
    endpointGroupOptions: target.endpointGroup?.options,
    forwardVariables,
    baseOptions: callOptions,
    stream,
    schema,
    hasStudio: studio.hasStudio,
    requestId: studio.requestId,
    dt: studio.dt,
    timing,
  };
  return runCall({
    inner,
    middlewareCtx,
    middlewares,
    schema,
    studio,
    timing,
    context,
    session,
    answer: {
      rawData,
      stream,
      namedHeaders: namedHeadersOf(dataSource, endpointOptions?.allowedHeaders),
    },
  });
}

type PreparedInner = Omit<InnerExecuteDeps, "middlewareHeaders" | "variables">;
