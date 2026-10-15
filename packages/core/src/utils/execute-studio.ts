import type { AgentCall } from "../agent/types";
import type { Context } from "../http-client/types";
import type { CallPurpose } from "../middleware/types";
import { generateRequestId, type StudioHooks, studioHooks } from "../studio";
import { describeFormData } from "../studio/describe-form-data";
import type { SchemaMetadata } from "../validation";
import { estimateResponseSize, headersToObject, isFormData, normalizeHttpMethod } from "./helpers";
import type { SharedAnswer } from "./shared-answer";

export type TimingState = {
  t0: number;
  tVarValidation: number;
  tRespValidation: number;
  tFetch: number;
  /** How the call's read was answered by another call's request, when it was */
  shared?: SharedAnswer | undefined;
};

export type StudioContext = {
  hasStudio: boolean;
  requestId: string;
  dt: StudioHooks;
};

/** What a request is, as Studio is told when it starts. */
export interface RequestStart {
  source: unknown;
  group: unknown;
  method: unknown;
  variables: unknown;
  mode: "direct" | "proxy";
  middlewareCount: number;
  schema: SchemaMetadata | undefined;
  /** The endpoint's HTTP verb, when it declares one. */
  httpMethod: string | undefined;
  /** What the call is, when it is a request the session makes rather than an endpoint's */
  purpose?: CallPurpose | undefined;
  /** The agent the call comes from, when an MCP server made it for one */
  agent?: AgentCall | undefined;
  /** The key the call sends in its endpoint's idempotency header, the same on every attempt */
  idempotencyKey?: string | undefined;
}

/**
 * Emit onRequestStart event if studio is active.
 *
 * The verb and whether the endpoint reads or writes go with it: a request
 * that fails before it is sent — its variables refused, a middleware thrown —
 * never reports them later, and was shown as a GET query.
 */
export function emitRequestStart(dCtx: StudioContext, start: RequestStart): void {
  const { source, group, method, variables, schema } = start;
  dCtx.dt.onRequestStart?.({
    id: dCtx.requestId,
    source: String(source),
    group: group ? String(group) : undefined,
    method: String(method),
    /* Studio receives events as JSON, where a FormData would arrive as `{}`. */
    variables: isFormData(variables) ? describeFormData(variables) : variables,
    mode: start.mode,
    middlewareCount: start.middlewareCount,
    hasValidation: { variables: !!schema?.variables, response: !!schema?.response },
    ...(start.httpMethod && { httpMethod: start.httpMethod }),
    ...(schema?.type && { endpointType: schema.type }),
    ...(start.purpose && { purpose: start.purpose }),
    ...(start.agent && { agent: agentShown(start.agent) }),
    ...(start.idempotencyKey && { idempotencyKey: start.idempotencyKey }),
    timestamp: Date.now(),
  });
}

/* Who the server let in stays out of Studio: it is the application's to show, and may hold a token. */
function agentShown(agent: AgentCall): {
  tool: string;
  access: AgentCall["access"];
  client?: string;
} {
  const client =
    agent.client && [agent.client.name, agent.client.version].filter(Boolean).join(" ");
  return { tool: agent.tool, access: agent.access, ...(client && { client }) };
}

/**
 * What a call is measured and told to Studio with: the id its events carry,
 * a new one unless the proxy gave it one, and its timings.
 *
 * @param requestId - The id the proxy gave the call, if it did
 * @returns The call's Studio context and timing
 * @example
 * ```ts
 * const { studio, timing } = callInstruments(context?.studioRequestId);
 * ```
 */
export function callInstruments(requestId: string | undefined): {
  studio: StudioContext;
  timing: TimingState;
} {
  const hasStudio = studioHooks.onRequestStart !== undefined;
  return {
    studio: {
      hasStudio,
      requestId: hasStudio ? (requestId ?? generateRequestId()) : "",
      dt: studioHooks,
    },
    timing: {
      t0: hasStudio ? performance.now() : 0,
      tVarValidation: 0,
      tRespValidation: 0,
      tFetch: 0,
    },
  };
}

/** How a proxied call's time split between the proxy's own work and the upstream. */
export interface ProxySplit {
  clientToProxy: number;
  proxyToBackend: number;
  backendToProxy: number;
  proxyToClient: number;
}

/**
 * How a call the proxy received spent its time: the proxy's own work around
 * the fetch, and the fetch itself. The browser measures the legs to and from
 * the proxy, so they are left at 0 here.
 *
 * @param context - The call's context; only a proxied one has a receive time
 * @param timing - The call's timings
 * @param total - How long the call ran
 * @returns The split, or `undefined` for a call the proxy did not receive
 * @example
 * ```ts
 * proxyTimingOf(context, timing, performance.now() - timing.t0);
 * ```
 */
export function proxyTimingOf(
  context: Context | undefined,
  timing: TimingState,
  total: number,
): ProxySplit | undefined {
  if (context?.proxyReceiveAt == null) return undefined;
  return {
    clientToProxy: 0,
    proxyToBackend: total - timing.tFetch,
    backendToProxy: timing.tFetch,
    proxyToClient: 0,
  };
}

/** Emit onRequestEnd event with timing data + optional proxy timing */
export function emitRequestEnd(
  dCtx: StudioContext,
  result: { status: number; data: unknown; headers: Headers },
  requestHeaders: Headers,
  timing: TimingState,
  tMiddlewareTotal: number,
  context: Context | undefined,
): void {
  const tTotal = performance.now() - timing.t0;

  // Non-overlapping middleware self-time (exclude fetch + response validation)
  const tMiddleware =
    tMiddlewareTotal > 0
      ? Math.max(0, tMiddlewareTotal - timing.tFetch - timing.tRespValidation)
      : 0;
  const tValidation = timing.tVarValidation + timing.tRespValidation;

  const proxyTiming = proxyTimingOf(context, timing, tTotal);

  dCtx.dt.onRequestEnd?.({
    id: dCtx.requestId,
    status: result.status,
    data: result.data,
    size: estimateResponseSize(result.data, result.headers),
    headers: headersToObject(result.headers) ?? {},
    requestHeaders: headersToObject(requestHeaders) ?? {},
    timing: {
      total: tTotal,
      middleware: tMiddleware,
      fetch: timing.tFetch,
      validation: tValidation,
    },
    proxyTiming,
    ...(timing.shared && { shared: timing.shared }),
    timestamp: Date.now(),
  });
}

/** Attach fetch instrumentation hook to http client */
export function attachFetchHook(
  instance: { onBeforeFetch?: (method: string, url: string) => void },
  dCtx: StudioContext,
): void {
  instance.onBeforeFetch = (httpMethod, fullUrl) => {
    dCtx.dt.onHttpFetchStart?.({
      requestId: dCtx.requestId,
      url: fullUrl,
      method: normalizeHttpMethod(httpMethod),
      timestamp: Date.now(),
    });
  };
}

/** Inject timing headers for browser-side network measurement */
export function injectTimingHeaders(response: Response, requestId: string, t0: number): void {
  const tTotal = performance.now() - t0;
  response.headers.set("Server-Timing", `courier;dur=${tTotal.toFixed(1)}`);
  response.headers.set("X-Courier-Rid", requestId);
}
