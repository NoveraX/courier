import type { IncomingRequest, RelayedCookie } from "@noverax/courier";
import { createLogger } from "@noverax/courier";
import { webIncomingRequest, withIncomingRequest } from "@noverax/courier/node";

const log = createLogger("Astro");

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

/** The parts of Astro's middleware context the session reads. */
export interface AstroRequestContext {
  request: Request;
  url: URL;
  cookies: { set(name: string, value: string, options: AstroCookieOptions): void };
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
 * An Astro request as the session reads it.
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
      peerAddress: clientAddressOf(context),
    }),
    setCookie: (relayed) => setCookieIn(context, relayed),
  };
}

function clientAddressOf(context: AstroRequestContext): string | undefined {
  try {
    return context.clientAddress;
  } catch (error) {
    /* A page built ahead of time has no client, and some adapters cannot tell. */
    log.debug("The adapter gave no client address", error);
    return undefined;
  }
}

function setCookieIn(context: AstroRequestContext, { cookie }: RelayedCookie): true | string {
  try {
    context.cookies.set(cookie.name, cookie.value, optionsOf(cookie));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      /already been sent|ResponseSent/i.test(`${error.name} ${error.message}`)
    )
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
