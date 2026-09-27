import { parseWireOptions } from "../adapter/wire-options";
import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
import { composeMiddleware } from "../middleware/index";
import { generateRequestId, studioHooks } from "../studio";
import { handleExecuteError } from "./execute-error";
import { clientForCall } from "./execute-helpers";
import { executeInner } from "./execute-inner";
import { resolveMiddlewareChain, withCallerSignal, withEndpointTimeout } from "./execute-options";
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
import { refuseWireCall } from "./wire-refusal";

/**
 * What variables may be: named values, a list, a JSON scalar, form data or a
 * raw body. A function, a symbol or a bigint has no form on the wire.
 */
const SENDABLE: ReadonlySet<string> = new Set(["object", "string", "number", "boolean"]);

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
  const fromWire = context?.proxyMethod !== undefined;
  let options = given;
  if (fromWire) {
    const accepted = parseWireOptions(given);
    if (!accepted.ok) return buildErrorResponse(context, 400, accepted.reason);
    options = accepted.options;
  }

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

  const methodPath = group ? `[${String(group)}][${String(method)}]` : `[${String(method)}]`;
  const notFound = `[${String(source)}]${methodPath}: method not found`;

  /* A name that resolves to nothing is answered the same way whether the
     source or the method is the missing half. Saying which lets a caller
     enumerate the registry, and the sources worth finding that way are
     exactly the ones `expose: false` was meant to hide. A server-side caller
     is not guessing, so it keeps the message that names the real mistake. */
  if (!dataSource) {
    return buildErrorResponse(
      context,
      400,
      fromWire ? notFound : `[${String(source)}]: source not found`,
    );
  }
  if (variables !== undefined && variables !== null && !SENDABLE.has(typeof variables)) {
    return buildErrorResponse(context, 400, "[variables] must be a JSON value or a request body");
  }

  const {
    endpoint,
    endpointGroup,
    schema,
    options: endpointOptions,
  } = resolveEndpoint(dataSource, group, method);

  if (typeof endpoint !== "function") {
    return buildErrorResponse(context, 400, notFound);
  }

  if (context?.proxyMethod !== undefined) {
    const refused = refuseWireCall({
      dataSource,
      group,
      method,
      schema,
      stream: options?.stream,
      proxyMethod: context.proxyMethod,
      notFound,
    });
    if (refused) return buildErrorResponse(context, refused.status, refused.message);
  }

  /* A stream or a channel is reached by opening one, not by asking for it
     over HTTP. Without this an ordinary POST ran a channel's implementation
     factory, which expects a socket to talk to and has none. */
  if (schema?.transport && schema.transport !== "http") {
    return buildErrorResponse(
      context,
      400,
      `[${String(method)}]: endpoint is served over ${schema.transport}, not HTTP`,
    );
  }

  const instance = clientForCall(dataSource, context, schema?.type);
  if (hasStudio) attachFetchHook(instance, dCtx);

  const {
    rawData = false,
    forwardVariables = true,
    headers: baseHeaders,
    stream = false,
    ...baseOptions
  } = options ?? {};
  const callOptions = withCallerSignal(
    withEndpointTimeout(baseOptions, endpointOptions, context?.defaultTimeout),
    context?.req,
  );

  const middlewareCtx = buildMiddlewareContext({
    source,
    group,
    method,
    variables,
    baseHeaders,
    context,
    dataSource,
    requestId,
    endpointAllowedHeaders: endpointOptions?.allowedHeaders,
    kind: schema?.type,
    signal: callOptions.signal ?? undefined,
  });
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
        variables: middlewareCtx.variables,
        forwardVariables,
        baseOptions: callOptions,
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
      applyCacheHeaders(response, schema, middlewareCtx.headers, middlewareCtx.request);
    }

    return response;
  } catch (error) {
    return handleExecuteError(error, { requestId, dt, context, rawData });
  }
}
