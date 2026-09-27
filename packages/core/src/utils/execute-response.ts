import { HTTPError } from "../errors";
import { isBodilessStatus } from "../http-client/response";
import type { Context } from "../http-client/types";
import { filterResponseHeaders } from "./merge-headers";

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
      /* The upstream's own headers went straight to the browser here, so a
         streamed answer disclosed whatever the upstream attached to it. The
         body passes through unchanged, so its content type travels with it. */
      return withUpstreamCookies(
        new Response(response.data, {
          status: response.status,
          headers: filterResponseHeaders(response.headers, { streamed: true }),
        }),
        response.headers,
      );
    }

    if (response.throw) {
      throw response.throw;
    }

    /* The unread body, or with `.raw` the response around it — the same two
       shapes the proxy client resolves to. */
    return response.rawData
      ? { status: response.status, headers: response.headers, data: response.data }
      : response.data;
  }

  if (context?.res instanceof Response) {
    const baseResult = {
      status: response.status,
      headers: filterResponseHeaders(response.headers),
    };
    /* JSON has no Headers, so the raw envelope carries them as a plain
       object; serialized as they were, they arrived as `{}`. */
    const body = response.rawData
      ? { ...baseResult, headers: Object.fromEntries(baseResult.headers), data: response.data }
      : response.data;
    const jsonResponse = isBodilessStatus(baseResult.status)
      ? new Response(null, baseResult)
      : Response.json(body, baseResult);
    return withUpstreamCookies(jsonResponse, response.headers);
  }

  if (response.throw) {
    throw response.throw;
  }

  /* The allowlist keeps what an upstream sends away from a browser on the
     other side of the proxy. A direct caller is not on the other side — it
     made the request — and filtering its `.raw` took away the pagination
     headers, the content type and the cookies it was reading. */
  const data = response.rawData
    ? { status: response.status, headers: response.headers, data: response.data }
    : response.data;

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

/**
 * Pass on the cookies the upstream set.
 *
 * The header allowlist leaves `set-cookie` out, so each answer appends them
 * itself; a streamed answer did not, and lost every cookie the upstream set.
 */
function withUpstreamCookies(target: Response, upstream: Headers | undefined): Response {
  for (const cookie of upstream?.getSetCookie() ?? []) target.headers.append("set-cookie", cookie);
  return target;
}
