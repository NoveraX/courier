import type { Sources } from "../define/types";
import { devtoolsHooks, generateRequestId } from "../devtools";
import type { Context } from "../http-client/types";
import { composeMiddleware } from "../middleware/index";
import type { MiddlewareContext, MiddlewareResponse } from "../middleware/types";
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../validation";
import { handleExecuteError } from "./execute-error";
import { createHttpClient, getEndpoint } from "./execute-helpers";
import { buildErrorResponse, buildResponse } from "./execute-response";
import { validateResponse, validateVariables } from "./execute-validation";
import { headersToObject, isHeaders } from "./helpers";
import { mergeHeaders } from "./merge-headers";
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
  const dt = devtoolsHooks;
  const hasDevtools = dt.onRequestStart !== undefined;
  const requestId = hasDevtools ? generateRequestId() : "";
  const t0 = hasDevtools ? performance.now() : 0;
  let tValidation = 0;

  const dataSource =
    typeof source === "string" && Object.hasOwn(sources, source) ? sources[source] : undefined;

  if (!dataSource) return buildErrorResponse(context, 400, `[${String(source)}]: source not found`);

  if (variables && typeof variables !== "object") {
    return buildErrorResponse(context, 400, "[variables] must be an object");
  }

  const endpointGroup =
    typeof group === "string" && dataSource.options && "groups" in dataSource.options
      ? dataSource?.options?.groups?.[group]
      : undefined;

  const endpoint =
    typeof method === "string"
      ? (endpointGroup && getEndpoint(endpointGroup, method)) || getEndpoint(dataSource, method)
      : undefined;

  if (typeof endpoint !== "function") {
    const methodPath = group ? `[${group}][${method}]` : `[${method}]`;
    return buildErrorResponse(context, 400, `[${String(source)}][${methodPath}]: method not found`);
  }

  const schema = (endpoint as unknown as Record<symbol, SchemaMetadata | undefined>)[
    ENDPOINT_SCHEMA
  ];

  if (context?.proxyMethod === "GET" && schema?.type !== "query") {
    return buildErrorResponse(context, 405, "This endpoint does not support GET requests");
  }

  const instance = createHttpClient(dataSource.options, context);
  const {
    rawData = false,
    forwardVariables = true,
    headers: kyHeaders,
    stream = false,
    ...kyOptions
  } = options ?? {};
  const { req: nextRequest, headers: nextHeaders } = context || {};

  const mergedNextHeaders = {
    ...headersToObject(nextRequest?.headers),
    ...headersToObject(nextHeaders),
  };
  const newHeaders = mergeHeaders(kyHeaders, mergedNextHeaders, dataSource.options?.allowedHeaders);

  const middlewareCtx: MiddlewareContext = {
    source: String(source),
    group: group ? String(group) : undefined,
    method: String(method),
    variables,
    headers: newHeaders,
  };

  const mode = context?.res instanceof Response ? "proxy" : "direct";
  const validationCtx = { hasDevtools, requestId, dt };

  dt.onRequestStart?.({
    id: requestId,
    source: String(source),
    group: group ? String(group) : undefined,
    method: String(method),
    variables,
    mode,
    middlewareCount: dataSource.options?.middleware?.length ?? 0,
    hasValidation: { variables: !!schema?.variables, response: !!schema?.response },
    timestamp: t0,
  });

  try {
    if (schema?.variables) {
      const result = await validateVariables(
        schema.variables,
        middlewareCtx.variables,
        validationCtx,
      );
      middlewareCtx.variables = result.validated;
      tValidation += result.duration;
    }

    const execute = async (): Promise<MiddlewareResponse> => {
      const vars = middlewareCtx.variables as FormData | Record<string, unknown> | undefined;
      const ft0 = hasDevtools ? performance.now() : 0;
      dt.onHttpFetchStart?.({
        requestId,
        url: dataSource.options?.baseURL ?? "",
        method: String(method),
        timestamp: ft0,
      });

      let response: Awaited<ReturnType<typeof endpoint>>;
      try {
        response = await endpoint(
          instance.createMethods(
            {
              ...(forwardVariables ? { variables: vars } : {}),
              ...kyOptions,
              headers: middlewareCtx.headers,
              stream,
            },
            endpointGroup?.options,
          ),
          vars,
        );
      } catch (fetchError) {
        dt.onHttpFetchError?.({
          requestId,
          message: fetchError instanceof Error ? fetchError.message : String(fetchError),
          timestamp: performance.now(),
        });
        throw fetchError;
      }

      dt.onHttpFetchEnd?.({
        requestId,
        status: response?.status || 200,
        duration: hasDevtools ? performance.now() - ft0 : 0,
        timestamp: performance.now(),
      });

      const headers = isHeaders(response.headers) ? response.headers : new Headers();
      let data = response.data;
      const status = response?.status || 200;

      if (schema?.response) {
        const result = await validateResponse(schema.response, data, validationCtx);
        data = result.validated;
        tValidation += result.duration;
      }

      return { status, data, headers };
    };

    const middlewares = dataSource.options?.middleware;
    const mt0 = hasDevtools ? performance.now() : 0;
    const result = middlewares?.length
      ? await composeMiddleware(middlewares)(middlewareCtx, execute)
      : await execute();
    const tMiddleware = hasDevtools && middlewares?.length ? performance.now() - mt0 : 0;

    dt.onRequestEnd?.({
      id: requestId,
      status: result.status,
      data: result.data,
      headers: headersToObject(result.headers) ?? {},
      requestHeaders: headersToObject(middlewareCtx.headers) ?? {},
      timing: {
        total: hasDevtools ? performance.now() - t0 : 0,
        middleware: tMiddleware,
        fetch: 0,
        validation: tValidation,
      },
      timestamp: performance.now(),
    });

    const response = buildResponse(context, {
      headers: result.headers,
      status: result.status,
      data: result.data,
      rawData,
      stream,
    });

    if (context?.proxyMethod === "GET" && schema?.cache && response instanceof Response) {
      if (schema.cache.revalidate !== undefined) {
        response.headers.set(
          "Cache-Control",
          `s-maxage=${schema.cache.revalidate}, stale-while-revalidate`,
        );
      }
      if (schema.cache.tags?.length) {
        response.headers.set("x-nexus-tags", schema.cache.tags.join(","));
      }
    }

    return response;
  } catch (error) {
    return handleExecuteError(error, { requestId, dt, context, rawData });
  }
}
