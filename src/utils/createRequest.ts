import { NextResponse } from "next/server";

import { HTTPError } from "../error";
import { Instance } from "../instance/index";
import type { AnyMethods, BaseOptions, Context, HookInfo } from "../instance/types";
import type { Request } from "../RequestClass";
import type { AnyGroups } from "../types";
import {
  type CreateRequestOptionsType,
  getRequestOptions,
  headersToObject,
  isHeaders,
} from "./helpers";
import { getRequestHeaders, mergeHeaders } from "./merge-headers";

function createInstance(baseOption?: BaseOptions, context?: Context) {
  return new Instance(baseOption, context);
}

const formatResponse = (context: Context | undefined, response: InternalResponse) => {
  if (response.stream) {
    if (context?.res instanceof NextResponse) {
      return new Response(response.data as ReadableStream, {
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
    headers: getRequestHeaders(response.headers),
  };

  const data = response.rawData ? { ...baseResult, data: response.data } : response.data;

  if (context?.res instanceof NextResponse) {
    const jsonResponse =
      baseResult.status === 204
        ? new Response(data as BodyInit, baseResult)
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

export const createRequest = async (
  sources: Record<string, Request<AnyGroups | undefined>>,
  requestOptions: CreateRequestOptionsType,
  context?: Context,
) => {
  const { source, group, query, variables, options } = getRequestOptions(requestOptions);

  const { req: nextRequest, headers: nextHeaders } = context || {};

  const dataSource = typeof source === "string" ? sources?.[source] : undefined;

  if (!dataSource) {
    const jsonResponse = {
      success: false,
      message: `[${String(source)}]: source not found`,
    };

    const responseResult = {
      status: 400,
      headers: new Headers(),
      data: jsonResponse,
    };

    return formatResponse(context, {
      ...responseResult,
      throw: new HTTPError(responseResult),
      rawData: false,
    });
  }

  if (variables && typeof variables !== "object") {
    const jsonResponse = {
      success: false,
      message: "[variables] must be an object",
    };

    const responseResult = {
      status: 400,
      headers: new Headers(),
      data: jsonResponse,
    };

    return formatResponse(context, {
      ...responseResult,
      throw: new HTTPError(responseResult),
      rawData: false,
    });
  }

  const groupDataSource =
    typeof group === "string" && dataSource.options && "groups" in dataSource.options
      ? dataSource?.options?.groups?.[group]
      : undefined;

  const methodOptions = groupDataSource?.options;

  const method =
    typeof query === "string"
      ? (groupDataSource as AnyMethods)?.[query] || (dataSource as unknown as AnyMethods)?.[query]
      : undefined;

  if (typeof method !== "function") {
    const queryGroup = group ? `[${group}][${query}]` : `[${query}]`;
    const jsonResponse = {
      success: false,
      message: `[${String(source)}][${queryGroup}]: method not found`,
    };

    const responseResult = {
      status: 400,
      headers: new Headers(),
      data: jsonResponse,
    };

    return formatResponse(context, {
      ...responseResult,
      throw: new HTTPError(responseResult),
      rawData: false,
    });
  }

  const instance = createInstance(dataSource.options, context);

  const instanceOptions = typeof options === "object" ? options : {};
  const {
    rawData = false,
    passVars: passVariables = true,
    headers: kyHeaders,
    stream = false,
    ...kyOptions
  } = instanceOptions;

  const mergedNextHeaders = {
    ...headersToObject(nextRequest?.headers),
    ...headersToObject(nextHeaders),
  };

  const newHeaders = mergeHeaders(kyHeaders, mergedNextHeaders, dataSource.options?.extraHeaders);

  const hookInfo: HookInfo = {
    source: String(source),
    group: group ? String(group) : undefined,
    query: String(query),
    variables,
  };

  try {
    if (dataSource.options?.onRequest) {
      const modifiedInfo = await dataSource.options.onRequest(hookInfo);
      if (modifiedInfo) {
        Object.assign(hookInfo, modifiedInfo);
      }
    }

    const response = await method(
      instance.methodsInstance(
        {
          ...(passVariables ? { vars: variables } : {}),
          ...kyOptions,
          headers: newHeaders,
          stream,
        },
        methodOptions,
      ),
      variables,
    );

    const headers = isHeaders(response.headers) ? (response?.headers as Headers) : new Headers();

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

    return formatResponse(context, {
      headers,
      status: responseData.status,
      data: responseData.data,
      rawData,
      stream,
    });
  } catch (error) {
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
      await dataSource.options.onError(hookInfo, httpError);
    }

    return formatResponse(context, {
      ...responseResult,
      throw: httpError,
      rawData,
    });
  }
};

type InternalResponse = {
  status: number;
  headers: Headers;
  rawData: boolean;
  stream?: boolean;
  data?: Record<string, any> | unknown;
  throw?: unknown;
};
