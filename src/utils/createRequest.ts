import { NextResponse } from "next/server";

import HTTPError from "../error";
import Instance from "../instance/index";
import type { AnyMethods, BaseOptions, Context, HookInfo } from "../instance/types";
import type { Request } from "../RequestClass";
import type { AnyGroups } from "../types";
import {
  type CreateRequestOptionsType,
  getRequestOptions,
  headersToObject,
  isHeaders,
} from "./helpers";
import mergeHeaders, { getRequestHeaders } from "./merge-headers";

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

  const newHeaders = mergeHeaders(kyHeaders, mergedNextHeaders);

  const hookInfo: HookInfo = {
    source: String(source),
    group: group ? String(group) : undefined,
    query: String(query),
    variables,
  };

  if (dataSource.options?.onRequest) {
    await dataSource.options.onRequest(hookInfo);
  }

  try {
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

    if (dataSource.options?.onResponse) {
      await dataSource.options.onResponse(hookInfo, {
        status: response?.status || 200,
        data: response.data,
      });
    }

    return formatResponse(context, {
      headers,
      status: response?.status || 200,
      data: response.data,
      rawData,
      stream,
    });
  } catch (error) {
    if (error instanceof HTTPError) {
      const responseResult = {
        status: error.status,
        headers: error.headers,
        data: error.data,
      };

      return formatResponse(context, {
        ...responseResult,
        throw: new HTTPError(responseResult),
        rawData,
      });
    }

    if (error instanceof Error) {
      const responseResult = {
        status: 500,
        headers: new Headers(),
        data: {
          success: false,
          message: error.message,
        },
      };

      return formatResponse(context, {
        ...responseResult,
        throw: new HTTPError(responseResult),
        rawData,
      });
    }

    return formatResponse(context, {
      status: 500,
      headers: new Headers(),
      data: {
        success: false,
        message: "[SERVER ERROR]",
      },
      throw: error,
      rawData,
    });
  }
};

export default createRequest;

type InternalResponse = {
  status: number;
  headers: Headers;
  rawData: boolean;
  stream?: boolean;
  data?: Record<string, any> | unknown;
  throw?: unknown;
};
