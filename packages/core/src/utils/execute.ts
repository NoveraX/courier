import { admittedOnStudioPass } from "../adapter/studio-pass-gate";
import { parseWireOptions } from "../adapter/wire-options";
import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
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
  callInstruments,
  emitRequestStart,
  type StudioContext,
  type TimingState,
} from "./execute-studio";
import { type CallTarget, resolveCallTarget } from "./execute-target";
import { idempotencyHeader } from "./idempotency-header";
import { parseRequestPayload, type RequestPayloadInput } from "./request-payload";
import { settleCallSession } from "./settle-call-session";
import { withStudioUploads } from "./studio-uploads";

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

/* The endpoint's own options — timeout, middleware, retry — are applied
   here, around the options the call itself gave. */
export async function prepareAndRun(
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
  const path = [group, method].filter((part) => part !== undefined && part !== "").join(".");
  const instance = clientForCall(dataSource, context, schema?.type, path);
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

  const signal = callOptions.signal ?? undefined;
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
    signal,
    idempotencyHeader: idempotencyHeader(endpointOptions?.idempotencyKey),
    purpose: target.purpose,
  });

  /* Source-level middleware wraps endpoint-level, so a concern declared once
     for the whole API still sees a request an endpoint also decorated. A
     retry policy is the outermost of the endpoint's own, so it re-runs them. */
  const middlewares = resolveMiddlewareChain(dataSource.options?.middleware, endpointOptions);

  /* Told before the session settles: a write that asks for its token first
     shows that request within its own time, and one the session refuses
     ends with the refusal rather than never showing. */
  emitRequestStart(studio, {
    ...target,
    mode: context?.mode ?? (context?.proxyMethod ? "proxy" : "direct"),
    middlewareCount: middlewares.length,
    agent: context?.agent,
    idempotencyKey: middlewareCtx.idempotencyKey,
    studioPass: admittedOnStudioPass(context?.req),
  });

  /* The token a write asks for first goes as calls go, under an id of its own. */
  const runPrime = (prime: CallTarget, primeContext: Context | undefined) => {
    const instruments = callInstruments(undefined);
    return prepareAndRun(prime, instruments.studio, instruments.timing, primeContext);
  };
  const settled = await settleCallSession(pendingSession, {
    target,
    context,
    signal,
    run: runPrime,
    told: studio.hasStudio
      ? { requestId: studio.requestId, dt: studio.dt, timing, context, signal }
      : undefined,
  });
  if ("refused" in settled) return settled.refused;
  const { session, primed } = settled;
  callOptions = applyCallSession(session, middlewareCtx, callOptions, dataSource.options);

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
    primed,
    answer: {
      rawData,
      stream,
      namedHeaders: namedHeadersOf(dataSource, endpointOptions?.allowedHeaders),
    },
  });
}

type PreparedInner = Omit<InnerExecuteDeps, "middlewareHeaders" | "variables">;
