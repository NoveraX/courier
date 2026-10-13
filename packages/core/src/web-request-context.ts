import { withIncomingRequest } from "./node-request-context";
import type { IncomingRequest, RelayedCookie } from "./session/incoming-request";
import { forwardedChain } from "./utils/forwarded-for";
import { parseUrl } from "./utils/parse-url";

/** What a framework built on Web-standard requests tells of one beyond the `Request`. */
export interface WebRequestOptions {
  /**
   * The address of the connection the request came on, or the one the
   * framework vouches for, where the runtime reports one. The chain a proxy
   * in front of the application recorded in `X-Forwarded-For` is kept
   * before it, as the proxy route keeps it.
   */
  readonly peerAddress?: string | undefined;
  /** The origin the user addressed, where the framework knows it better than the request's URL */
  readonly origin?: string | undefined;
  /** Hand a cookie to the browser with the response being prepared; absent, none can be */
  readonly setCookie?: ((cookie: RelayedCookie) => true | string) | undefined;
}

/**
 * A Web-standard request as the session reads it: its method, the origin
 * its URL names, its headers and the user's address — for a framework that
 * hands its handlers a `Request`, such as Hono, Astro or React Router.
 *
 * @param request - The request being served
 * @param options - Its peer address, its origin, and how a cookie reaches the browser
 * @returns The request, for `withIncomingRequest`
 * @example
 * ```ts
 * withIncomingRequest(webIncomingRequest(c.req.raw, { setCookie }), next);
 * ```
 */
export function webIncomingRequest(
  request: Request,
  options: WebRequestOptions = {},
): IncomingRequest {
  return {
    key: request,
    method: request.method,
    origin: options.origin ?? originOf(request.url),
    headers: request.headers,
    clientAddress: forwardedChain(options.peerAddress, request.headers.get("x-forwarded-for")),
    setCookie: options.setCookie,
  };
}

/**
 * Serve a Web-standard request with the user's session at hand: every call
 * `serve` makes, and every call made in what it awaits, takes the session
 * and the forwarded headers from `request`, and the cookies the APIs set
 * are added to the response `serve` answers with. A cookie set after that
 * response was handed back — while a page streams — cannot reach the
 * browser, and the log says so.
 *
 * @param request - The request being served
 * @param serve - What answers it
 * @param options - Its peer address and origin
 * @returns The response, with the cookies the APIs set
 * @example
 * ```ts
 * export const onRequest = (context, next) => withWebRequestContext(context.request, next);
 * ```
 */
export async function withWebRequestContext(
  request: Request,
  serve: () => Promise<Response>,
  options: Omit<WebRequestOptions, "setCookie"> = {},
): Promise<Response> {
  const cookies: string[] = [];
  let answered = false;
  const incoming = webIncomingRequest(request, {
    ...options,
    setCookie: ({ header }) => {
      if (answered) return "the response had already been handed back";
      cookies.push(header);
      return true;
    },
  });
  const response = await withIncomingRequest(incoming, serve);
  answered = true;
  return withSetCookies(response, cookies);
}

/**
 * A response with these `Set-Cookie` headers added: the response itself
 * where its headers can change, a copy where they cannot — one `fetch`
 * returned.
 *
 * @param response - The response
 * @param cookies - The `Set-Cookie` headers to add
 * @returns The response that carries them
 * @example
 * ```ts
 * return withSetCookies(await next(), ["sid=a1; Path=/; HttpOnly"]);
 * ```
 */
export function withSetCookies(response: Response, cookies: readonly string[]): Response {
  if (cookies.length === 0) return response;
  try {
    for (const cookie of cookies) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    /* Its headers are immutable — `fetch` returned it — so a copy carries them. */
    const copy = new Response(response.body, response);
    for (const cookie of cookies) copy.headers.append("set-cookie", cookie);
    return copy;
  }
}

function originOf(url: string): string | undefined {
  return parseUrl(url)?.origin;
}
