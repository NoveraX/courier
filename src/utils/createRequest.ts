import { NextResponse } from "next/server";
import type { Sources } from "../define/types";
import { HTTPError } from "../error";
import { HttpClient } from "../instance/index";
import type { AnyEndpoints, BaseOptions, Context } from "../instance/types";
import { composeMiddleware } from "../middleware/index";
import type { MiddlewareContext, MiddlewareResponse } from "../middleware/types";
import {
  ENDPOINT_SCHEMA,
  type SchemaMetadata,
  ValidationError,
  validateSchema,
} from "../validation";
import {
  headersToObject,
  isHeaders,
  parseRequestPayload,
  type RequestPayloadInput,
} from "./helpers";
import { filterHeaders, mergeHeaders } from "./merge-headers";

function createHttpClient(baseOption?: BaseOptions, context?: Context) {
  return new HttpClient(baseOption, context);
}

const isEndpointFn = (value: unknown): value is AnyEndpoints[string] => typeof value === "function";

const getEndpoint = (target: object, name: string): AnyEndpoints[string] | undefined => {
  if (!(name in target)) return undefined;
  // object has no index signature; in-narrowing validates property exists
  const endpoint = (target as Record<string, unknown>)[name];
  return isEndpointFn(endpoint) ? endpoint : undefined;
};

const buildErrorResponse = (
  context: Context | undefined,
  status: number,
  message: string,
): ReturnType<typeof buildResponse> => {
  const result = {
    status,
    headers: new Headers(),
    data: { success: false, message },
  };

  return buildResponse(context, {
    ...result,
    throw: new HTTPError(result),
    rawData: false,
  });
};

const buildResponse = (context: Context | undefined, response: InternalResponse) => {
  if (response.stream) {
    if (context?.res instanceof NextResponse && response.data instanceof ReadableStream) {
      return new Response(response.data, {
        status: response.status,
        headers: response.headers,
      });
    }

    if (response.throw) {
      throw response.throw;
    }

    return { status: response.status, headers: response.headers, data: response.data };
  }

  const baseResult = {
    status: response.status,
    headers: filterHeaders(response.headers),
  };

  const data = response.rawData ? { ...baseResult, data: response.data } : response.data;

  if (context?.res instanceof NextResponse) {
    const jsonResponse =
      baseResult.status === 204
        ? new Response(null, baseResult)
        : NextResponse.json(data, baseResult);

    if (response.headers?.has("set-cookie")) {
      for (const cookie of response.headers.getSetCookie()) {
        jsonResponse.headers.append("set-cookie", cookie);
      }
    }

    return jsonResponse;
  }

  if (response.throw) {
    throw response.throw;
  }

  if (response.data !== undefined) {
    return data;
  }

  throw new Error("Unknown error");
};

export async function executeRequest(
  sources: Sources,
  requestPayload: RequestPayloadInput,
  context: Context & { res: NextResponse },
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
) {
  const { source, group, method, variables, options } = parseRequestPayload(requestPayload);

  const { req: nextRequest, headers: nextHeaders } = context || {};

  const dataSource =
    typeof source === "string" && Object.hasOwn(sources, source) ? sources[source] : undefined;

  if (!dataSource) {
    return buildErrorResponse(context, 400, `[${String(source)}]: source not found`);
  }

  if (variables && typeof variables !== "object") {
    return buildErrorResponse(context, 400, "[variables] must be an object");
  }

  const endpointGroup =
    typeof group === "string" && dataSource.options && "groups" in dataSource.options
      ? dataSource?.options?.groups?.[group]
      : undefined;

  const groupOptions = endpointGroup?.options;

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

  // GET proxy: only allow endpoints explicitly marked as "query"
  if (context?.proxyMethod === "GET" && schema?.type !== "query") {
    return buildErrorResponse(context, 405, "This endpoint does not support GET requests");
  }

  const instance = createHttpClient(dataSource.options, context);

  const instanceOptions = options ?? {};
  const {
    rawData = false,
    forwardVariables = true,
    headers: kyHeaders,
    stream = false,
    ...kyOptions
  } = instanceOptions;

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

  try {
    if (schema?.variables) {
      middlewareCtx.variables = await validateSchema(
        schema.variables,
        middlewareCtx.variables,
        "variables",
      );
    }

    const execute = async (): Promise<MiddlewareResponse> => {
      const vars = middlewareCtx.variables as FormData | Record<string, unknown> | undefined;

      const response = await endpoint(
        instance.createMethods(
          {
            ...(forwardVariables ? { variables: vars } : {}),
            ...kyOptions,
            headers: middlewareCtx.headers,
            stream,
          },
          groupOptions,
        ),
        vars,
      );

      const headers = isHeaders(response.headers) ? response.headers : new Headers();
      let data = response.data;
      const status = response?.status || 200;

      if (schema?.response) {
        data = await validateSchema(schema.response, data, "response");
      }

      return { status, data, headers };
    };

    const middlewares = dataSource.options?.middleware;
    const result = middlewares?.length
      ? await composeMiddleware(middlewares)(middlewareCtx, execute)
      : await execute();

    const response = buildResponse(context, {
      headers: result.headers,
      status: result.status,
      data: result.data,
      rawData,
      stream,
    });

    // Add cache headers after buildResponse (filterHeaders strips non-allowed headers)
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
    if (error instanceof ValidationError) {
      const responseResult = {
        status: 422,
        headers: new Headers(),
        data: {
          success: false,
          message: error.message,
          target: error.target,
          issues: error.issues,
        },
      };

      return buildResponse(context, {
        ...responseResult,
        throw: error,
        rawData,
      });
    }

    const responseResult =
      error instanceof HTTPError
        ? { status: error.status, headers: error.headers, data: error.data }
        : {
            status: 500,
            headers: new Headers(),
            data:
              error instanceof Error
                ? { success: false, message: error.message }
                : { success: false, message: "[SERVER ERROR]" },
          };

    const httpError = new HTTPError(responseResult);

    return buildResponse(context, {
      ...responseResult,
      throw: httpError,
      rawData,
    });
  }
}

type InternalResponse = {
  status: number;
  headers: Headers;
  rawData: boolean;
  stream?: boolean;
  data?: unknown;
  throw?: unknown;
};
