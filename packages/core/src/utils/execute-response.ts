import { HTTPError } from "../errors";
import type { Context } from "../http-client/types";
import { filterResponseHeaders } from "./merge-headers";
import { toWireAnswer } from "./wire-answer";

export type InternalResponse = {
  status: number;
  headers: Headers;
  rawData: boolean;
  stream?: boolean;
  data?: unknown;
  throw?: unknown;
  /** Header names the endpoint and its source carry across the proxy. */
  namedHeaders?: readonly string[];
};

/**
 * What every streamed proxy answer carries, whatever the upstream sent.
 *
 * A streamed body keeps the upstream's content type and is served from the
 * application's origin, so a proxy URL opened as a page rendered it there: an
 * HTML or SVG answer ran its script as the application, with the user's
 * cookies. The sandbox gives such a page an opaque origin and no scripts,
 * `default-src 'none'` lets it load nothing, and `nosniff` keeps a browser
 * from deciding that a body the upstream called text is HTML. A caller that
 * reads the stream through `fetch` sees no difference.
 */
const STREAMED_ANSWER_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
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
      const headers = filterResponseHeaders(response.headers, {
        streamed: true,
        named: response.namedHeaders,
      });
      for (const [name, value] of Object.entries(STREAMED_ANSWER_HEADERS)) headers.set(name, value);
      return withUpstreamCookies(
        new Response(response.data, {
          status: response.status,
          headers: withUpstreamLength(headers, response.headers),
        }),
        response.headers,
        response.namedHeaders,
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
    const answer = toWireAnswer(
      response.status,
      filterResponseHeaders(response.headers, { named: response.namedHeaders }),
      response.data,
      response.rawData,
    );
    return withUpstreamCookies(answer, response.headers, response.namedHeaders);
  }

  if (response.throw) {
    throw response.throw;
  }

  /* The allowlist keeps what an upstream sends away from a browser on the
     other side of the proxy. A direct caller is not on the other side — it
     made the request — and filtering its `.raw` took away the pagination
     headers, the content type and the cookies it was reading. */
  /* A success may carry `undefined` — a response parser or an
     after-middleware can produce it — and it used to be thrown as an
     "Unknown error". */
  return response.rawData
    ? { status: response.status, headers: response.headers, data: response.data }
    : response.data;
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
 * Pass on the cookies the upstream set, where the endpoint names `set-cookie`.
 *
 * Passed on for every endpoint, an upstream a source points at — a third
 * party's included — could set cookies on the application's own origin. The
 * header allowlist leaves `set-cookie` out, so that each cookie stays a
 * value of its own, and every answer appends them here; a streamed answer
 * once did not, and lost every cookie a sign-in set.
 */
function withUpstreamCookies(
  target: Response,
  upstream: Headers | undefined,
  named: readonly string[] | undefined,
): Response {
  if (!named?.some((name) => name.toLowerCase() === "set-cookie")) return target;
  for (const cookie of upstream?.getSetCookie() ?? []) target.headers.append("set-cookie", cookie);
  return target;
}

/**
 * Pass on the length of a body that goes through unchanged.
 *
 * Fetch has already decompressed an encoded body, so its declared length
 * counts bytes the browser never receives and is left out.
 */
function withUpstreamLength(target: Headers, upstream: Headers): Headers {
  const length = upstream.get("content-length");
  if (length !== null && !upstream.has("content-encoding")) target.set("content-length", length);
  return target;
}
