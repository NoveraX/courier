import { HTTPError } from "../error";
import type { Context } from "../http-client/types";
import { filterHeaders } from "./merge-headers";

export type InternalResponse = {
  status: number;
  headers: Headers;
  rawData: boolean;
  stream?: boolean;
  data?: unknown;
  throw?: unknown;
};

export const buildResponse = (
  context: Context | undefined,
  response: InternalResponse,
): unknown => {
  if (response.stream) {
    if (context?.res instanceof Response && response.data instanceof ReadableStream) {
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

  if (context?.res instanceof Response) {
    const jsonResponse =
      baseResult.status === 204 ? new Response(null, baseResult) : Response.json(data, baseResult);

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

export const buildErrorResponse = (
  context: Context | undefined,
  status: number,
  message: string,
): unknown => {
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
