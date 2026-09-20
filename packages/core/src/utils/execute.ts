import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
import { composeMiddleware } from "../middleware/index";
import { generateRequestId, studioHooks } from "../studio";
import { handleExecuteError } from "./execute-error";
import { createHttpClient } from "./execute-helpers";
import { executeInner } from "./execute-inner";
import { resolveMiddlewareChain, withEndpointTimeout } from "./execute-options";
import { applyCacheHeaders, buildMiddlewareContext, resolveEndpoint } from "./execute-resolve";
import { buildErrorResponse, buildResponse } from "./execute-response";
import {
  attachFetchHook,
  emitRequestEnd,
  emitRequestStart,
  injectTimingHeaders,
  type TimingState,
} from "./execute-studio";
import { validateVariables } from "./execute-validation";
import { parseRequestPayload, type RequestPayloadInput } from "./request-payload";

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
  const { source, group, method, variables, options } = parseRequestPayload(requestPayload);
  const dt = studioHooks;
  const hasStudio = dt.onRequestStart !== undefined;
  const requestId = hasStudio ? generateRequestId() : "";
  const timing: TimingState = {
    t0: hasStudio ? performance.now() : 0,
    tVarValidation: 0,
    tRespValidation: 0,
    tFetch: 0,
  };
  const dCtx = { hasStudio, requestId, dt };

  const dataSource =
    typeof source === "string" && Object.hasOwn(sources, source) ? sources[source] : undefined;

  if (!dataSource) return buildErrorResponse(context, 400, `[${String(source)}]: source not found`);
  if (variables && typeof variables !== "object") {
    return buildErrorResponse(context, 400, "[variables] must be an object");
  }

  const {
    endpoint,
    endpointGroup,
    schema,
    options: endpointOptions,
  } = resolveEndpoint(dataSource, group, method);

  if (typeof endpoint !== "function") {
    const methodPath = group ? `[${group}][${method}]` : `[${method}]`;
    return buildErrorResponse(context, 400, `[${String(source)}][${methodPath}]: method not found`);
  }

  if (context?.proxyMethod === "GET" && schema?.type !== "query") {
    return buildErrorResponse(context, 405, "This endpoint does not support GET requests");
  }

  const instance = createHttpClient(dataSource.options, context);
  if (hasStudio) attachFetchHook(instance, dCtx);

  const {
    rawData = false,
    forwardVariables = true,
    headers: baseHeaders,
    stream = false,
    ...baseOptions
  } = options ?? {};

  const middlewareCtx = buildMiddlewareContext(
    source,
    group,
    method,
    variables,
    baseHeaders,
    context,
    dataSource,
    requestId,
    undefined,
    endpointOptions?.allowedHeaders,
  );
  const mode = context?.mode ?? (context?.proxyMethod ? "proxy" : "direct");

  /* Source-level middleware wraps endpoint-level, so a concern declared once
     for the whole API still sees a request an endpoint also decorated. A
     retry policy is the outermost of the endpoint's own, so it re-runs them. */
  const middlewares = resolveMiddlewareChain(dataSource.options?.middleware, endpointOptions);

  emitRequestStart(dCtx, source, group, method, variables, mode, middlewares.length, schema);

  try {
    if (schema?.variables) {
      const result = await validateVariables(schema.variables, middlewareCtx.variables, dCtx);
      middlewareCtx.variables = result.validated;
      timing.tVarValidation = result.duration;
    }

    const execute = async () => {
      const innerResult = await executeInner({
        endpoint: endpoint as (
          ...args: unknown[]
        ) => Promise<{ status?: number; data: unknown; headers?: unknown }>,
        instance,
        endpointGroupOptions: endpointGroup?.options,
        middlewareHeaders: middlewareCtx.headers,
        variables: middlewareCtx.variables as FormData | Record<string, unknown> | undefined,
        forwardVariables,
        baseOptions: withEndpointTimeout(baseOptions, endpointOptions),
        stream,
        schema,
        hasStudio,
        requestId,
        dt,
      });
      timing.tFetch = innerResult.tFetch;
      timing.tRespValidation = innerResult.tRespValidation;
      return innerResult.response;
    };

    const mt0 = hasStudio ? performance.now() : 0;
    const result = middlewares.length
      ? await composeMiddleware(middlewares)(middlewareCtx, execute)
      : await execute();
    const tMiddlewareTotal = hasStudio && middlewares.length ? performance.now() - mt0 : 0;

    if (hasStudio) {
      emitRequestEnd(dCtx, result, middlewareCtx.headers, timing, tMiddlewareTotal, context);
    }

    const response = buildResponse(context, {
      headers: result.headers,
      status: result.status,
      data: result.data,
      rawData,
      stream,
    });

    if (context?.proxyMethod && response instanceof Response && hasStudio) {
      injectTimingHeaders(response, requestId, timing.t0);
    }
    if (context?.proxyMethod === "GET" && schema?.cache && response instanceof Response) {
      applyCacheHeaders(response, schema);
    }

    return response;
  } catch (error) {
    return handleExecuteError(error, { requestId, dt, context, rawData });
  }
}
