import type { Context } from "../http-client/types";
import type { StudioHooks } from "../studio";
import { describeFormData } from "../studio/describe-form-data";
import type { SchemaMetadata } from "../validation";
import { estimateResponseSize, headersToObject, isFormData, normalizeHttpMethod } from "./helpers";

export type TimingState = {
  t0: number;
  tVarValidation: number;
  tRespValidation: number;
  tFetch: number;
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
    timestamp: Date.now(),
  });
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

  const proxyReceiveAt = context?.proxyReceiveAt;
  const proxyTiming =
    proxyReceiveAt != null
      ? {
          clientToProxy: 0,
          proxyToBackend: tTotal - timing.tFetch,
          backendToProxy: timing.tFetch,
          proxyToClient: 0,
        }
      : undefined;

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
