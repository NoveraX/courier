import { NextResponse } from "next/server";
import type { Sources } from "../define/types";
import { HTTPError } from "../error";
import { HttpClient } from "../instance/index";
import type { AnyEndpoints, BaseOptions, Context, HookInfo } from "../instance/types";
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

const buildValidationError = (
  context: Context | undefined,
  message: string,
): ReturnType<typeof buildResponse> => {
  const responseResult = {
    status: 400,
    headers: new Headers(),
    data: { success: false, message },
  };

  return buildResponse(context, {
    ...responseResult,
    throw: new HTTPError(responseResult),
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
    return buildValidationError(context, `[${String(source)}]: source not found`);
  }

  if (variables && typeof variables !== "object") {
    return buildValidationError(context, "[variables] must be an object");
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
    return buildValidationError(context, `[${String(source)}][${methodPath}]: method not found`);
  }

  const schema = (endpoint as unknown as Record<symbol, SchemaMetadata | undefined>)[
    ENDPOINT_SCHEMA
  ];

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

  const hookInfo: HookInfo = {
    source: String(source),
    group: group ? String(group) : undefined,
    method: String(method),
    variables,
  };

  try {
    if (schema?.variables) {
      hookInfo.variables = await validateSchema(schema.variables, hookInfo.variables, "variables");
    }

    if (dataSource.options?.onRequest) {
      const modifiedInfo = await dataSource.options.onRequest(hookInfo);
      if (modifiedInfo) {
        Object.assign(hookInfo, modifiedInfo);
      }
    }

    const response = await endpoint(
      instance.createMethods(
        {
          ...(forwardVariables ? { variables } : {}),
          ...kyOptions,
          headers: newHeaders,
          stream,
        },
        groupOptions,
      ),
      variables,
    );

    const headers = isHeaders(response.headers) ? response.headers : new Headers();

    const responseData = {
      status: response?.status || 200,
      data: response.data,
    };

    if (dataSource.options?.onResponse) {
      const transformed = await dataSource.options.onResponse(hookInfo, responseData);
      if (transformed) {
        responseData.status = transformed.status;
        responseData.data = transformed.data;
      }
    }

    if (schema?.response) {
      responseData.data = await validateSchema(schema.response, responseData.data, "response");
    }

    return buildResponse(context, {
      headers,
      status: responseData.status,
      data: responseData.data,
      rawData,
      stream,
    });
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

    if (dataSource.options?.onError) {
      try {
        await dataSource.options.onError(hookInfo, httpError);
      } catch {
        // prevent onError from propagating and masking the original error
      }
    }

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
