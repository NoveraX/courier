import type { Context } from "../http-client/types";
import { anySignal } from "./any-signal";
import type { EndpointHold } from "./cancel-previous";
import { clientForCall, holdOf } from "./execute-helpers";
import type { InnerExecuteDeps } from "./execute-inner";
import {
  buildMiddlewareContext,
  carryForwardedFor,
  forwardedChainOf,
} from "./execute-middleware-context";
import { resolveMiddlewareChain, withCallerSignal, withEndpointTimeout } from "./execute-options";
import { namedHeadersOf } from "./execute-resolve";
import { runCall } from "./execute-run";
import { applyCallSession, startCallSession } from "./execute-session";
import { callInstruments, type StudioContext, type TimingState } from "./execute-studio";
import type { CallTarget } from "./execute-target";
import { idempotencyHeader } from "./idempotency-header";
import { ownField, ownFields } from "./own";
import { settleCallSession } from "./settle-call-session";

/* The endpoint's own options — timeout, middleware, retry — are applied
   here, around the options the call itself gave. A call a newer one is to
   cancel holds its endpoint until it settles, across its attempts and the
   waits between them. */
export async function prepareAndRun(
  target: CallTarget,
  studio: StudioContext,
  timing: TimingState,
  context: Context | undefined,
): Promise<unknown> {
  /* Taken before a session starts, so an option the call cannot take leaves nothing waiting. */
  const hold = holdOf(target, context);
  try {
    return await runHeld(target, studio, timing, context, hold);
  } finally {
    hold?.release();
  }
}

async function runHeld(
  target: CallTarget,
  studio: StudioContext,
  timing: TimingState,
  context: Context | undefined,
  hold: EndpointHold | undefined,
): Promise<unknown> {
  /* Before anything waits: a framework may know the request being served
     only until then. What a provider fails with — a render a framework
     stops — is the call's failure, as it came. */
  const pendingSession = startCallSession(target, context);
  const { source, group, method, variables, dataSource, sourceOptions, schema, endpointOptions } =
    target;
  /* Read once, after a server checked what the call takes — the request's and the answer's. */
  const namedHeaders = namedHeadersOf(sourceOptions, endpointOptions);
  const instance = clientForCall(sourceOptions, context, schema?.type, hold);
  if (studio.hasStudio) studio.report?.watchFetch(instance, studio, timing);

  const {
    rawData = false,
    forwardVariables = true,
    headers: baseHeaders,
    stream = false,
    /* Read where the call took its hold; nothing `fetch` is given. */
    cancelPrevious: _cancelPrevious,
    ...baseOptions
  } = ownFields(target.options);
  const bounded = withCallerSignal(
    withEndpointTimeout(baseOptions, endpointOptions, context?.defaultTimeout),
    context?.req,
  );
  let callOptions =
    studio.report?.callUploads(bounded, studio, { source, group, method }) ?? bounded;
  /* A newer call cancels this one through its hold, in its middleware's waits too. */
  if (hold) {
    const own = ownField(callOptions, "signal");
    callOptions = { ...callOptions, signal: own ? anySignal([own, hold.signal]) : hold.signal };
  }

  const signal = ownField(callOptions, "signal") ?? undefined;
  const middlewareCtx = buildMiddlewareContext({
    source,
    group,
    method,
    variables,
    baseHeaders,
    context,
    sourceOptions,
    requestId: studio.requestId,
    namedHeaders,
    kind: schema?.type,
    signal,
    idempotencyHeader: idempotencyHeader(ownField(endpointOptions, "idempotencyKey")),
    purpose: target.purpose,
  });

  /* Source-level middleware wraps endpoint-level, so a concern declared once
     for the whole API still sees a request an endpoint also decorated. A
     retry policy is the outermost of the endpoint's own, so it re-runs them. */
  const middlewares = resolveMiddlewareChain(
    dataSource,
    ownField(sourceOptions, "middleware"),
    endpointOptions,
  );

  /* Told before the session settles: a write that asks for its token first
     shows that request within its own time, and one the session refuses
     ends with the refusal rather than never showing. */
  studio.report?.requestStart(studio, {
    ...target,
    mode: context?.mode ?? (context?.proxyMethod ? "proxy" : "direct"),
    middlewareCount: middlewares.length,
    agent: ownField(middlewareCtx, "agent"),
    idempotencyKey: ownField(middlewareCtx, "idempotencyKey"),
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
      ? {
          requestId: studio.requestId,
          dt: studio.dt,
          report: studio.report,
          timing,
          context,
          signal,
        }
      : undefined,
  });
  if ("refused" in settled) return settled.refused;
  const { session, primed } = settled;
  callOptions = applyCallSession(session, middlewareCtx, callOptions, sourceOptions);
  const chain = forwardedChainOf(context);
  if (chain !== undefined) carryForwardedFor(middlewareCtx.headers, await chain);

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
    answer: { rawData, stream, namedHeaders },
  });
}

type PreparedInner = Omit<InnerExecuteDeps, "middlewareHeaders" | "variables">;
