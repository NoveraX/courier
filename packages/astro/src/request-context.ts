import {
  cookieHeaderAfter,
  isError,
  parseSetCookie,
  type SetCookie,
} from "@noverax/courier/internal";
import { webIncomingRequest, withIncomingRequest } from "@noverax/courier/node";
import type { IncomingRequest, RelayedCookie } from "@noverax/courier/server";
import { astroClientAddress } from "./client-address";

/** A cookie's options, as Astro's `cookies.set()` takes them. */
interface AstroCookieOptions {
  path: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "strict" | "lax" | "none";
  partitioned?: boolean;
  encode: (value: string) => string;
}

/** The parts of Astro's `cookies` the session uses. */
interface AstroCookies {
  set(name: string, value: string, options: AstroCookieOptions): void;
  /** The `Set-Cookie` headers of the cookies set or deleted while the request is served */
  headers(): Iterable<string>;
}

/** The parts of Astro's middleware context the session reads. */
export interface AstroRequestContext {
  request: Request;
  url: URL;
  cookies: AstroCookies;
  readonly clientAddress: string;
}

/**
 * Astro middleware that serves the rest of each request with its session
 * and headers at hand: every call a page's frontmatter, an endpoint, an
 * action or a step it awaits makes takes them from the request — for the
 * APIs that keep a `session` or `forward` headers — and the session cookies
 * the API sets reach the browser through `cookies`, as a page's own do.
 *
 * It keeps the request in `AsyncLocalStorage`, which Node provides, and
 * Cloudflare with the `nodejs_compat` flag. A page built ahead of time has
 * no request, and its calls carry no one's session.
 *
 * @returns The middleware, to export as `onRequest` or put in a `sequence`
 * @example
 * ```ts
 * // src/middleware.ts
 * import { requestContext } from "@noverax/courier-astro/request-context";
 *
 * export const onRequest = requestContext();
 * ```
 */
export function requestContext(): (
  context: AstroRequestContext,
  next: () => Promise<Response>,
) => Promise<Response> {
  return (context, next) => withIncomingRequest(astroIncomingRequest(context), next);
}

/**
 * An Astro request as the session reads it. Each call sends the request's
 * cookies as `cookies` holds them when it is made: one the request's code
 * set goes as Astro writes it to the browser, one it deleted goes not, and
 * each other goes byte for byte as the browser sent it.
 *
 * @param context - The middleware's context
 * @returns The request, for `withIncomingRequest`
 * @example
 * ```ts
 * withIncomingRequest(astroIncomingRequest(context), next);
 * ```
 */
export function astroIncomingRequest(context: AstroRequestContext): IncomingRequest {
  return {
    ...webIncomingRequest(context.request, {
      origin: context.url.origin,
      peerAddress: astroClientAddress(context),
    }),
    cookieHeader: () => cookiesHeld(context),
    setCookie: (relayed) => setCookieIn(context, relayed),
  };
}

/* The request's cookies as `cookies` holds them: those it came with, and each set or deleted since
   as Astro writes it to the browser, a deletion as a cookie long expired. */
function cookiesHeld(context: AstroRequestContext): string {
  const sent = context.request.headers.get("cookie") ?? "";
  const written: SetCookie[] = [];
  for (const header of context.cookies.headers()) {
    const cookie = parseSetCookie(header);
    if (cookie !== undefined) written.push(cookie);
  }
  return written.length === 0 ? sent : cookieHeaderAfter(sent, written);
}

function setCookieIn(context: AstroRequestContext, { cookie }: RelayedCookie): true | string {
  try {
    context.cookies.set(cookie.name, cookie.value, optionsOf(cookie));
    return true;
  } catch (error) {
    if (isError(error) && /already been sent|ResponseSent/i.test(`${error.name} ${error.message}`))
      return "the response had already been sent";
    throw error;
  }
}

function optionsOf(cookie: RelayedCookie["cookie"]): AstroCookieOptions {
  return {
    path: cookie.path ?? "/",
    ...(cookie.domain !== undefined && { domain: cookie.domain }),
    ...(cookie.expires !== undefined && { expires: new Date(cookie.expires) }),
    ...(cookie.maxAge !== undefined && { maxAge: cookie.maxAge }),
    secure: cookie.secure === true,
    httpOnly: cookie.httpOnly === true,
    ...(cookie.sameSite !== undefined && { sameSite: lower(cookie.sameSite) }),
    ...(cookie.partitioned && { partitioned: true }),
    /* The value is passed on as the API wrote it; Astro would encode it again. */
    encode: (value) => value,
  };
}

function lower<TValue extends string>(value: TValue): Lowercase<TValue> {
  return value.toLowerCase() as Lowercase<TValue>;
}
