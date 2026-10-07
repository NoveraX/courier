import type { Context } from "../http-client/types";
import { forwardedFor } from "../utils/forwarded-for";
import { addressedOrigin } from "./addressed-origin";
import type { IncomingRequest } from "./incoming-request";

/**
 * The request a caller named in its context, as the session reads it: the
 * proxy's own request, or one server code passed with `context: { req }`.
 * Headers passed as `context.headers` lie over the request's own; passed
 * alone, they are all there is, and the method that brought them is not
 * known — so it is read as a page's.
 *
 * @param context - The call's context
 * @returns The request, or `undefined` when the context names none
 * @example
 * ```ts
 * incomingFromContext({ req: request })?.origin; // "https://app.example.com"
 * ```
 */
export function incomingFromContext(context: Context | undefined): IncomingRequest | undefined {
  const request = context?.req;
  const extra = context?.headers;
  if (request === undefined && extra === undefined) return undefined;
  const headers = request && extra ? overlay(request.headers, extra) : (extra ?? request?.headers);
  if (headers === undefined) return undefined;
  return {
    key: request ?? headers,
    method: request?.method,
    origin: request ? requestOrigin(request) : addressedOrigin(headers),
    headers,
    clientAddress: request ? forwardedFor(request) : undefined,
  };
}

function overlay(base: Headers, over: Headers): Headers {
  const merged = new Headers(base);
  over.forEach((value, name) => {
    merged.set(name, value);
  });
  return merged;
}

/* An adapter hands the proxy a request whose URL the client addressed. */
function requestOrigin(request: Request): string | undefined {
  return URL.canParse(request.url) ? new URL(request.url).origin : undefined;
}
